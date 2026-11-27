CREATE TABLE project_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('stage','reservation')),
  source text NOT NULL CHECK (source IN ('desk','haben','project')),
  previous_status text,
  status text NOT NULL,
  reservation_id uuid REFERENCES reservations(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (
    (kind = 'stage' AND source IN ('desk','haben') AND previous_status IS NOT NULL
      AND previous_status IN ('inquiry','planning','offered','confirmed','running','complete','cancelled')
      AND status IN ('inquiry','planning','offered','confirmed','running','complete','cancelled')
      AND previous_status <> status AND reservation_id IS NULL)
    OR
    (kind = 'reservation' AND source IN ('desk','project') AND previous_status IS NULL
      AND status IN ('firm','released'))
  )
);

CREATE INDEX project_history_project_time ON project_history(project_id, created_at DESC, id);
CREATE INDEX movement_project_time ON movements(project_id, created_at DESC, id) WHERE project_id IS NOT NULL;

-- Match history timestamps to the booking after the planning lock was acquired.
ALTER TABLE movements ALTER COLUMN created_at SET DEFAULT clock_timestamp();
