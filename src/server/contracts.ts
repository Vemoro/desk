import { deliveryReferenceInvalid, deliveryReferenceLimit, deliveryReferenceTooLong, isDeliveryReferenceText } from '../delivery-reference';
import { z } from 'zod';
import { microsecondsWithinMillisecond } from '../time';

export const id = z.uuid();
const title = z.string().trim().min(1).max(160);
const memo = z.string().trim().max(5000);
const short = z.string().trim().max(250);
export const quantity = z.number().int().min(1).max(1_000_000);
const cents = z.number().int().min(-100_000_000).max(100_000_000);
const optionalDate = z.iso.date().nullable();
const email = z.union([z.email().max(254), z.literal('')]);
const link = z.union([z.url({ protocol: /^https?$/ }).max(500), z.literal('')]);
const taskStatus = z.enum(['todo','doing','review','done']);
export type TaskStatus = z.infer<typeof taskStatus>;
export const kanbanMove = z.strictObject({status:taskStatus,before_task_id:id.nullable()});
const kanbanPosition=z.number().int().positive();
export const kanbanMoveResponse=z.strictObject({id,status:taskStatus,kanban_position:kanbanPosition});
export const kanbanTaskResponse=kanbanMoveResponse.extend({
  name:z.string(),project_id:id,assignee_id:id.nullable(),due:z.iso.datetime().nullable(),
  kanban_position:kanbanPosition.nullable(),
});

export const schemas = {
  contacts: z.strictObject({ name: title, email: email.optional(), phone: short.optional(), notes: memo.optional() }),
  projects: z.strictObject({
    name: title, contact_id: id, due: optionalDate.optional(), notes: memo.optional(), cost_center: short.optional(),
    offer_ref: short.optional(), invoice_ref: short.optional(), external_link: link.optional(), communication_note: memo.optional(),
  }),
  tasks: z.strictObject({
    project_id: id, name: title, status: taskStatus.optional(),
    assignee_id: id.nullable().optional(), due: optionalDate.optional(),
  }),
  lines: z.strictObject({ project_id: id, kind: z.enum(['buy','sell']), name: title, quantity, unit_cents: cents.nonnegative() }),
  locations: z.strictObject({ name: title }),
  items: z.strictObject({
    name: title, code: title, kind: z.enum(['equipment','consumable']),
    inventory_number: title.nullable().optional(),
  }),
};
export const stages = ['inquiry','planning','offered','confirmed','running','complete','cancelled'] as const;
export const projectStage = z.strictObject({ stage: z.enum(stages) });
export const habenOfferStatus = z.enum(['entwurf','offen','abgelaufen','angenommen','abgelehnt','abgerechnet']);
export const projectResponse = z.strictObject({
  id, name:z.string(), contact_id:id, stage:projectStage.shape.stage, notes:z.string(),
  due:z.iso.datetime().nullable(), offer_ref:z.string(), invoice_ref:z.string(),
  external_link:z.string(), communication_note:z.string(), haben_offer_id:id.nullable(),
  haben_offer:z.strictObject({
    status:habenOfferStatus,
    url:z.url(), invoiceLink:z.url().nullable(), fetchedAt:z.iso.datetime(),
  }).nullable(),
  cost_center:z.string(), zammad_ticket_id:z.number().int().positive().nullable(),
});
export const reservationInput = z.strictObject({
  project_id: id, user_id: id.optional(), item_id: id.optional(), location_id: id.optional(),
  quantity, starts_at: z.iso.datetime({ offset: true }), ends_at: z.iso.datetime({ offset: true }),
}).superRefine((value, ctx) => {
  if (Date.parse(value.starts_at) >= Date.parse(value.ends_at)) ctx.addIssue({ code: 'custom', message: 'Das Ende muss nach dem Beginn liegen.' });
  if (value.user_id ? value.item_id || value.location_id || value.quantity !== 1 : !value.item_id || !value.location_id) {
    ctx.addIssue({ code: 'custom', message: 'Eine Person oder einen Artikel mit Lagerort angeben.' });
  }
});
export const reservationStatus = z.strictObject({ status: z.enum(['firm','released']) });
const planningTimestamp = z.iso.datetime({offset:true})
  .regex(/^(?!0000-)(?!.*\.\d{7})/,'Ein Zeitstempel im Jahr 0001 bis 9999 mit bis zu sechs Nachkommastellen ist erforderlich.')
  .regex(/^(?!.*[+-](?:1[6-9]|2[0-3]):\d{2}$)/,'Der Zeitzonenoffset darf höchstens 15 Stunden und 59 Minuten betragen.')
  .meta({format:'date-time'});
export const planningRange = z.object({
  from:planningTimestamp.describe('Beginn des Zeitfensters inklusive. Jahre 0001 bis 9999, bis zu sechs Nachkommastellen, UTC-Offset bis ±15:59.'),
  to:planningTimestamp.describe('Ende des Zeitfensters exklusive und nach from. Jahre 0001 bis 9999, bis zu sechs Nachkommastellen, UTC-Offset bis ±15:59.'),
}).refine(({from,to})=>{
  const difference=Date.parse(to)-Date.parse(from);
  return difference>0 || (difference===0 && microsecondsWithinMillisecond(to)>microsecondsWithinMillisecond(from));
},{
  path:['to'],message:'Das Ende muss nach dem Beginn liegen.',
});
export const planningResponse = z.array(z.strictObject({
  id, project_id:id, project_name:z.string(), resource_id:id, resource_name:z.string(),
  resource_kind:z.enum(['person','item']), inventory_number:z.string().nullable(),
  location_id:id.nullable(), location_name:z.string().nullable(),
  quantity:z.number().int().positive(), starts_at:z.iso.datetime(), ends_at:z.iso.datetime(),
  status:z.enum(['tentative','firm']),
}));
export type PlanningBooking = z.infer<typeof planningResponse>[number];
export const movementInput = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('receive'), item_id: id, location_id: id, project_id: id.optional(), quantity,
    delivery_reference: z.string().trim().pipe(
      z.string().max(deliveryReferenceLimit,deliveryReferenceTooLong)
        .refine(isDeliveryReferenceText,deliveryReferenceInvalid),
    ).describe('Optionaler Freitext. Desk entfernt äußere Leerzeichen und akzeptiert danach bis zu 160 Zeichen.').optional() }),
  z.strictObject({ action: z.enum(['issue','return','consume']), reservation_id: id, quantity }),
]);
export const movementCorrection = z.strictObject({ quantity, reason: memo.min(1) });
export const projectHistoryResponse = z.array(z.strictObject({
  id, created_at:z.iso.datetime(), actor_id:id.nullable(), actor_name:z.string().nullable(),
  kind:z.enum(['stage','reservation','movement']), source:z.enum(['desk','haben','project']),
  status:z.enum([...stages,'firm','released','receive','issue','return','consume','correct_receive','correct_consume']),
  previous_status:projectStage.shape.stage.nullable(), reservation_id:id.nullable(),
  resource_name:z.string().nullable(), inventory_number:z.string().nullable(), location_name:z.string().nullable(),
  quantity:z.number().int().positive().nullable(), correction_reason:z.string().nullable(),
}));
export type ProjectHistoryEntry = z.infer<typeof projectHistoryResponse>[number];
export const costInput = z.strictObject({
  project_id: id.nullable().optional(), source: title, reference: title,
  cost_center: short.optional(), name: title, cents,
});
export type CostEntry = z.infer<typeof costInput>;
export const costBatchLimit = 500;
export const costBatch = z.strictObject({ entries: z.array(costInput).min(1).max(costBatchLimit) });
export const costAssignment = z.strictObject({ project_id: id.nullable() });
export const habenOfferInput = z.strictObject({ id });
export const habenContactInput = z.strictObject({ link_id: id.optional(), prefer: z.enum(['desk','haben']).optional() });
export const ticketId = z.number().int().positive().max(2_147_483_647);
export const zammadLinkInput = z.strictObject({ id: ticketId });
export const zammadCreateInput = z.strictObject({ title, customer: z.email().max(254), note: memo.min(1) });
export const zammadNoteInput = z.strictObject({ id, ticketId, body: memo.min(1) });
export const zammadMessage = z.strictObject({
  id, recipient: z.email().max(254), subject: title, body: memo.min(1),
  replyArticleId: z.number().int().positive().max(2_147_483_647).optional(),
  attachment: z.strictObject({ name: z.string().max(180).regex(/^[^/\\\r\n]+\.pdf$/i), data: z.base64().max(6_990_508) }).optional(),
});
