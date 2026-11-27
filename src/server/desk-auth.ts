import { password } from 'bun';
import { APIError, betterAuth } from 'better-auth';
import { passkey } from '@better-auth/passkey';
import { Pool } from 'pg';
import { configuredOrigin } from './origin';
import { configuredOidc } from './oidc-discovery';
import { createOidcProvider } from './oidc-provider';

const sessionSeconds = 43_200;

let pool: Pool | undefined;

function createDeskAuth(oidc?: Awaited<ReturnType<typeof createOidcProvider>>) {
  const baseURL = configuredOrigin();
  if (!baseURL) throw new Error('DESK_ORIGIN fehlt.');
  const secret = process.env.DESK_AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error('DESK_AUTH_SECRET fehlt oder ist zu kurz.');

  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5, allowExitOnIdle: true });
    pool.on('error', () => console.error('Desk-Anmeldung: Eine inaktive Datenbankverbindung wurde getrennt.'));
  }

  return betterAuth({
    baseURL,
    secret,
    database: pool,
    advanced: { database: { generateId: 'uuid' }, cookiePrefix: 'desk-auth' },
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 12,
      maxPasswordLength: 200,
      password: {
        hash: (value) => password.hash(value),
        verify: ({ hash, password: value }) => password.verify(value, hash),
      },
    },
    user: { modelName: 'auth_users' },
    account: {
      modelName: 'auth_accounts',
      accountLinking: { enabled: false },
      ...(oidc && { updateAccountOnSignIn: false, storeAccountCookie: false }),
    },
    session: { modelName: 'auth_sessions', expiresIn: sessionSeconds, disableSessionRefresh: true },
    verification: { modelName: 'auth_verifications' },
    plugins: [passkey({
      rpID:new URL(baseURL).hostname,
      rpName:'Desk',
      origin:baseURL,
      schema:{passkey:{modelName:'auth_passkeys'}},
      authenticatorSelection:{residentKey:'required',userVerification:'required'},
      registration:{
        requireSession:true,
        afterVerification:({verification})=>{
          if(!verification.registrationInfo?.userVerified) throw new APIError('UNAUTHORIZED');
        },
      },
      authentication:{
        afterVerification:async ({verification, ctx, clientData})=>{
          if(!verification.authenticationInfo.userVerified) throw new APIError('UNAUTHORIZED');
          const credential=await ctx.context.adapter.findOne<{userId:string}>({
            model:'passkey',where:[{field:'credentialID',value:clientData.id}],
          });
          if(!credential || !await ctx.context.internalAdapter.findUserById(credential.userId)) {
            throw new APIError('UNAUTHORIZED');
          }
        },
      },
    }), ...(oidc ? [oidc] : [])],
    telemetry: { enabled: false },
    logger: { disabled: true },
    onAPIError: { throw: true },
  });
}

let instance: ReturnType<typeof createDeskAuth> | undefined;
export function deskAuth() {
  return instance ??= createDeskAuth();
}

let oidcInstance: Promise<ReturnType<typeof createDeskAuth>> | undefined;

export function deskOidcAuth(config: NonNullable<ReturnType<typeof configuredOidc>>) {
  // Local authentication never waits for the optional provider or its metadata.
  return oidcInstance ??= createOidcProvider(config).then(createDeskAuth).catch(error => {
    oidcInstance = undefined;
    throw error;
  });
}
