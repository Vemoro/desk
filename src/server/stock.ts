import type { z } from 'zod';
import { db, first, rows, type Query } from './db';
import { DeskError, required } from './errors';
import { requireAvailableAssignee } from './accounts';
import { getProject, lockPlanning } from './core';
import type { movementInput, reservationInput } from './contracts';

type Reservation = {
  id: string; project_id: string; user_id: string | null; item_id: string | null; location_id: string | null;
  quantity: number; starts_at: Date; ends_at: Date; status: 'tentative' | 'firm' | 'released';
};
type Item = { id: string; kind: 'equipment' | 'consumable'; inventory_number: string | null };
type Movement = {
  id: string; item_id: string; location_id: string; project_id: string | null; reservation_id: string | null;
  actor_id: string; action: string; quantity: number; created_at: Date | string;
};
type Stock = { item_id: string; location_id: string; physical: number; reserved: number; free: number };
type WriteRequest = { actorId:string; key:string };
const item = async (query: Query, id: string) =>
  required(await first<Item>(query, 'SELECT id,kind,inventory_number FROM items WHERE id=$1', [id]), 'Artikel fehlt.');
const reservation = async (query: Query, id: string) =>
  required(await first<Reservation>(query, 'SELECT * FROM reservations WHERE id=$1', [id]), 'Reservierung fehlt.');

const activeHolds = `
  SELECT r.id,r.item_id,r.location_id,r.starts_at,r.ends_at,
    greatest(0, r.quantity - COALESCE((SELECT sum(CASE
        WHEN m.action IN ('issue','consume') THEN m.quantity ELSE 0 END)
      FROM movements m WHERE m.reservation_id=r.id),0))::integer AS hold
  FROM reservations r WHERE r.status='firm'
`;

async function physical(query: Query, itemId: string, locationId: string) {
  const stock = await first<{ count: number }>(query, `SELECT COALESCE(sum(CASE WHEN action IN ('receive','return')
    THEN quantity ELSE -quantity END),0)::integer AS count FROM movements WHERE item_id=$1 AND location_id=$2`, [itemId, locationId]);
  return stock?.count ?? 0;
}

async function reserveCapacity(query: Query, request: Reservation) {
  if (request.user_id) {
    await requireAvailableAssignee(query,request.user_id);
    const conflict = await first(query, `SELECT id FROM reservations WHERE user_id=$1 AND status='firm' AND id<>$2
      AND starts_at<$4 AND ends_at>$3 LIMIT 1`, [request.user_id, request.id, request.starts_at, request.ends_at]);
    if (conflict) throw new DeskError(409, 'Die Person ist in diesem Zeitraum bereits fest eingeplant.');
    return;
  }
  const material = await item(query, request.item_id!);
  const count = await physical(query, material.id, request.location_id!);
  const holds = await rows<{ starts_at: Date; ends_at: Date; hold: number }>(query, `WITH holds AS (${activeHolds})
    SELECT starts_at,ends_at,hold FROM holds WHERE item_id=$1 AND location_id=$2 AND id<>$3
    AND ($6::boolean OR (starts_at<$5 AND ends_at>$4))`,
    [material.id, request.location_id, request.id, request.starts_at, request.ends_at, material.kind === 'consumable']);
  let reserved = 0;
  if (material.kind === 'consumable') {
    reserved = holds.reduce((total, hold) => total + hold.hold, 0);
  } else {
    const points = holds.flatMap((hold) => [
      [Math.max(+hold.starts_at, +request.starts_at), hold.hold],
      [Math.min(+hold.ends_at, +request.ends_at), -hold.hold],
    ]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    let current = 0;
    for (const [, delta] of points) {
      current += delta;
      reserved = Math.max(reserved, current);
    }
  }
  if (count - reserved < request.quantity) throw new DeskError(409, 'Für diese Reservierung reicht der freie Bestand nicht.');
}

export async function createReservation(input: z.infer<typeof reservationInput>, request?:WriteRequest) {
  const normalized={...input,project_id:input.project_id.toLowerCase(),user_id:input.user_id?.toLowerCase(),
    item_id:input.item_id?.toLowerCase(),location_id:input.location_id?.toLowerCase()};
  return planningWrite('reservations',request,async transaction=>{
    const period=required(await first<{starts_at:string;ends_at:string}>(transaction,
      `SELECT extract(epoch FROM $1::timestamptz)::text AS starts_at,
              extract(epoch FROM $2::timestamptz)::text AS ends_at`,[input.starts_at,input.ends_at]));
    return {...normalized,...period};
  },async transaction=>{
    const project = await getProject(input.project_id, transaction);
    if (['complete','cancelled'].includes(project.stage)) throw new DeskError(409, 'Das Projekt ist abgeschlossen.');
    if (input.user_id) await requireAvailableAssignee(transaction,input.user_id);
    if (input.item_id) {
      const material = await item(transaction, input.item_id);
      if (material.inventory_number && input.quantity !== 1) throw new DeskError(400, 'Ein Einzelgerät hat die Menge 1.');
    }
    return first<Reservation>(transaction, `INSERT INTO reservations(project_id,user_id,item_id,location_id,quantity,starts_at,ends_at)
      VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [input.project_id,input.user_id ?? null,input.item_id ?? null,input.location_id ?? null,input.quantity,input.starts_at,input.ends_at]);
  });
}

export async function setReservation(id: string, status: 'firm' | 'released') {
  return db.begin(async (transaction) => {
    await lockPlanning(transaction);
    const current = await reservation(transaction, id);
    if (current.status === status) return current;
    if (current.status === 'released') throw new DeskError(409, 'Eine freigegebene Reservierung neu anlegen.');
    if (status === 'firm') {
      const project = await getProject(current.project_id, transaction);
      if (!['confirmed','running'].includes(project.stage)) throw new DeskError(409, 'Zuerst den Auftrag bestätigen.');
      await reserveCapacity(transaction, current);
    }
    return first(transaction, 'UPDATE reservations SET status=$2 WHERE id=$1 RETURNING *', [id,status]);
  });
}

async function planningWrite<T extends object>(operation:string, request:WriteRequest | undefined, input:object | ((query:Query)=>Promise<object>),
  write:(transaction:Query)=>Promise<T | undefined>) {
  return db.begin(async (transaction) => {
    await lockPlanning(transaction);
    if (!request) return write(transaction);
    const identity = [request.actorId,operation,request.key];
    const payload = typeof input==='function' ? await input(transaction) : input;
    const saved = await first<{ matches:boolean; response_data:T }>(transaction,
      `SELECT request_data=$4::jsonb AS matches,response_data FROM stock_write_requests
       WHERE actor_id=$1 AND operation=$2 AND request_key=$3`,[...identity,payload]);
    if (saved) {
      if (!saved.matches) throw new DeskError(409, 'Der Vorgangsschlüssel wurde bereits mit anderen Angaben verwendet.');
      return saved.response_data;
    }
    const response = required(await write(transaction));
    await transaction.unsafe(
      `INSERT INTO stock_write_requests(actor_id,operation,request_key,request_data,response_data)
       VALUES($1,$2,$3,$4::jsonb,$5::jsonb)`,[...identity,payload,response]);
    return response;
  });
}

export async function createMovement(input: z.infer<typeof movementInput>, actor: string, requestKey?:string) {
  const normalized = input.action==='receive' ? {...input,item_id:input.item_id.toLowerCase(),
    location_id:input.location_id.toLowerCase(),project_id:input.project_id?.toLowerCase()} :
    {...input,reservation_id:input.reservation_id.toLowerCase()};
  return planningWrite('movements',requestKey ? {actorId:actor,key:requestKey} : undefined,normalized,async transaction=>{
    if (input.action === 'receive') {
      const material = await item(transaction, input.item_id);
      if (material.inventory_number) {
        const existed = await first(transaction, "SELECT id FROM movements WHERE item_id=$1 AND action='receive' LIMIT 1", [input.item_id]);
        if (input.quantity !== 1 || existed) throw new DeskError(409, 'Ein Einzelgerät kann genau einmal als Wareneingang erfasst werden.');
      }
      return insertMovement(transaction, input.item_id, input.location_id, input.project_id ?? null, null, actor, input.action, input.quantity);
    }
    const current = await reservation(transaction, input.reservation_id);
    if (!current.item_id || !current.location_id) throw new DeskError(400, 'Diese Reservierung betrifft kein Material.');
    const material = await item(transaction, current.item_id);
    const counts = await first<{ issued: number; returned: number; consumed: number }>(transaction, `
      SELECT COALESCE(sum(quantity) FILTER (WHERE action='issue'),0)::integer AS issued,
             COALESCE(sum(quantity) FILTER (WHERE action='return'),0)::integer AS returned,
             COALESCE(sum(quantity) FILTER (WHERE action='consume'),0)::integer AS consumed
      FROM movements WHERE reservation_id=$1`, [current.id]);
    const issued = (counts?.issued ?? 0) - (counts?.returned ?? 0);
    if (input.action === 'return') {
      if (input.quantity > issued) throw new DeskError(409, 'Die Rückgabe übersteigt die offene Ausgabe.');
    } else {
      if (current.status !== 'firm') throw new DeskError(409, 'Eine feste Reservierung ist erforderlich.');
      if ((input.action === 'consume') !== (material.kind === 'consumable')) throw new DeskError(400, 'Die Bewegung passt nicht zur Artikelart.');
      if ((counts?.issued ?? 0) + (counts?.consumed ?? 0) + input.quantity > current.quantity) throw new DeskError(409, 'Die Bewegung übersteigt die reservierte Menge.');
      if (await physical(transaction, current.item_id, current.location_id) < input.quantity) throw new DeskError(409, 'Der physische Bestand reicht nicht.');
      if (input.action === 'issue') {
        const now = Date.now();
        if (now < +current.starts_at || now >= +current.ends_at) throw new DeskError(409, 'Ausgabe nur im reservierten Zeitfenster. Das Projekt bei Bedarf neu einplanen.');
      }
    }
    return insertMovement(transaction,current.item_id,current.location_id,current.project_id,current.id,actor,input.action,input.quantity);
  });
}

function insertMovement(query: Query, material: string, location: string, project: string | null, booking: string | null, actor: string, action: string, quantity: number) {
  return first<Movement>(query, `INSERT INTO movements(item_id,location_id,project_id,reservation_id,actor_id,action,quantity)
    VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [material,location,project,booking,actor,action,quantity]);
}

export async function listStock() {
  return rows<Stock>(db, `WITH physical AS (
    SELECT item_id,location_id,sum(CASE WHEN action IN ('receive','return') THEN quantity ELSE -quantity END)::integer AS physical
    FROM movements GROUP BY item_id,location_id
  ), holds AS (${activeHolds}), reserved AS (
    SELECT h.item_id,h.location_id,sum(h.hold)::integer AS reserved FROM holds h JOIN items i ON i.id=h.item_id
    WHERE i.kind='consumable' OR (h.starts_at<=now() AND h.ends_at>now()) GROUP BY h.item_id,h.location_id
  )
  SELECT p.item_id,p.location_id,p.physical,COALESCE(r.reserved,0) AS reserved,
         p.physical-COALESCE(r.reserved,0) AS free
    FROM physical p LEFT JOIN reserved r USING(item_id,location_id) JOIN items i ON i.id=p.item_id JOIN locations l ON l.id=p.location_id ORDER BY i.name,l.name,p.item_id,p.location_id`);
}

export function listReservations(limit: number, offset: number) {
  return rows(db, `SELECT r.*, COALESCE((SELECT sum(CASE
    WHEN m.action='issue' THEN m.quantity WHEN m.action='return' THEN -m.quantity ELSE 0 END)
    FROM movements m WHERE m.reservation_id=r.id),0)::integer AS checked_out
    FROM reservations r ORDER BY starts_at,(r.user_id IS NULL),id LIMIT $1 OFFSET $2`, [limit,offset]);
}

export function listMovements(limit: number, offset: number) {
  return rows(db, 'SELECT * FROM movements ORDER BY created_at DESC,id LIMIT $1 OFFSET $2', [limit,offset]);
}
