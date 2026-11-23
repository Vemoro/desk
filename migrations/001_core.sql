
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  name text NOT NULL,
  password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin', 'member'))
);
CREATE TABLE sessions (
  hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);
CREATE TABLE api_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hash text NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES users(id),
  label text NOT NULL,
  scope text NOT NULL CHECK (scope IN ('read', 'write')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, email text NOT NULL DEFAULT '', phone text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '', haben_id uuid UNIQUE, haben_baseline jsonb,
  haben_export_pending boolean NOT NULL DEFAULT false
);
CREATE TABLE projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  contact_id uuid NOT NULL REFERENCES contacts(id),
  stage text NOT NULL DEFAULT 'inquiry' CHECK (stage IN ('inquiry','planning','offered','confirmed','running','complete','cancelled')),
  notes text NOT NULL DEFAULT '',
  due date,
  offer_ref text NOT NULL DEFAULT '',
  invoice_ref text NOT NULL DEFAULT '',
  external_link text NOT NULL DEFAULT '',
  communication_note text NOT NULL DEFAULT '',
  haben_offer_id uuid UNIQUE,
  haben_offer jsonb,
  cost_center text NOT NULL DEFAULT '',
  zammad_ticket_id integer UNIQUE CHECK (zammad_ticket_id > 0)
);
CREATE UNIQUE INDEX project_cost_center_idx ON projects (cost_center) WHERE cost_center <> '';
CREATE TABLE tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id),
  name text NOT NULL,
  status text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','doing','review','done')),
  assignee_id uuid REFERENCES users(id),
  due date
);
CREATE TABLE lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id),
  kind text NOT NULL CHECK (kind IN ('buy','sell')),
  name text NOT NULL, quantity integer NOT NULL CHECK (quantity > 0),
  unit_cents integer NOT NULL CHECK (unit_cents >= 0)
);
CREATE TABLE locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL UNIQUE
);
CREATE TABLE items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, code text NOT NULL UNIQUE,
  kind text NOT NULL CHECK (kind IN ('equipment','consumable')),
  inventory_number text UNIQUE
);
CREATE TABLE reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id),
  user_id uuid REFERENCES users(id),
  item_id uuid REFERENCES items(id),
  location_id uuid REFERENCES locations(id),
  quantity integer NOT NULL CHECK (quantity > 0),
  starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL CHECK (ends_at > starts_at),
  status text NOT NULL DEFAULT 'tentative' CHECK (status IN ('tentative','firm','released')),
  CHECK ((user_id IS NOT NULL AND quantity = 1 AND item_id IS NULL AND location_id IS NULL)
      OR (user_id IS NULL AND item_id IS NOT NULL AND location_id IS NOT NULL))
);
CREATE TABLE movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES items(id),
  location_id uuid NOT NULL REFERENCES locations(id),
  project_id uuid REFERENCES projects(id),
  reservation_id uuid REFERENCES reservations(id),
  actor_id uuid NOT NULL REFERENCES users(id),
  action text NOT NULL CHECK (action IN ('receive','issue','return','consume')),
  quantity integer NOT NULL CHECK (quantity > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id),
  source text NOT NULL, reference text NOT NULL, cost_center text NOT NULL DEFAULT '',
  name text NOT NULL, cents integer NOT NULL,
  UNIQUE(source, reference)
);
CREATE TABLE outgoing (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id),
  ticket_id integer NOT NULL,
  subject text NOT NULL, body text NOT NULL, recipient text NOT NULL,
  attachment_name text, attachment_data text,
  status text NOT NULL CHECK (status IN ('pending','sent','unknown','failed')),
  article_id integer,
  attempted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX movement_item_location ON movements(item_id, location_id);
CREATE INDEX movement_reservation ON movements(reservation_id);
CREATE INDEX reservation_resources ON reservations (item_id, location_id, user_id, starts_at, ends_at) WHERE status = 'firm';
CREATE INDEX task_project ON tasks(project_id);
CREATE INDEX line_project ON lines(project_id);
CREATE INDEX costs_project ON costs(project_id);
