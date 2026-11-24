import { z } from 'zod';
import { db, first, rows } from './db';
import { DeskError, required } from './errors';
import { getProject } from './core';
import { integration, RemoteError } from './remote';
import type { zammadCreateInput, zammadMessage } from './contracts';

const ticketSchema = z.object({ id: z.number().int().positive(), number: z.string(), title: z.string() });
const articleSchema = z.object({ id: z.number().int().positive(), body: z.string(), subject: z.string().nullable().optional(),
  from: z.string().nullable().optional(), created_at: z.string().optional(), content_type: z.string().optional(),
  attachments: z.array(z.object({ filename:z.string() })).optional() });
type Outgoing = { id: string; ticket_id: number; status: 'pending'|'unknown'|'sent'|'failed'; attempted_at: Date; attempt_key?: string;
  recipient: string; subject: string; body: string; attachment_name: string | null; attachment_data: string | null };
const marker = (id: string) => `Desk-Referenz: ${id}`;

export async function linkTicket(projectId: string, link: number | z.infer<typeof zammadCreateInput>) {
  const remote = integration('ZAMMAD');
  return db.begin(async (transaction) => {
    const current = required(await first<{ zammad_ticket_id: number | null }>(transaction,
      'SELECT zammad_ticket_id FROM projects WHERE id=$1 FOR UPDATE',[projectId]));
    if (current.zammad_ticket_id && typeof link !== 'number') throw new DeskError(409, 'Das Projekt hat bereits ein Ticket.');
    const result = typeof link === 'number' ? await remote.request(`/tickets/${link}`) : await remote.request('/tickets','POST',{
      title: link.title, group: process.env.ZAMMAD_GROUP || 'Users', customer_id: `guess:${link.customer}`,
      article: { subject: link.title, body: link.note, type: 'note', internal: true, sender: 'Agent', content_type: 'text/plain' },
    });
    const ticket = ticketSchema.parse(result);
    await transaction.unsafe('UPDATE projects SET zammad_ticket_id=$1 WHERE id=$2',[ticket.id,projectId]);
    return { ...ticket, url: `${remote.origin}/#ticket/zoom/${ticket.id}` };
  });
}

export async function conversations(projectId: string) {
  const project = await getProject(projectId);
  if (!project.zammad_ticket_id) return { articles: [], outgoing: [] };
  const remote = integration('ZAMMAD');
  const [ticket, articles, outgoing] = await Promise.all([
    remote.request(`/tickets/${project.zammad_ticket_id}`),
    loadArticles(remote, project.zammad_ticket_id),
    rows<Pick<Outgoing,'id'|'status'|'recipient'|'subject'|'attempted_at'> & {attempt_key:string}>(db,
      'SELECT id,status,recipient,subject,attempted_at,attempted_at::text AS attempt_key FROM outgoing WHERE project_id=$1 AND ticket_id=$2 ORDER BY attempted_at DESC LIMIT 30',
      [projectId,project.zammad_ticket_id]),
  ]);
  return { ticket: { ...ticketSchema.parse(ticket), url: `${remote.origin}/#ticket/zoom/${project.zammad_ticket_id}` }, articles, outgoing };
}

async function loadArticles(remote: ReturnType<typeof integration>, id: number) {
  const articles = z.array(articleSchema).safeParse(await remote.request(`/ticket_articles/by_ticket/${id}`));
  if (!articles.success) throw new RemoteError('Zammad hat keinen gültigen Nachrichtenverlauf geliefert.');
  return articles.data;
}

export async function send(projectId: string, message: z.infer<typeof zammadMessage>) {
  const project = await getProject(projectId);
  if (!project.zammad_ticket_id) throw new DeskError(409, 'Zuerst ein Zammad-Ticket verknüpfen.');
  const remote = integration('ZAMMAD');
  if (message.attachment && !Buffer.from(message.attachment.data,'base64').subarray(0,5).equals(Buffer.from('%PDF-'))) {
    throw new DeskError(400, 'Der Anhang muss ein PDF sein.');
  }
  const saved = await first<Outgoing>(db, `INSERT INTO outgoing(id,project_id,ticket_id,subject,body,recipient,attachment_name,attachment_data,status)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,'pending') ON CONFLICT(id) DO NOTHING RETURNING *`,
    [message.id, projectId,project.zammad_ticket_id,message.subject,message.body,message.recipient,message.attachment?.name ?? null,message.attachment?.data ?? null]);
  if (!saved) return reviewOutgoing(projectId,message.id,false);
  return deliver(remote,saved);
}

export async function reviewOutgoing(projectId: string, id: string, retry: boolean, expectedAttempt?: string) {
  const current = required(await first<Outgoing>(db,'SELECT *,attempted_at::text AS attempt_key FROM outgoing WHERE id=$1 AND project_id=$2',[id,projectId]));
  const project = await getProject(projectId);
  if (project.zammad_ticket_id !== current.ticket_id) throw new DeskError(409, 'Der Sendeversuch gehört zu einem anderen Ticket.');
  if (current.status === 'sent') return { id, status:'sent' };
  const remote = integration('ZAMMAD');
  const match = (await loadArticles(remote,current.ticket_id)).find((article) => article.body.includes(marker(id)));
  if (match) {
    await updateOutgoing(id,'sent',match.id);
    return { id,status:'sent' };
  }
  if (!retry) return { id,status:current.status };
  if (expectedAttempt !== undefined && expectedAttempt !== current.attempt_key) {
    throw new DeskError(409, 'Der Sendeversuch wurde inzwischen aktualisiert.');
  }
  if (current.status !== 'failed' && Date.now() - +current.attempted_at < 60_000) {
    throw new DeskError(409, 'Mindestens eine Minute warten und den Ticketverlauf erneut prüfen.');
  }
  const claimed = await first<Outgoing>(db, `UPDATE outgoing SET status='pending',attempted_at=now()
    WHERE id=$1 AND status=$2 AND attempted_at=($3::text)::timestamptz RETURNING *`,[id,current.status,current.attempt_key]);
  if (!claimed) throw new DeskError(409, 'Der Sendeversuch wurde inzwischen aktualisiert.');
  return deliver(remote,claimed);
}

async function deliver(remote: ReturnType<typeof integration>, current: Outgoing) {
  let articleId: number;
  try {
    const result = await remote.request('/ticket_articles','POST',{
      ticket_id:current.ticket_id, to:current.recipient, subject:current.subject,
      body:`${current.body}\n\n${marker(current.id)}`,type:'email',sender:'Agent',internal:false,content_type:'text/plain',
      ...(current.attachment_name ? { attachments:[{ filename:current.attachment_name,data:current.attachment_data,'mime-type':'application/pdf' }] } : {}),
    });
    articleId = z.object({ id:z.number().int().positive() }).parse(result).id;
  } catch (error) {
    const status = error instanceof RemoteError && error.upstream && error.upstream >= 400 && error.upstream < 500 ? 'failed' : 'unknown';
    await updateOutgoing(current.id,status);
    return { id:current.id,status };
  }
  await updateOutgoing(current.id,'sent',articleId);
  return { id:current.id,status:'sent' };
}

async function updateOutgoing(id: string, status: string, article?: number) {
  await db.unsafe(`UPDATE outgoing SET status=$2,article_id=$3,
    attachment_data=CASE WHEN $2='sent' THEN NULL ELSE attachment_data END
    WHERE id=$1 AND status<>'sent'`,[id,status,article ?? null]);
}
