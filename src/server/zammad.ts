import { z } from 'zod';
import { db, first, rows, type Query } from './db';
import { DeskError, required } from './errors';
import { getProject } from './core';
import { integration, RemoteError } from './remote';
import type { zammadCreateInput, zammadMessage } from './contracts';

const ticketSchema = z.object({ id: z.number().int().positive(), number: z.string(), title: z.string() });
const attachmentSchema = z.object({ filename:z.string(), id:z.unknown().optional() });
const zammadId = z.number().int().positive();
const articleSchema = z.object({ id: z.number().int().positive(), body: z.string(), subject: z.string().nullable().optional(),
  from: z.string().nullable().optional(), created_at: z.string().optional(), content_type: z.string().optional(),
  attachments: z.array(attachmentSchema).optional() });
const articleMetadata = z.object({
  ticket_id:z.number().int().positive(),
  type:z.string(),
  sender:z.string(),
  internal:z.boolean(),
  reply_to:z.string().nullable().optional(),
  message_id:z.string().nullable().optional(),
});
const emailAddress = z.email().max(254);
const atom = "[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+";
const dotAtom = `${atom}(?:\\.${atom})*`;
const messageId = z.string().max(998).regex(new RegExp(`^<${dotAtom}@(?:${dotAtom}|\\[[!-Z^-~]*\\])>$`));
type ArticleContext = {
  kind:'unknown'|'internal-note'|'internal'|'other'|'incoming-email'|'outgoing-email';
  reply?:{recipient:string;subject:string;reference:string};
};
type Outgoing = { id: string; ticket_id: number; status: 'pending'|'unknown'|'sent'|'failed'; attempted_at: Date; attempt_key?: string;
  recipient: string; subject: string; body: string; attachment_name: string | null; attachment_data: string | null; in_reply_to: string | null };
const marker = (id: string) => `Desk-Referenz: ${id}`;
const notStored = (status:number,message:string)=>new DeskError(status,message,'zammad_message_not_stored');
const attachmentMissing = ()=>new DeskError(404,'Der Anhang gehört nicht zum aktuellen Ticket oder ist nicht mehr verfügbar.');

function attachmentName(name:string) {
  return name.toWellFormed().replace(/[\p{Cc}/\\]/gu,'_').trim().replace(/^\.+$/,'') || 'Anhang';
}

function articleContext(source:unknown, article:z.infer<typeof articleSchema>, ticketId:number):ArticleContext {
  const metadata = articleMetadata.safeParse(source);
  if (!metadata.success || metadata.data.ticket_id !== ticketId) return {kind:'unknown'};
  const fields = metadata.data;
  if (fields.internal) return {kind:fields.type === 'note' ? 'internal-note' : 'internal'};
  if (fields.type !== 'email') return {kind:'other'};
  if (fields.sender === 'Agent' || fields.sender === 'System') return {kind:'outgoing-email'};
  if (fields.sender !== 'Customer') return {kind:'unknown'};

  const mailbox = (fields.reply_to?.trim() || article.from?.trim() || '');
  // Accept a single bare address or one address with a simple display name.
  const displayName = mailbox.match(/^(?:"[^"\r\n]*"|[^"<>,;\r\n]+)?\s*<([^<>]+)>$/);
  const recipient = emailAddress.safeParse(displayName ? displayName[1].trim() : mailbox);
  const reference = messageId.safeParse(fields.message_id);
  return {
    kind:'incoming-email',
    reply:recipient.success && reference.success ? {
      recipient:recipient.data,
      subject:article.subject?.trim().replace(/^(re\s*:\s*)+/i,'') || 'Antwort',
      reference:reference.data,
    } : undefined,
  };
}

async function lockProjectTicket(transaction: Query, projectId: string) {
  return required(await first<{ zammad_ticket_id: number | null }>(transaction,
    'SELECT zammad_ticket_id FROM projects WHERE id=$1 FOR UPDATE',[projectId])).zammad_ticket_id;
}

async function requireUnusedTicket(transaction:Query,projectId:string,ticketId:number) {
  if (await first(transaction,'SELECT 1 FROM outgoing WHERE project_id=$1 AND ticket_id=$2 LIMIT 1',[projectId,ticketId])) {
    throw new DeskError(409, 'Für dieses Ticket gibt es bereits einen Desk-Sendeversuch.');
  }
}

export async function checkZammadConnection(id: number) {
  const remote = integration('ZAMMAD');
  try {
    const ticket = ticketSchema.safeParse(await remote.request(`/tickets/${id}`));
    if (!ticket.success || ticket.data.id !== id) {
      throw new RemoteError('Zammad hat das Testticket nicht in der erwarteten Form geliefert.');
    }
    await loadArticles(remote, id);
    return { ok:true };
  } catch (error) {
    if (error instanceof RemoteError) {
      if (error.upstream === 401 || error.upstream === 403) {
        throw new DeskError(502, 'Zammad verweigert den Zugriff auf das Ticket oder den Verlauf.');
      }
      if (error.upstream === 404) {
        throw new DeskError(502, 'Zammad findet das Ticket oder den Verlauf nicht.');
      }
    }
    throw error;
  }
}

export async function linkTicket(projectId: string, link: number | z.infer<typeof zammadCreateInput>) {
  const remote = integration('ZAMMAD');
  return db.begin(async (transaction) => {
    const current = await lockProjectTicket(transaction,projectId);
    if (current && typeof link !== 'number') throw new DeskError(409, 'Das Projekt hat bereits ein Ticket.');
    if (current && current !== link) await requireUnusedTicket(transaction,projectId,current);
    const result = typeof link === 'number' ? await remote.request(`/tickets/${link}`) : await remote.request('/tickets','POST',{
      title: link.title, group: process.env.ZAMMAD_GROUP || 'Users', customer_id: `guess:${link.customer}`,
      article: { subject: link.title, body: link.note, type: 'note', internal: true, sender: 'Agent', content_type: 'text/plain' },
    });
    const ticket = ticketSchema.parse(result);
    if (typeof link === 'number' && ticket.id !== link) {
      throw new RemoteError('Zammad hat eine abweichende Ticket-ID geliefert.');
    }
    await transaction.unsafe('UPDATE projects SET zammad_ticket_id=$1 WHERE id=$2',[ticket.id,projectId]);
    return { ...ticket, url: `${remote.origin}/#ticket/zoom/${ticket.id}` };
  });
}

export async function unlinkTicket(projectId: string, expectedId: number) {
  return db.begin(async (transaction) => {
    const current = await lockProjectTicket(transaction,projectId);
    if (current !== expectedId) throw new DeskError(409, 'Die Ticketverknüpfung hat sich geändert.');
    await requireUnusedTicket(transaction,projectId,current);
    await transaction.unsafe('UPDATE projects SET zammad_ticket_id=NULL WHERE id=$1',[projectId]);
    return { ok:true };
  });
}

export async function conversations(projectId: string) {
  const project = await getProject(projectId);
  if (!project.zammad_ticket_id) return { articles: [], outgoing: [] };
  const remote = integration('ZAMMAD');
  const [ticket, articles, outgoing] = await Promise.all([
    remote.request(`/tickets/${project.zammad_ticket_id}`),
    loadArticles(remote, project.zammad_ticket_id),
    rows(db, 'SELECT id,status,recipient,subject,attempted_at FROM outgoing WHERE project_id=$1 AND ticket_id=$2 ORDER BY attempted_at DESC LIMIT 30',[projectId,project.zammad_ticket_id]),
  ]);
  return { ticket: { ...ticketSchema.parse(ticket), url: `${remote.origin}/#ticket/zoom/${project.zammad_ticket_id}` }, articles, outgoing };
}

async function loadArticles(remote: ReturnType<typeof integration>, id: number) {
  const source = await remote.request(`/ticket_articles/by_ticket/${id}`);
  const articles = z.array(articleSchema).safeParse(source);
  if (!Array.isArray(source) || !articles.success) throw new RemoteError('Zammad hat keinen gültigen Nachrichtenverlauf geliefert.');
  return articles.data.map((article,index)=>{
    const context = articleContext(source[index],article,id);
    const attachments=article.attachments?.map(item=>{
      const identifier=zammadId.safeParse(item.id);
      return {filename:attachmentName(item.filename),...(identifier.success ? {id:identifier.data} : {})};
    });
    return { ...article, attachments, kind:context.kind, ...(context.reply ? {
      reply:{recipient:context.reply.recipient,subject:context.reply.subject},
    } : {}) };
  });
}

export async function downloadAttachment(projectId:string,ticketId:number,articleId:number,attachmentId:number,signal:AbortSignal) {
  const project=await getProject(projectId);
  if(project.zammad_ticket_id!==ticketId) throw attachmentMissing();
  const remote=integration('ZAMMAD');
  try {
    const article=articleSchema.extend({ticket_id:zammadId}).safeParse(await remote.request(`/ticket_articles/${articleId}`));
    if(!article.success || article.data.id!==articleId || article.data.ticket_id!==ticketId) throw attachmentMissing();
    const file=article.data.attachments?.find(item=>item.id===attachmentId);
    if(!file) throw attachmentMissing();
    const upstream=await remote.download(`/ticket_attachment/${ticketId}/${articleId}/${attachmentId}`,signal);
    try {
      if((await getProject(projectId)).zammad_ticket_id!==ticketId) throw attachmentMissing();
      if(upstream.status!==200 || !upstream.body) throw new RemoteError('Zammad hat keine vollständige Datei geliefert.');
      const filename=encodeURIComponent(attachmentName(file.filename)).replace(/['()*]/g,character=>
        `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
      return new Response(upstream.body,{headers:{
        'Content-Type':'application/octet-stream',
        'Content-Disposition':`attachment; filename="Anhang"; filename*=UTF-8''${filename}`,
        'Cache-Control':'no-store',
        'X-Content-Type-Options':'nosniff',
      }});
    } catch(error) {
      await upstream.body?.cancel().catch(()=>{});
      throw error;
    }
  } catch(error) {
    if(error instanceof RemoteError && (error.upstream===403 || error.upstream===404)) throw attachmentMissing();
    throw error;
  }
}

export async function send(projectId: string, message: z.infer<typeof zammadMessage>) {
  const {remote,saved} = await db.begin(async (transaction) => {
    const ticketId = await lockProjectTicket(transaction,projectId);
    if (!ticketId) throw notStored(409, 'Zuerst ein Zammad-Ticket verknüpfen.');
    const remote = integration('ZAMMAD');
    if (message.attachment && !Buffer.from(message.attachment.data,'base64').subarray(0,5).equals(Buffer.from('%PDF-'))) {
      throw notStored(400, 'Der Anhang muss ein PDF sein.');
    }
    let reference: string | null = null;
    if (message.replyArticleId !== undefined) {
      const existing = await first(transaction,'SELECT 1 FROM outgoing WHERE id=$1 AND project_id=$2',[message.id,projectId]);
      if (existing) return {remote,saved:undefined};
      let source:unknown;
      try {
        source = await remote.request(`/ticket_articles/${message.replyArticleId}`);
      } catch (error) {
        if (!(error instanceof RemoteError)) throw error;
        if (error.upstream === 403 || error.upstream === 404) {
          throw notStored(409,'Die Nachricht gehört nicht zum aktuellen Ticket oder ist nicht mehr verfügbar.');
        }
        throw notStored(502,error.message);
      }
      const article = articleSchema.safeParse(source);
      const reply = article.success && article.data.id === message.replyArticleId
        ? articleContext(source,article.data,ticketId).reply : undefined;
      if (!reply || reply.recipient !== message.recipient) {
        throw notStored(409,'Die Nachricht oder ihre Antwortadresse passt nicht zum aktuellen Ticket. Lade den Verlauf erneut.');
      }
      reference = reply.reference;
    }
    const saved = await first<Outgoing>(transaction, `INSERT INTO outgoing(id,project_id,ticket_id,subject,body,recipient,attachment_name,attachment_data,in_reply_to,status)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending') ON CONFLICT(id) DO NOTHING RETURNING *`,
      [message.id,projectId,ticketId,message.subject,message.body,message.recipient,message.attachment?.name ?? null,message.attachment?.data ?? null,reference]);
    return {remote,saved};
  });
  if (!saved) return reviewOutgoing(projectId,message.id,false);
  return deliver(remote,saved);
}

export async function reviewOutgoing(projectId: string, id: string, retry: boolean) {
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
      ...(current.in_reply_to ? { in_reply_to:current.in_reply_to } : {}),
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
