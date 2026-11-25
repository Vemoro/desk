import { z } from 'zod';
import { db, first, type Query } from './db';
import { DeskError, required } from './errors';
import { getProject, lockPlanning, type Project } from './core';
import { recordStage } from './project-history';
import { integration, RemoteError } from './remote';
import { habenOfferStatus, schemas, type habenContactInput } from './contracts';

const offerSchema = z.object({
  id: z.uuid(), number: z.string().nullable().optional(), contactId: z.uuid().nullable().optional(),
  listStatus: habenOfferStatus,
  invoiceNumber: z.string().nullable().optional(), invoiceId: z.uuid().nullable().optional(),
});
const contactSchema = z.object({
  id: z.uuid(), name: z.string(), email: z.string().nullable().optional(), telefon: z.string().nullable().optional(),
  archived: z.boolean().optional(),
});
type RemoteContact = z.infer<typeof contactSchema>;
type Fields = { name: string; email: string; phone: string };
type Local = Fields & { id: string; haben_id: string | null; haben_baseline: Fields | null; haben_export_pending: boolean };
const sharedFields = schemas.contacts.pick({name:true,email:true,phone:true});
const incompatibleContact = 'Name, E-Mail oder Telefon entsprechen nicht den Desk-Kontaktfeldern. Prüfe auch, ob mehrere E-Mail-Adressen eingetragen sind.';
const exportClaimed = Symbol('exportClaimed');
const rejectedCreateStatuses = new Set([400,401,403,413,415,422,429]);

export async function syncOffer(projectId: string, offerId?: string, actorId?: string) {
  const existing = await getProject(projectId);
  const id = offerId ?? existing.haben_offer_id;
  if (!id) throw new DeskError(400, 'Zuerst eine Haben-Angebots-ID angeben.');
  const haben = integration('HABEN');
  const response = offerSchema.safeParse(await haben.request(`/angebote/${id}`));
  if (!response.success || response.data.id !== id) throw new RemoteError('Haben hat kein gültiges Angebot geliefert.');
  const offer = response.data;
  const invoiceLink = offer.invoiceId ? `${haben.origin}/rechnungen/${offer.invoiceId}` : null;
  return db.begin(async transaction=>{
    await lockPlanning(transaction);
    const current = await getProject(projectId,transaction);
    // Compare the saved offer snapshots after the remote read, for refreshes and relinking alike.
    if (current.haben_offer_id !== existing.haben_offer_id ||
      JSON.stringify(current.haben_offer) !== JSON.stringify(existing.haben_offer)) {
      throw new DeskError(409,'Das Haben-Angebot wurde inzwischen abgeglichen. Bitte Projekt neu laden.');
    }
    const updated = required(await first<Project>(transaction,`
      UPDATE projects SET haben_offer_id=$2,haben_offer=($3::text)::jsonb,offer_ref=$4,
        invoice_ref=COALESCE($5,invoice_ref), stage=CASE
        WHEN stage='offered' AND $6 IN ('angenommen','abgerechnet') THEN 'confirmed'
        WHEN stage='planning' AND $6<>'entwurf' THEN CASE WHEN $6 IN ('angenommen','abgerechnet') THEN 'confirmed' ELSE 'offered' END
        ELSE stage END WHERE id=$1 RETURNING *
    `,[projectId,id,JSON.stringify({
      status: offer.listStatus, url: `${haben.origin}/angebote/${id}`, invoiceLink, fetchedAt: new Date().toISOString(),
    }),offer.number || id,offer.invoiceNumber || null,offer.listStatus]));
    if (updated.stage !== current.stage) await recordStage(transaction,projectId,actorId,current.stage,updated.stage,'haben');
    return updated;
  });
}

const fields = (value: RemoteContact): Fields => ({ name: value.name, email: value.email ?? '', phone: value.telefon ?? '' });
const deskFields = ({name,email,phone}:Fields):Fields => ({name,email,phone});
const same = (left: Fields, right: Fields | null) => Boolean(right && left.name === right.name && left.email === right.email && left.phone === right.phone);
const readContact = (result: unknown, expectedId?: string) => {
  const parsed = contactSchema.safeParse(result);
  if (!parsed.success) throw new RemoteError('Ungültiger Kontakt von Haben.');
  if (expectedId && parsed.data.id.toLowerCase() !== expectedId) {
    throw new RemoteError('Die Kontakt-ID der Haben-Antwort stimmt nicht.');
  }
  if (parsed.data.archived) throw new DeskError(409, 'Dieser Haben-Kontakt ist archiviert.');
  if (!sharedFields.safeParse(fields(parsed.data)).success) throw new DeskError(409,incompatibleContact);
  return parsed.data;
};

async function lockContact(query:Query, id:string) {
  return required(await first<Local>(query, 'SELECT * FROM contacts WHERE id=$1 FOR UPDATE', [id]));
}

async function storeContact(query:Query, id:string, remoteId:string, value:Fields, action:'exported' | 'linked' | 'pulled' | 'pushed') {
  await query.unsafe(`UPDATE contacts SET haben_id=$2,haben_baseline=($3::text)::jsonb,haben_export_pending=false,
    name=$4,email=$5,phone=$6 WHERE id=$1`, [id,remoteId,JSON.stringify(value),value.name,value.email,value.phone]);
  return { action };
}

async function finishContactExport(haben:ReturnType<typeof integration>, id:string) {
  return db.begin(async transaction=>{
    const local = await lockContact(transaction,id);
    // An explicit recovery may have linked the contact since the export was claimed.
    if (local.haben_id) return { action:'linked' };
    const clearPending = () => transaction.unsafe('UPDATE contacts SET haben_export_pending=false WHERE id=$1', [id]);
    const data = deskFields(local);
    if (!sharedFields.safeParse(data).success) {
      await clearPending();
      return { action:'error',message:incompatibleContact };
    }
    try {
      const remote = readContact(await haben.request('/kontakte','POST',{
        name:data.name,email:data.email,telefon:data.phone,
      }));
      return storeContact(transaction,id,remote.id,fields(remote),'exported');
    } catch (error) {
      if (error instanceof RemoteError && error.upstream && rejectedCreateStatuses.has(error.upstream)) {
        await clearPending();
        return { action:'error',message:error.message };
      }
      const reason = error instanceof DeskError ? `${error.message} ` : '';
      return { action:'error',message:`${reason}Prüfe den Export in Haben und verknüpfe die vorhandene Kontakt-ID.` };
    }
  });
}

export async function syncContact(id: string, input: z.infer<typeof habenContactInput>) {
  const haben = integration('HABEN');
  const linkId = input.link_id?.toLowerCase();
  const prepared = await db.begin(async (transaction) => {
    const local = await lockContact(transaction,id);
    const data = deskFields(local);
    if (linkId && local.haben_id && linkId !== local.haben_id) throw new DeskError(409, 'Dieser Kontakt ist bereits verknüpft.');
    const linked = local.haben_id ?? linkId;
    if (!linked) {
      if (local.haben_export_pending) throw new DeskError(409, 'Vorherigen Export in Haben prüfen und vorhandene Kontakt-ID verknüpfen.');
      if (!sharedFields.safeParse(data).success) {
        throw new DeskError(409,incompatibleContact);
      }
      // Commit the intent before making a non-idempotent request.
      await transaction.unsafe('UPDATE contacts SET haben_export_pending=true WHERE id=$1', [id]);
      return exportClaimed;
    }
    const duplicate = await first(transaction,'SELECT id FROM contacts WHERE haben_id=$1 AND id<>$2',[linked,id]);
    if (duplicate) throw new DeskError(409, 'Dieser Haben-Kontakt gehört schon zu einem anderen Desk-Kontakt.');
    const remote = readContact(await haben.request(`/kontakte/${linked}`),linked);
    const remoteFields = fields(remote);
    if (same(local, remoteFields)) return storeContact(transaction,id,linked,remoteFields,'linked');
    if (input.prefer === 'haben' || (!input.prefer && same(local,local.haben_baseline))) {
      return storeContact(transaction,id,linked,remoteFields,'pulled');
    }
    if (input.prefer === 'desk' || (!input.prefer && same(remoteFields,local.haben_baseline))) {
      if (!sharedFields.safeParse(data).success) throw new DeskError(409,incompatibleContact);
      const saved = readContact(await haben.request(`/kontakte/${linked}`,'PATCH',{
        name:data.name,email:data.email,telefon:data.phone,
      }),linked);
      return storeContact(transaction,id,linked,fields(saved),'pushed');
    }
    return { action: 'conflict', haben_id: linked, desk:data, haben:remoteFields };
  });
  return prepared === exportClaimed ? finishContactExport(haben,id) : prepared;
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
      if (!sharedFields.safeParse(value).success) continue;
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
