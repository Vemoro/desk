CREATE TABLE kanban_positions (
  task_id uuid PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE,
  position integer NOT NULL CHECK (position > 0)
);

INSERT INTO kanban_positions (task_id,position)
SELECT id,row_number() OVER (PARTITION BY project_id,status ORDER BY name,id)::integer
FROM tasks;

CREATE INDEX tasks_project_status_idx ON tasks (project_id,status);

-- Older application versions can still change status without assigning a position.
CREATE FUNCTION clear_kanban_position_on_status_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM kanban_positions WHERE task_id = NEW.id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER clear_kanban_position_on_status_change
AFTER UPDATE OF status ON tasks
FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION clear_kanban_position_on_status_change();
