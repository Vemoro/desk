import type { z } from 'zod';
import { db, first, rows, type Query } from './db';
import { DeskError, required } from './errors';
import { requireAvailableAssignee } from './accounts';
import { getProject, lockPlanning } from './core';
import type { movementInput, movementCorrection, reservationInput } from './contracts';

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
type Hold = { starts_at: Date; ends_at: Date; hold: number };
type WriteRequest = { actorId:string; key:string };
const item = async (query: Query, id: string) =>
  required(await first<Item>(query, 'SELECT id,kind,inventory_number FROM items WHERE id=$1', [id]), 'Artikel fehlt.');
const reservation = async (query: Query, id: string) =>
  required(await first<Reservation>(query, 'SELECT * FROM reservations WHERE id=$1', [id]), 'Reservierung fehlt.');

const physicalDelta = "CASE WHEN action IN ('receive','return','correct_consume') THEN quantity ELSE -quantity END";
const consumedDelta = "CASE WHEN action='consume' THEN quantity WHEN action='correct_consume' THEN -quantity ELSE 0 END";
const activeHolds = `
  SELECT r.id,r.item_id,r.location_id,r.starts_at,r.ends_at,
    greatest(0, r.quantity - COALESCE((SELECT sum(CASE
        WHEN m.action='issue' THEN m.quantity ELSE ${consumedDelta} END)
      FROM movements m WHERE m.reservation_id=r.id),0))::integer AS hold
  FROM reservations r WHERE r.status='firm'
`;

async function physical(query: Query, itemId: string, locationId: string) {
  const stock = await first<{ count: number }>(query, `SELECT COALESCE(sum(${physicalDelta}),0)::integer AS count
    FROM movements WHERE item_id=$1 AND location_id=$2`, [itemId, locationId]);
  return stock?.count ?? 0;
}

function reservedCapacity(holds: Hold[], kind: Item['kind']) {
  if (kind === 'consumable') return holds.reduce((total, hold) => total + hold.hold, 0);
  const points = holds.flatMap(hold=>[[+hold.starts_at, hold.hold], [+hold.ends_at, -hold.hold]])
    .sort((a,b)=>a[0]-b[0] || a[1]-b[1]);
  let current = 0;
  let peak = 0;
  for (const [, delta] of points) {
    current += delta;
    peak = Math.max(peak, current);
  }
  return peak;
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
  const holds = await rows<Hold>(query, `WITH holds AS (${activeHolds})
    SELECT greatest(starts_at,$4) AS starts_at,least(ends_at,$5) AS ends_at,hold
    FROM holds WHERE item_id=$1 AND location_id=$2 AND id<>$3
    AND ($6::boolean OR (starts_at<$5 AND ends_at>$4))`,
    [material.id, request.location_id, request.id, request.starts_at, request.ends_at, material.kind === 'consumable']);
  if (count - reservedCapacity(holds,material.kind) < request.quantity) {
    throw new DeskError(409, 'Für diese Reservierung reicht der freie Bestand nicht.');
  }
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
        const received = await first<{ count:number }>(transaction,`SELECT COALESCE(sum(CASE
          WHEN action='receive' THEN quantity ELSE -quantity END),0)::integer AS count
          FROM movements WHERE item_id=$1 AND action IN ('receive','correct_receive')`,[input.item_id]);
        if (input.quantity !== 1 || received?.count) throw new DeskError(409, 'Für dieses Einzelgerät besteht bereits ein wirksamer Wareneingang.');
      }
      return insertMovement(transaction, input.item_id, input.location_id, input.project_id ?? null, null, actor, input.action, input.quantity);
    }
    const current = await reservation(transaction, input.reservation_id);
    if (!current.item_id || !current.location_id) throw new DeskError(400, 'Diese Reservierung betrifft kein Material.');
    const material = await item(transaction, current.item_id);
    const counts = await first<{ issued: number; returned: number; consumed: number }>(transaction, `
      SELECT COALESCE(sum(quantity) FILTER (WHERE action='issue'),0)::integer AS issued,
             COALESCE(sum(quantity) FILTER (WHERE action='return'),0)::integer AS returned,
             COALESCE(sum(${consumedDelta}),0)::integer AS consumed
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

export async function correctMovement(id: string, input: z.infer<typeof movementCorrection>, actor: string, requestKey?: string) {
  const normalized = { originalId:id.toLowerCase(), ...input };
  return planningWrite('movement-corrections',requestKey ? {actorId:actor,key:requestKey} : undefined,normalized,async transaction=>{
    const original = required(await first<Movement>(transaction,'SELECT * FROM movements WHERE id=$1',[id]),
      'Ursprüngliche Lagerbewegung fehlt.');
    if (original.action !== 'receive' && original.action !== 'consume') {
      throw new DeskError(409, 'Nur Wareneingang und Verbrauch können korrigiert werden.');
    }
    const prior = await first<{count:number}>(transaction,`SELECT COALESCE(sum(quantity),0)::integer AS count
      FROM movements WHERE corrects_movement_id=$1`,[original.id]);
    if (input.quantity > original.quantity - (prior?.count ?? 0)) {
      throw new DeskError(409, 'Die Menge übersteigt den noch korrigierbaren Teil der Buchung.');
    }
    if (original.action === 'receive') {
      const material = await item(transaction,original.item_id);
      const remaining = await physical(transaction,original.item_id,original.location_id) - input.quantity;
      if (remaining < 0) throw new DeskError(409, 'Der physische Bestand reicht für diese Korrektur nicht.');
      const holds = await rows<Hold>(transaction,`WITH holds AS (${activeHolds})
        SELECT starts_at,ends_at,hold FROM holds WHERE item_id=$1 AND location_id=$2
          AND ($3::boolean OR ends_at>now())`,[original.item_id,original.location_id,material.kind==='consumable']);
      if (remaining < reservedCapacity(holds,material.kind)) {
        throw new DeskError(409, 'Die Korrektur würde eine feste Reservierung ungedeckt lassen.');
      }
    }
    const action = original.action === 'receive' ? 'correct_receive' : 'correct_consume';
    return first<Movement>(transaction,`INSERT INTO movements
      (item_id,location_id,project_id,reservation_id,actor_id,action,quantity,corrects_movement_id,correction_reason)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [original.item_id,original.location_id,original.project_id,original.reservation_id,actor,action,input.quantity,original.id,input.reason]);
  });
}

function insertMovement(query: Query, material: string, location: string, project: string | null, booking: string | null, actor: string, action: string, quantity: number) {
  return first<Movement>(query, `INSERT INTO movements(item_id,location_id,project_id,reservation_id,actor_id,action,quantity)
    VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [material,location,project,booking,actor,action,quantity]);
}

export async function listStock() {
  return rows<Stock>(db, `WITH physical AS (
    SELECT item_id,location_id,sum(${physicalDelta})::integer AS physical
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
