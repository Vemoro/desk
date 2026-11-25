ALTER TABLE users
  ADD COLUMN "emailVerified" boolean NOT NULL DEFAULT false,
  ADD COLUMN image text,
  ADD COLUMN "createdAt" timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN "updatedAt" timestamptz NOT NULL DEFAULT now();

-- Better Auth reads the user projection; Desk owns account creation and roles.
CREATE VIEW auth_users AS SELECT id, email, name, "emailVerified", image, "createdAt", "updatedAt" FROM users;

CREATE TABLE auth_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  "expiresAt" timestamptz NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "ipAddress" text,
  "userAgent" text
);
CREATE INDEX auth_sessions_user_idx ON auth_sessions("userId");

CREATE TABLE auth_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "providerId" text NOT NULL,
  "accountId" text NOT NULL,
  password text,
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,
  "accessTokenExpiresAt" timestamptz,
  "refreshTokenExpiresAt" timestamptz,
  scope text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("providerId", "accountId")
);
CREATE INDEX auth_accounts_user_idx ON auth_accounts("userId");

CREATE TABLE auth_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier text NOT NULL,
  value text NOT NULL,
  "expiresAt" timestamptz NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auth_verifications_identifier_idx ON auth_verifications(identifier);

INSERT INTO auth_accounts("userId","providerId","accountId",password)
  SELECT id,'credential',id::text,password_hash FROM users;

-- Old application versions can still create accounts during an application-only rollback.
CREATE FUNCTION provision_auth_account() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO auth_accounts("userId","providerId","accountId",password)
    VALUES (NEW.id,'credential',NEW.id::text,NEW.password_hash);
  RETURN NEW;
END;
$$;
CREATE TRIGGER user_auth_account AFTER INSERT ON users
  FOR EACH ROW EXECUTE FUNCTION provision_auth_account();

-- The old binary may be used for rollback, but pre-upgrade cookies stay revoked.
DELETE FROM sessions;
