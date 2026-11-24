import { z } from 'zod';
import { db, first } from './db';
import { DeskError, required } from './errors';
import { getProject } from './core';
import { integration, RemoteError } from './remote';
import type { habenContactInput } from './contracts';

const offerSchema = z.object({
  id: z.uuid(), number: z.string().nullable().optional(), contactId: z.uuid().nullable().optional(),
  listStatus: z.enum(['entwurf','offen','abgelaufen','angenommen','abgelehnt','abgerechnet']),
  invoiceNumber: z.string().nullable().optional(), invoiceId: z.uuid().nullable().optional(),
});
const contactSchema = z.object({
  id: z.uuid(), name: z.string(), email: z.string().nullable().optional(), telefon: z.string().nullable().optional(),
  archived: z.boolean().optional(),
});
type RemoteContact = z.infer<typeof contactSchema>;
type Fields = { name: string; email: string; phone: string };
type Local = Fields & { id: string; haben_id: string | null; haben_baseline: Fields | null; haben_export_pending: boolean };

export async function syncOffer(projectId: string, offerId?: string) {
  const existing = await getProject(projectId);
  const id = offerId ?? existing.haben_offer_id;
  if (!id) throw new DeskError(400, 'Zuerst eine Haben-Angebots-ID angeben.');
  const haben = integration('HABEN');
  const response = offerSchema.safeParse(await haben.request(`/angebote/${id}`));
  if (!response.success || response.data.id !== id) throw new RemoteError('Haben hat kein gültiges Angebot geliefert.');
  const offer = response.data;
  const invoiceLink = offer.invoiceId ? `${haben.origin}/rechnungen/${offer.invoiceId}` : null;
  return first(db, `UPDATE projects SET haben_offer_id=$2,haben_offer=($3::text)::jsonb,offer_ref=$4,
    invoice_ref=COALESCE($5,invoice_ref), stage=CASE
      WHEN stage='offered' AND $6 IN ('angenommen','abgerechnet') THEN 'confirmed'
      WHEN stage='planning' AND $6<>'entwurf' THEN CASE WHEN $6 IN ('angenommen','abgerechnet') THEN 'confirmed' ELSE 'offered' END
      ELSE stage END WHERE id=$1 RETURNING *`, [projectId,id,JSON.stringify({
        status: offer.listStatus, url: `${haben.origin}/angebote/${id}`, invoiceLink, fetchedAt: new Date().toISOString(),
      }),offer.number || id,offer.invoiceNumber || null,offer.listStatus]);
}

const fields = (value: RemoteContact): Fields => ({ name: value.name, email: value.email ?? '', phone: value.telefon ?? '' });
const same = (left: Fields, right: Fields | null) => Boolean(right && left.name === right.name && left.email === right.email && left.phone === right.phone);
const readContact = (result: unknown) => {
  const parsed = contactSchema.safeParse(result);
  if (!parsed.success) throw new RemoteError('Ungültiger Kontakt von Haben.');
  if (parsed.data.archived) throw new DeskError(409, 'Dieser Haben-Kontakt ist archiviert.');
  return parsed.data;
};

export async function syncContact(id: string, input: z.infer<typeof habenContactInput>) {
  const haben = integration('HABEN');
  return db.begin(async (transaction) => {
    const local = required(await first<Local>(transaction, 'SELECT * FROM contacts WHERE id=$1 FOR UPDATE', [id]));
    if (input.link_id && local.haben_id && input.link_id !== local.haben_id) throw new DeskError(409, 'Dieser Kontakt ist bereits verknüpft.');
    const linked = local.haben_id ?? input.link_id;
    const data = { name: local.name, email: local.email, telefon: local.phone };
    if (!linked) {
      if (local.haben_export_pending) throw new DeskError(409, 'Vorherigen Export in Haben prüfen und vorhandene Kontakt-ID verknüpfen.');
      await transaction.unsafe('UPDATE contacts SET haben_export_pending=true WHERE id=$1', [id]);
      try {
        const remote = readContact(await haben.request('/kontakte','POST',data));
        return store(remote.id, fields(remote), 'exported');
      } catch (error) {
        if (error instanceof RemoteError && error.upstream && error.upstream < 500) {
          await transaction.unsafe('UPDATE contacts SET haben_export_pending=false WHERE id=$1', [id]);
        }
        return { action: 'error', message: error instanceof DeskError ? error.message : 'Export in Haben prüfen.' };
      }
    }
    const duplicate = await first(transaction,'SELECT id FROM contacts WHERE haben_id=$1 AND id<>$2',[linked,id]);
    if (duplicate) throw new DeskError(409, 'Dieser Haben-Kontakt gehört schon zu einem anderen Desk-Kontakt.');
    const remote = readContact(await haben.request(`/kontakte/${linked}`));
    if (remote.id !== linked) throw new RemoteError('Die Kontakt-ID der Haben-Antwort stimmt nicht.');
    const remoteFields = fields(remote);
    if (same(local, remoteFields)) return store(remote.id, remoteFields, 'linked');
    if (input.prefer === 'haben' || (!input.prefer && same(local,local.haben_baseline))) {
      return store(remote.id,remoteFields,'pulled');
    }
    if (input.prefer === 'desk' || (!input.prefer && same(remoteFields,local.haben_baseline))) {
      const saved = readContact(await haben.request(`/kontakte/${linked}`,'PATCH',data));
      return store(saved.id, fields(saved), 'pushed');
    }
    return { action: 'conflict', haben_id: linked, desk: { name: local.name, email: local.email, phone: local.phone }, haben: remoteFields };

    async function store(remoteId: string, value: Fields, action: string) {
      await transaction.unsafe(`UPDATE contacts SET haben_id=$2,haben_baseline=($3::text)::jsonb,haben_export_pending=false,
        name=$4,email=$5,phone=$6 WHERE id=$1`, [id,remoteId,JSON.stringify(value),value.name,value.email,value.phone]);
      return { action };
    }
  });
}

export async function pullContacts() {
  const haben = integration('HABEN');
  const page = z.object({ data: z.array(contactSchema), total: z.number().int().nonnegative() });
  let imported = 0;
  for (let offset = 0; offset < 100_000; offset += 100) {
    const result = page.safeParse(await haben.request(`/kontakte?limit=100&offset=${offset}`));
    if (!result.success) throw new RemoteError('Ungültige Kontaktliste von Haben.');
    for (const remote of result.data.data) {
      if (remote.archived) continue;
      const value = fields(remote);
      const saved = await first(db, `INSERT INTO contacts(name,email,phone,haben_id,haben_baseline)
        SELECT $1::text,$2::text,$3::text,$4::uuid,($5::text)::jsonb
        WHERE NOT EXISTS (SELECT 1 FROM contacts WHERE haben_id IS NULL
          AND (lower(name)=lower($1) OR ($2<>'' AND lower(email)=lower($2))))
        ON CONFLICT (haben_id) DO NOTHING RETURNING id`, [value.name,value.email,value.phone,remote.id,JSON.stringify(value)]);
      if (saved) imported++;
    }
    if (offset + result.data.data.length >= result.data.total || !result.data.data.length) return { imported };
  }
  throw new RemoteError('Die Kontaktliste überschreitet den unterstützten Umfang.');
}
