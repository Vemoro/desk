import type { z } from 'zod';
import { db, first, rows, type Query } from './db';
import { DeskError, required } from './errors';
import { requireAvailableAssignee } from './accounts';
import { getProject, lockPlanning } from './core';
import { recordReservation } from './project-history';
import type { movementInput, movementCorrection, reservationInput } from './contracts';

type Reservation = {
  id: string; project_id: string; user_id: string | null; item_id: string | null; location_id: string | null;
  quantity: number; starts_at: Date; ends_at: Date; status: 'tentative' | 'firm' | 'released';
};
type Item = { id: string; kind: 'equipment' | 'consumable'; inventory_number: string | null };
type Movement = {
  id: string; item_id: string; location_id: string; project_id: string | null; reservation_id: string | null;
  actor_id: string; action: string; quantity: number; created_at: Date | string; delivery_reference: string | null;
};
type Stock = { item_id: string; location_id: string; physical: number; reserved: number; free: number };
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

async function reservedCapacity(query: Query, material: Item, locationId: string, reservationId: string | null = null) {
  // PostgreSQL timestamps preserve the full precision of the half-open time windows.
  const count = await first<{count:number}>(query,`
    WITH holds AS (${activeHolds}), reference AS (
      SELECT starts_at,ends_at FROM reservations WHERE id=$3
    ), relevant AS (
      SELECT greatest(h.starts_at,r.starts_at) AS starts_at,least(h.ends_at,r.ends_at) AS ends_at,h.hold
      FROM holds h LEFT JOIN reference r ON true
      WHERE h.item_id=$1 AND h.location_id=$2 AND h.id IS DISTINCT FROM $3
        AND ($4::boolean OR (h.ends_at>COALESCE(r.starts_at,statement_timestamp())
          AND (r.ends_at IS NULL OR h.starts_at<r.ends_at)))
    ), changes AS (
      SELECT starts_at AS instant,hold AS delta FROM relevant
      UNION ALL SELECT ends_at,-hold FROM relevant
    ), capacity AS (
      SELECT sum(sum(delta)) OVER (ORDER BY instant) AS used FROM changes GROUP BY instant
    )
    SELECT COALESCE(CASE WHEN $4 THEN (SELECT sum(hold) FROM relevant)
      ELSE (SELECT max(used) FROM capacity) END,0)::integer AS count`,
    [material.id,locationId,reservationId,material.kind==='consumable']);
  return count?.count ?? 0;
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
  const reserved = await reservedCapacity(query,material,request.location_id!,request.id);
  if (count - reserved < request.quantity) {
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

export async function setReservation(id: string, status: 'firm' | 'released', actorId?: string) {
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
    const updated = await first(transaction, 'UPDATE reservations SET status=$2 WHERE id=$1 RETURNING *', [id,status]);
    await recordReservation(transaction,current.project_id,id,actorId,status);
    return updated;
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
    location_id:input.location_id.toLowerCase(),project_id:input.project_id?.toLowerCase(),
    delivery_reference:input.delivery_reference || undefined} :
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
      return insertMovement(transaction, input.item_id, input.location_id, input.project_id ?? null, null, actor,
        input.action, input.quantity, input.delivery_reference || null);
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
      if (remaining < await reservedCapacity(transaction,material,original.location_id)) {
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

function insertMovement(query: Query, material: string, location: string, project: string | null, booking: string | null,
  actor: string, action: string, quantity: number, deliveryReference: string | null = null) {
  return first<Movement>(query, `INSERT INTO movements(item_id,location_id,project_id,reservation_id,actor_id,action,quantity,delivery_reference)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`, [material,location,project,booking,actor,action,quantity,deliveryReference]);
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
    FROM movements m WHERE m.reservation_id=r.id),0)::integer AS checked_out,
    EXTRACT(MICROSECONDS FROM r.ends_at)::integer % 1000 AS ends_at_submillisecond
    FROM reservations r ORDER BY starts_at,(r.user_id IS NULL),id LIMIT $1 OFFSET $2`, [limit,offset]);
}

export function listPlanningReservations(from:string, to:string, limit:number, offset:number) {
  return rows(db,`
    SELECT r.id,r.project_id,p.name AS project_name,
      COALESCE(r.user_id,r.item_id) AS resource_id, COALESCE(u.name,i.name) AS resource_name,
      CASE WHEN r.user_id IS NOT NULL THEN 'person' ELSE 'item' END AS resource_kind,
      i.inventory_number,r.location_id,l.name AS location_name,
      r.quantity,
      to_char(r.starts_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS starts_at,
      to_char(r.ends_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS ends_at,r.status
    FROM reservations r
    JOIN projects p ON p.id=r.project_id
    LEFT JOIN users u ON u.id=r.user_id
    LEFT JOIN items i ON i.id=r.item_id
    LEFT JOIN locations l ON l.id=r.location_id
    WHERE r.status IN ('tentative','firm') AND r.starts_at<$2::timestamptz AND r.ends_at>$1::timestamptz
    ORDER BY r.starts_at,r.id LIMIT $3 OFFSET $4
  `,[from,to,limit,offset]);
}

export function listMovements(limit: number, offset: number) {
  return rows(db, 'SELECT * FROM movements ORDER BY created_at DESC,id LIMIT $1 OFFSET $2', [limit,offset]);
}
