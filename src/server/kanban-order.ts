import { db, first, rows, type Query } from './db';
import { DeskError, required } from './errors';
import type { TaskStatus } from './contracts';

export async function lockKanban(query:Query,projectId:string) {
  required(await first(query,'SELECT id FROM projects WHERE id=$1 FOR UPDATE',[projectId]),'Projekt nicht gefunden.');
}

function column(query:Query,projectId:string,status:TaskStatus) {
  return rows<{id:string}>(query,`SELECT id FROM tasks WHERE project_id=$1 AND status=$2
    ORDER BY kanban_position NULLS LAST,name,id`,[projectId,status]);
}

async function saveColumn(query:Query,projectId:string,status:TaskStatus,taskIds:string[]) {
  await query.unsafe(`UPDATE tasks SET status=$2,kanban_position=ordered.position::integer
    FROM jsonb_array_elements_text($3::text::jsonb) WITH ORDINALITY AS ordered(id,position)
    WHERE tasks.project_id=$1 AND tasks.id=ordered.id::uuid
      AND (tasks.status IS DISTINCT FROM $2 OR tasks.kanban_position IS DISTINCT FROM ordered.position::integer)`,
  [projectId,status,JSON.stringify(taskIds)]);
}

export async function appendKanbanPosition(query:Query,projectId:string,status:TaskStatus) {
  const positions=required(await first<{last:number;missing:boolean|null}>(query,`SELECT
    coalesce(max(kanban_position),0) AS last,bool_or(kanban_position IS NULL) AS missing
    FROM tasks WHERE project_id=$1 AND status=$2`,[projectId,status]));
  if(!positions.missing) return positions.last+1;

  // Cards written by an older application after rollback are included before a new append.
  const taskIds=(await column(query,projectId,status)).map(task=>task.id);
  await saveColumn(query,projectId,status,taskIds);
  return taskIds.length+1;
}

export async function moveKanbanTask(projectId:string,taskId:string,status:TaskStatus,beforeTaskId:string|null) {
  return db.begin(async transaction=>{
    await lockKanban(transaction,projectId);
    const task=required(await first<{id:string}>(transaction,'SELECT id FROM tasks WHERE id=$1 AND project_id=$2',
      [taskId,projectId]),'Karte in diesem Projekt nicht gefunden.');
    const targets=(await column(transaction,projectId,status)).map(card=>card.id).filter(id=>id!==task.id);
    const before=beforeTaskId===null ? targets.length : targets.indexOf(beforeTaskId.toLowerCase());
    if(before<0) throw new DeskError(409,'Die Zielkarte befindet sich nicht mehr in dieser Spalte.');
    targets.splice(before,0,task.id);
    await saveColumn(transaction,projectId,status,targets);
    return {id:task.id,status,kanban_position:before+1};
  });
}
