import { db, first, rows, type Query } from './db';
import { DeskError, required } from './errors';
import type { TaskStatus } from './contracts';

export async function lockKanban(query:Query,projectId:string) {
  return first(query,'SELECT id FROM projects WHERE id=$1 FOR UPDATE',[projectId]);
}

const positionsJoin='LEFT JOIN kanban_positions p ON p.task_id=t.id';

export function listKanbanTasks() {
  return rows(db,`SELECT t.*,p.position AS kanban_position FROM tasks t ${positionsJoin} ORDER BY t.name,t.id`);
}

function column(query:Query,projectId:string,status:TaskStatus) {
  return rows<{id:string}>(query,`SELECT t.id FROM tasks t ${positionsJoin} WHERE t.project_id=$1 AND t.status=$2
    ORDER BY p.position NULLS LAST,t.name,t.id`,[projectId,status]);
}

export async function setKanbanPosition(query:Query,taskId:string,position:number) {
  await query.unsafe(`INSERT INTO kanban_positions (task_id,position) VALUES ($1,$2)
    ON CONFLICT (task_id) DO UPDATE SET position=excluded.position`,[taskId,position]);
}

async function saveColumn(query:Query,taskIds:string[]) {
  await query.unsafe(`INSERT INTO kanban_positions (task_id,position)
    SELECT ordered.id::uuid,ordered.position::integer
    FROM jsonb_array_elements_text($1::text::jsonb) WITH ORDINALITY AS ordered(id,position)
    ON CONFLICT (task_id) DO UPDATE SET position=excluded.position`,[JSON.stringify(taskIds)]);
}

export async function appendKanbanPosition(query:Query,projectId:string,status:TaskStatus) {
  const positions=required(await first<{last:number;missing:boolean|null}>(query,`SELECT
    coalesce(max(p.position),0) AS last,bool_or(p.position IS NULL) AS missing
    FROM tasks t ${positionsJoin} WHERE t.project_id=$1 AND t.status=$2`,[projectId,status]));
  if(!positions.missing) return positions.last+1;

  // Cards written by an older application after rollback are included before a new append.
  const taskIds=(await column(query,projectId,status)).map(task=>task.id);
  await saveColumn(query,taskIds);
  return taskIds.length+1;
}

export async function moveKanbanTask(projectId:string,taskId:string,status:TaskStatus,beforeTaskId:string|null) {
  return db.begin(async transaction=>{
    required(await lockKanban(transaction,projectId),'Projekt nicht gefunden.');
    const task=required(await first<{id:string}>(transaction,'SELECT id FROM tasks WHERE id=$1 AND project_id=$2',
      [taskId,projectId]),'Karte in diesem Projekt nicht gefunden.');
    const targets=(await column(transaction,projectId,status)).map(card=>card.id).filter(id=>id!==task.id);
    const before=beforeTaskId===null ? targets.length : targets.indexOf(beforeTaskId.toLowerCase());
    if(before<0) throw new DeskError(409,'Die Zielkarte befindet sich nicht mehr in dieser Spalte.');
    targets.splice(before,0,task.id);
    await transaction.unsafe('UPDATE tasks SET status=$1 WHERE id=$2 AND project_id=$3',[status,task.id,projectId]);
    await saveColumn(transaction,targets);
    return {id:task.id,status,kanban_position:before+1};
  });
}
