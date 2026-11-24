import { z } from 'zod';

export const id = z.uuid();
const title = z.string().trim().min(1).max(160);
const memo = z.string().trim().max(5000);
const short = z.string().trim().max(250);
export const quantity = z.number().int().min(1).max(1_000_000);
const cents = z.number().int().min(-100_000_000).max(100_000_000);
const optionalDate = z.iso.date().nullable();
const email = z.union([z.email().max(254), z.literal('')]);
const link = z.union([z.url({ protocol: /^https?$/ }).max(500), z.literal('')]);

export const schemas = {
  contacts: z.strictObject({ name: title, email: email.optional(), phone: short.optional(), notes: memo.optional() }),
  projects: z.strictObject({
    name: title, contact_id: id, due: optionalDate.optional(), notes: memo.optional(), cost_center: short.optional(),
    offer_ref: short.optional(), invoice_ref: short.optional(), external_link: link.optional(), communication_note: memo.optional(),
  }),
  tasks: z.strictObject({
    project_id: id, name: title, status: z.enum(['todo', 'doing', 'review', 'done']).optional(),
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
export const movementInput = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('receive'), item_id: id, location_id: id, project_id: id.optional(), quantity, delivery_reference: z.string().trim().max(160).optional() }),
  z.strictObject({ action: z.enum(['issue','return','consume']), reservation_id: id, quantity }),
]);
export const costInput = z.strictObject({
  project_id: id.nullable().optional(), source: title, reference: title,
  cost_center: short.optional(), name: title, cents,
});
export const costBatch = z.strictObject({ entries: z.array(costInput).min(1).max(500) });
export const costAssignment = z.strictObject({ project_id: id.nullable() });
export const habenOfferInput = z.strictObject({ id });
export const habenContactInput = z.strictObject({ link_id: id.optional(), prefer: z.enum(['desk','haben']).optional() });
export const ticketId = z.number().int().positive().max(2_147_483_647);
export const zammadLinkInput = z.strictObject({ id: ticketId });
export const zammadCreateInput = z.strictObject({ title, customer: z.email().max(254), note: memo.min(1) });
export const zammadMessage = z.strictObject({
  id, recipient: z.email().max(254), subject: title, body: memo.min(1),
  attachment: z.strictObject({ name: z.string().max(180).regex(/^[^/\\\r\n]+\.pdf$/i), data: z.base64().max(6_990_508) }).optional(),
});
