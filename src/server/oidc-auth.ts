import { withAccountAccess } from './accounts';
import { deskOidcAuth } from './desk-auth';
import { oidcProviderId } from './oidc-accounts';
import { configuredOidc } from './oidc-discovery';
import { oidcCallbackPath, oidcStartPath } from './oidc-provider';
import { configuredOrigin } from './origin';

const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const failurePath = '/?oidc=failed';

export function isOidcRequest(request: Request) {
  const path = new URL(request.url).pathname;
  return (path === oidcStartPath && (request.method === 'GET' || request.method === 'POST'))
    || (path === oidcCallbackPath && request.method === 'GET');
}

export async function handleOidc(request: Request) {
  if (new URL(request.url).pathname === oidcStartPath && request.method === 'GET') {
    let enabled = false;
    try {
      enabled = Boolean(configuredOidc() && configuredOrigin()?.startsWith('https://'));
    } catch {
      // An incomplete provider configuration must leave local sign-in available.
    }
    return Response.json({ enabled }, { headers });
  }
  const start = request.method === 'POST';
  try {
    const config = configuredOidc();
    if (!config) return new Response(null, { status: 404, headers });
    const origin = configuredOrigin();
    if (!origin?.startsWith('https://')) {
      throw new Error('OIDC benötigt eine HTTPS-Adresse für Desk.');
    }
    if (start && request.headers.get('origin') !== origin) {
      return Response.json({ message: 'Die Herkunft der Anfrage stimmt nicht.' }, { status: 403, headers });
    }
    const auth = await deskOidcAuth(config);
    if (!start) {
      const result = await withAccountAccess('shared', () => auth.handler(request));
      const location = result.headers.get('location');
      // Provider errors can contain parameters Desk should never forward.
      const success = result.status === 302 && location && new URL(location, origin).href === `${origin}/`;
      const responseHeaders = new Headers(headers);
      responseHeaders.set('Location', success ? '/' : failurePath);
      for (const cookie of result.headers.getSetCookie()) responseHeaders.append('Set-Cookie', cookie);
      return new Response(null, { status: 303, headers: responseHeaders });
    }

    const requestHeaders = new Headers(request.headers);
    requestHeaders.delete('Content-Length');
    requestHeaders.set('Content-Type', 'application/json');
    const response = await auth.handler(new Request(`${origin}/api/auth/sign-in/social`, {
      method: 'POST',
      headers: requestHeaders,
      body: JSON.stringify({ provider: oidcProviderId, callbackURL: '/', errorCallbackURL: failurePath, disableRedirect: true }),
    }));
    if (!response.ok) throw new Error('Der OIDC-Anmeldeweg konnte nicht gestartet werden.');
    for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
    return response;
  } catch {
    if (!start) return new Response(null, { status: 303, headers: { ...headers, Location: failurePath } });
    return Response.json({ message: 'Die Anmeldung über OpenID Connect ist derzeit nicht möglich.' }, { status: 503, headers });
  }
}
