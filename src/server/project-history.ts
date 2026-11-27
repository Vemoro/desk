import { db, rows, type Query } from './db';

export function recordStage(query:Query, projectId:string, actorId:string | undefined,
  previous:string, status:string, source:'desk' | 'haben') {
  return query.unsafe(`
    INSERT INTO project_history(project_id,actor_id,kind,source,previous_status,status)
    VALUES ($1,$2,'stage',$3,$4,$5)
  `,[projectId,actorId ?? null,source,previous,status]);
}

export function recordReservation(query:Query, projectId:string, reservationId:string,
  actorId:string | undefined, status:'firm' | 'released') {
  return query.unsafe(`
    INSERT INTO project_history(project_id,reservation_id,actor_id,kind,source,status)
    VALUES ($1,$2,$3,'reservation','desk',$4)
  `,[projectId,reservationId,actorId ?? null,status]);
}

export function releaseProjectReservations(query:Query, projectId:string, actorId:string | undefined) {
  return query.unsafe(`
    WITH released AS (
      UPDATE reservations SET status='released'
      WHERE project_id=$1 AND status<>'released'
      RETURNING id,project_id
    )
    INSERT INTO project_history(project_id,reservation_id,actor_id,kind,source,status)
    SELECT project_id,id,$2,'reservation','project','released' FROM released
  `,[projectId,actorId ?? null]);
}

export function listProjectHistory(projectId:string, limit:number, offset:number) {
  return rows(db,`
    SELECT e.*, u.name AS actor_name
    FROM (
      SELECT h.id,h.created_at,h.actor_id,h.kind,h.source,h.status,h.previous_status,h.reservation_id,
        COALESCE(person.name,item.name) AS resource_name,item.inventory_number,warehouse.name AS location_name,
        r.quantity,NULL::text AS correction_reason
      FROM project_history h
      LEFT JOIN reservations r ON r.id=h.reservation_id AND r.project_id=h.project_id
      LEFT JOIN users person ON person.id=r.user_id
      LEFT JOIN items item ON item.id=r.item_id
      LEFT JOIN locations warehouse ON warehouse.id=r.location_id
      WHERE h.project_id=$1
      UNION ALL
      SELECT m.id,m.created_at,m.actor_id,'movement','desk',m.action,NULL,m.reservation_id,
        item.name,item.inventory_number,warehouse.name,m.quantity,m.correction_reason
      FROM movements m
      JOIN items item ON item.id=m.item_id
      JOIN locations warehouse ON warehouse.id=m.location_id
      WHERE m.project_id=$1
    ) e
    LEFT JOIN users u ON u.id=e.actor_id
    ORDER BY e.created_at DESC,e.kind,e.id LIMIT $2 OFFSET $3
  `,[projectId,limit,offset]);
}
