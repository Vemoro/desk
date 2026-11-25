CREATE TABLE zammad_note_attempts (
  LIKE outgoing INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES
);

ALTER TABLE zammad_note_attempts
  ADD FOREIGN KEY (project_id) REFERENCES projects(id),
  ALTER COLUMN recipient DROP NOT NULL,
  ADD CHECK (recipient IS NULL AND attachment_name IS NULL AND attachment_data IS NULL AND in_reply_to IS NULL);
