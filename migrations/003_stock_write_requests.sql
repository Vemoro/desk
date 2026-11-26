CREATE TABLE stock_write_requests (
  actor_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  operation text NOT NULL,
  request_key text NOT NULL,
  request_data jsonb NOT NULL,
  response_data jsonb NOT NULL,
  PRIMARY KEY (actor_id, operation, request_key)
);
