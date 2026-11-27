import { z } from 'zod';

type OidcFetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

function httpsUrl(value: string) {
  const authority = /^https:\/\/([^/?#]+)/.exec(value)?.[1];
  const url = URL.parse(value);
  if (!authority || authority.includes('@') || !url || /[\p{Cc}\s\\#]/u.test(value)) return null;
  return url;
}

export function configuredOidc(env: Record<string, string | undefined> = process.env) {
  const issuer = env.DESK_OIDC_ISSUER;
  const clientId = env.DESK_OIDC_CLIENT_ID;
  const clientSecret = env.DESK_OIDC_CLIENT_SECRET;
  if (!issuer && !clientId && !clientSecret) return;
  if (!issuer || !httpsUrl(issuer) || issuer.includes('?') || !clientId || !clientSecret) {
    throw new Error('OIDC benötigt eine HTTPS-Issuer-URL, eine Client-ID und ein Client-Secret.');
  }
  return { issuer, clientId, clientSecret };
}

const endpoint = z.string().refine(value => httpsUrl(value) !== null);
const metadata = z.object({
  issuer: z.string(),
  authorization_endpoint: endpoint,
  token_endpoint: endpoint,
  jwks_uri: endpoint,
  userinfo_endpoint: endpoint.optional(),
  id_token_signing_alg_values_supported: z.array(z.string()).min(1),
  token_endpoint_auth_methods_supported: z.array(z.string()).optional(),
});

export async function fetchOidc(url: string | URL, options?: RequestInit, request: OidcFetch = fetch) {
  if (!httpsUrl(String(url))) throw new Error('OIDC benötigt für alle Endpunkte HTTPS.');
  const response = await request(url, {
    ...options,
    // Discovery, token requests and key lookups use the configured final URL.
    redirect: 'error',
    signal: options?.signal ?? AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error('Der OIDC-Anbieter hat die Anfrage abgelehnt.');
  return response;
}

export async function discoverOidc(issuer: string, request?: OidcFetch) {
  const discoveryUrl = issuer.replace(/\/$/, '') + '/.well-known/openid-configuration';
  const response = await fetchOidc(discoveryUrl, undefined, request);
  const result = metadata.safeParse(await response.json());
  if (!result.success || result.data.issuer !== issuer) {
    throw new Error('Die OIDC-Anbieterkonfiguration passt nicht zum eingestellten Issuer.');
  }
  return result.data;
}
