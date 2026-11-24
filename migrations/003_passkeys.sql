CREATE TABLE auth_passkeys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text CHECK (char_length(name) <= 80),
  "publicKey" text NOT NULL,
  "userId" uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "credentialID" text NOT NULL UNIQUE,
  counter bigint NOT NULL,
  "deviceType" text NOT NULL,
  "backedUp" boolean NOT NULL,
  transports text,
  "createdAt" timestamptz,
  aaguid text
);
CREATE INDEX auth_passkeys_user_idx ON auth_passkeys("userId");
CREATE INDEX auth_verifications_expires_idx ON auth_verifications("expiresAt");
