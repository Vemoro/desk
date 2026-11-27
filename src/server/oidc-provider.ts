import { genericOAuth } from 'better-auth/plugins';
import { createRemoteJWKSet, customFetch, decodeJwt } from 'jose';
import { z } from 'zod';
import { getOidcProfile, oidcAccountKey, oidcProviderId } from './oidc-accounts';
import { configuredOidc, discoverOidc, fetchOidc } from './oidc-discovery';

export const oidcStartPath = '/api/auth/oidc';
export const oidcCallbackPath = `/api/auth/callback/${oidcProviderId}`;

const tokenResponse = z.object({ id_token: z.string().min(1) });
const formValue = (value: string) => new URLSearchParams({ v: value }).toString().slice(2);

export async function createOidcProvider(config: NonNullable<ReturnType<typeof configuredOidc>>) {
  const { issuer, clientId, clientSecret } = config;
  const metadata = await discoverOidc(issuer);
  const methods = metadata.token_endpoint_auth_methods_supported ?? ['client_secret_basic'];
  const basic = methods.includes('client_secret_basic');
  if (!basic && !methods.includes('client_secret_post')) {
    throw new Error('Der OIDC-Anbieter unterstützt keinen Anmeldeweg mit Client-Secret.');
  }
  const authorizationUrl = metadata.authorization_endpoint;
  const tokenUrl = metadata.token_endpoint;
  const jwks = createRemoteJWKSet(new URL(metadata.jwks_uri), { [customFetch]: fetchOidc });
  const provider = genericOAuth({ config: [{
    providerId: oidcProviderId,
    clientId,
    clientSecret,
    authorizationUrl,
    tokenUrl,
    scopes: ['openid'],
    pkce: true,
    disableSignUp: true,
    disableProviderLogout: true,
    accountSubject: ({ profile }) => oidcAccountKey(issuer, String(profile.sub)),
    async getToken({ code, redirectURI, codeVerifier }) {
      if (!codeVerifier) throw new Error('OIDC benötigt PKCE.');
      const body = new URLSearchParams({
        grant_type: 'authorization_code', code, redirect_uri: redirectURI, code_verifier: codeVerifier,
      });
      const headers = new Headers({ Accept: 'application/json' });
      if (basic) {
        const credentials = Buffer.from(`${formValue(clientId)}:${formValue(clientSecret)}`).toString('base64');
        headers.set('Authorization', `Basic ${credentials}`);
      } else {
        body.set('client_id', clientId);
        body.set('client_secret', clientSecret);
      }
      const response = await fetchOidc(tokenUrl, { method: 'POST', headers, body });
      const tokens = tokenResponse.safeParse(await response.json());
      if (!tokens.success) throw new Error('Der OIDC-Anbieter hat kein ID-Token geliefert.');
      // Desk calls no provider APIs and does not retain the provider's credentials.
      return { idToken: tokens.data.id_token };
    },
    async getUserInfo({ idToken }) {
      if (!idToken) return null;
      // Generic OAuth verifies signature, claims and nonce before this hook.
      const { sub } = decodeJwt(idToken);
      if (typeof sub !== 'string' || !sub) return null;
      const profile = await getOidcProfile(issuer, sub);
      return profile ? { ...profile, sub, emailVerified: false } : null;
    },
  }] });

  return {
    ...provider,
    async init(context: Parameters<typeof provider.init>[0]) {
      const result = await provider.init(context);
      const oidc = result.context.socialProviders.find(item => item.id === oidcProviderId);
      if (!oidc) throw new Error('Der OIDC-Anbieter konnte nicht eingerichtet werden.');
      // Supply the already validated Discovery values to Better Auth. Passing a
      // discoveryUrl to Generic OAuth would make it fetch the metadata again.
      oidc.issuer = issuer;
      oidc.requiresIdTokenNonce = true;
      oidc.idToken = {
        issuer,
        audience: clientId,
        algorithms: metadata.id_token_signing_alg_values_supported,
        jwks,
        verifyClaims: ({ aud, azp, exp, iat }) =>
          (aud === clientId || (Array.isArray(aud) && aud.length === 1 && aud[0] === clientId))
          && (azp === undefined || azp === clientId)
          && typeof exp === 'number' && exp > Date.now() / 1000
          && typeof iat === 'number',
      };
      const getUserInfo = oidc.getUserInfo;
      oidc.getUserInfo = tokens => tokens.expectedIdTokenNonce ? getUserInfo(tokens) : Promise.resolve(null);
      return result;
    },
  };
}
