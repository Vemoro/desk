ALTER TABLE users ADD COLUMN blocked boolean NOT NULL DEFAULT false;

CREATE OR REPLACE VIEW auth_users AS
  SELECT id, email, name, "emailVerified", image, "createdAt", "updatedAt"
  FROM users WHERE NOT blocked;
