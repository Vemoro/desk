ALTER TABLE tasks ADD COLUMN kanban_position integer CHECK (kanban_position > 0);

WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY project_id, status ORDER BY name, id) AS position
  FROM tasks
)
UPDATE tasks
SET kanban_position = ranked.position::integer
FROM ranked
WHERE tasks.id = ranked.id;

CREATE INDEX tasks_kanban_order_idx ON tasks (project_id, status, kanban_position, id);
