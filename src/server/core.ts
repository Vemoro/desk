import type { z } from 'zod';
import { missingStageReference } from '../project-references';
import { db, first, rows, type Query } from './db';
import { DeskError, required } from './errors';
import { requireAvailableAssignee } from './accounts';
import { schemas, type costInput, type projectStage, type stages, type TaskStatus } from './contracts';
import { appendKanbanPosition, lockKanban, setKanbanPosition } from './kanban-order';
import { recordStage, releaseProjectReservations } from './project-history';

export type Collection = keyof typeof schemas;
type Stage = typeof stages[number];
export type Project = {
  id: string; name: string; stage: Stage; offer_ref: string; invoice_ref: string;
  haben_offer_id: string | null; haben_offer: unknown; cost_center: string; zammad_ticket_id: number | null;
};
const selected: Record<Collection, string> = {
  contacts: 'id,name,email,phone,notes,haben_id',
  projects: '*', tasks: '*', lines: '*', locations: '*', items: '*',
};

export async function getProject(id: string, query: Query = db) {
  return required(await first<Project>(query, 'SELECT * FROM projects WHERE id=$1', [id]), 'Projekt nicht gefunden.');
}

export async function listCore(table: Collection, limit: number, offset: number) {
  return rows(db, `SELECT ${selected[table]} FROM ${table} ORDER BY ${table === 'lines' ? 'kind,name' : 'name'},id LIMIT $1 OFFSET $2`, [limit, offset]);
}

export async function getCore(table: Collection, id: string) {
  return required(await first<{id:string} & Record<string,unknown>>(db, `SELECT ${selected[table]} FROM ${table} WHERE id=$1`, [id]));
}

export async function saveCore(table: Collection, data: Record<string, unknown>, id?: string) {
  if (table === 'items' && data.kind === 'consumable' && data.inventory_number) {
    throw new DeskError(400, 'Eine Inventarnummer ist für einzeln verfolgte Geräte vorgesehen.');
  }
  // Inventarart und Inventarnummer bleiben nach Anlage stabil, damit Bewegungen und Reservierungen eindeutig bleiben.
  if (table === 'items' && id && ('kind' in data || 'inventory_number' in data)) {
    throw new DeskError(409, 'Artikelart und Inventarnummer sind nach der Anlage fest.');
  }
  if (id && ['tasks', 'lines'].includes(table) && 'project_id' in data) {
    throw new DeskError(400, 'Die Projektzuordnung ist nach der Anlage fest.');
  }
  if (!Object.keys(data).length && id) return getCore(table, id);
  const save=async (query:Query,fields:Record<string,unknown>)=>{
    const keys=Object.keys(fields);
    const values=keys.map(key=>fields[key]);
    const placeholders=keys.map((_,index)=>`$${index+1}`);
    const statement=id
      ? `UPDATE ${table} SET ${keys.map((key,index)=>`${key}=${placeholders[index]}`).join(',')} WHERE id=$${keys.length+1}`
      : `INSERT INTO ${table}(${keys.join(',')}) VALUES (${placeholders.join(',')})`;
    return required(await first<{id:string} & Record<string,unknown>>(query,`${statement} RETURNING ${selected[table]}`,
      id ? [...values,id] : values));
  };
  if (table !== 'tasks') return save(db,data);
  return db.begin(async transaction=>{
    // The project never changes after task creation. Lock it before reading or writing card state.
    const projectId=id ? required(await first<{project_id:string}>(transaction,
      'SELECT project_id FROM tasks WHERE id=$1',[id])).project_id : data.project_id as string;
    if(!(await lockKanban(transaction,projectId))) throw new DeskError(409,'Unzulässige Zuordnung oder ungültiger Wert.');
    const prior=id ? required(await first<{assignee_id:string|null;status:TaskStatus}>(transaction,
      'SELECT assignee_id,status FROM tasks WHERE id=$1 FOR UPDATE',[id])) : undefined;
    const assignee=data.assignee_id;
    if(typeof assignee==='string' && prior?.assignee_id!==assignee.toLowerCase()) {
      await requireAvailableAssignee(transaction,assignee);
    }
    const status=(data.status ?? prior?.status ?? 'todo') as TaskStatus;
    if(!prior || status!==prior.status) {
      const position=await appendKanbanPosition(transaction,projectId,status);
      const task=await save(transaction,data);
      await setKanbanPosition(transaction,task.id,position);
      return task;
    }
    return save(transaction,data);
  });
}

const transitions: Record<Stage, Stage[]> = {
  inquiry: ['planning','cancelled'],
  planning: ['offered','cancelled'],
  offered: ['planning','confirmed','cancelled'],
  confirmed: ['running','cancelled'],
  running: ['complete','cancelled'],
  complete: [],
  cancelled: [],
};

export async function lockPlanning(query: Query) {
  await query.unsafe('SELECT pg_advisory_xact_lock(61274)');
}

export async function changeStage(id: string, stage: z.infer<typeof projectStage>['stage'], actorId?: string) {
  return db.begin(async (transaction) => {
    await lockPlanning(transaction);
    const existing = await getProject(id, transaction);
    if (stage === existing.stage) return existing;
    if (!transitions[existing.stage].includes(stage)) throw new DeskError(409, 'Dieser Projektstatus folgt auf eine andere Phase.');
    const reference=missingStageReference(stage,existing);
    if(reference) throw new DeskError(409, `Zuerst eine ${reference} erfassen.`);
    const project = await first(transaction, 'UPDATE projects SET stage=$1 WHERE id=$2 RETURNING *', [stage, id]);
    await recordStage(transaction,id,actorId,existing.stage,stage,'desk');
    if (stage === 'cancelled' || stage === 'complete') await releaseProjectReservations(transaction,id,actorId);
    return project;
  });
}

export async function importCosts(entries: z.infer<typeof costInput>[]) {
  return db.begin(async (transaction) => {
    const result = [];
    for (const entry of entries) {
      const project = entry.project_id === undefined && entry.cost_center
        ? await first<{ id: string }>(transaction, 'SELECT id FROM projects WHERE cost_center=$1', [entry.cost_center]) : undefined;
      result.push(await first(transaction, `INSERT INTO costs(project_id,source,reference,cost_center,name,cents)
        VALUES($1,$2,$3,$4,$5,$6)
        ON CONFLICT(source,reference) DO UPDATE SET cost_center=excluded.cost_center,name=excluded.name,cents=excluded.cents,
          project_id=CASE WHEN $7::boolean THEN excluded.project_id ELSE coalesce(costs.project_id,excluded.project_id) END
        RETURNING *`, [entry.project_id ?? project?.id ?? null, entry.source, entry.reference, entry.cost_center ?? '', entry.name, entry.cents, entry.project_id !== undefined]));
    }
    return result;
  });
}

export async function assignCost(id: string, project: string | null) {
  return required(await first<{id:string} & Record<string,unknown>>(db, 'UPDATE costs SET project_id=$2 WHERE id=$1 RETURNING *', [id, project]));
}

export async function listCosts(limit: number, offset: number) {
  return rows(db, 'SELECT * FROM costs ORDER BY (project_id IS NULL) DESC,name,id LIMIT $1 OFFSET $2', [limit, offset]);
}

export async function controlling(projectId: string) {
  await getProject(projectId);
  const result = await first<{ planned_buy: number; planned_sell: number; actual: number }>(db, `
    SELECT COALESCE((SELECT sum(quantity::bigint*unit_cents) FROM lines WHERE project_id=$1 AND kind='buy'),0)::float8 AS planned_buy,
           COALESCE((SELECT sum(quantity::bigint*unit_cents) FROM lines WHERE project_id=$1 AND kind='sell'),0)::float8 AS planned_sell,
           COALESCE((SELECT sum(cents) FROM costs WHERE project_id=$1),0)::float8 AS actual`, [projectId]);
  return { ...result, difference: (result?.actual ?? 0) - (result?.planned_buy ?? 0) };
}
