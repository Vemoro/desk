import { expect, test } from 'bun:test';
import { configuredOidc, discoverOidc, fetchOidc } from '../src/server/oidc-discovery';

const issuer = 'https://id.example.test/realms/muster';
const metadata = {
  issuer,
  authorization_endpoint: issuer + '/authorize',
  token_endpoint: issuer + '/token',
  jwks_uri: issuer + '/jwks',
  userinfo_endpoint: issuer + '/userinfo',
  id_token_signing_alg_values_supported: ['RS256'],
};

test('OIDC ist ohne Konfiguration deaktiviert und unterstützt den vollständigen Issuer-Pfad', async () => {
  expect(configuredOidc({})).toBeUndefined();
  expect(configuredOidc({ DESK_OIDC_ISSUER: issuer, DESK_OIDC_CLIENT_ID: 'desk', DESK_OIDC_CLIENT_SECRET: 'muster' }))
    .toEqual({ issuer, clientId: 'desk', clientSecret: 'muster' });
  expect(() => configuredOidc({ DESK_OIDC_ISSUER: issuer })).toThrow();
  expect(() => configuredOidc({
    DESK_OIDC_ISSUER: issuer + '#',
    DESK_OIDC_CLIENT_ID: 'desk',
    DESK_OIDC_CLIENT_SECRET: 'muster',
  })).toThrow();

  const calls: string[] = [];
  const document = await discoverOidc(issuer, async (url, options) => {
    calls.push(String(url));
    expect(options?.redirect).toBe('error');
    return Response.json(metadata);
  });
  expect(document).toEqual(metadata);
  expect(calls).toEqual([issuer + '/.well-known/openid-configuration']);
});

test('OIDC verwirft unpassende Issuer und unsichere Endpunkte vor Nutzung', async () => {
  const variants = [
    { ...metadata, issuer: undefined },
    { ...metadata, issuer: issuer + '/anderer-pfad' },
    { ...metadata, jwks_uri: undefined },
    ...(['authorization_endpoint', 'token_endpoint', 'jwks_uri', 'userinfo_endpoint'] as const)
      .map(name => ({ ...metadata, [name]: 'http://id.example.test/unsicher' })),
    { ...metadata, token_endpoint: 'https://name:passwort@id.example.test/token' },
    { ...metadata, jwks_uri: '//id.example.test/jwks' },
  ];
  for (const variant of variants) {
    const calls: string[] = [];
    await expect(discoverOidc(issuer, async url => {
      calls.push(String(url));
      return Response.json(variant);
    })).rejects.toThrow('OIDC-Anbieterkonfiguration');
    expect(calls).toEqual([issuer + '/.well-known/openid-configuration']);
  }
});

test('OIDC-Transport folgt keiner Weiterleitung und sendet keine HTTP-Anfragen', async () => {
  const calls: string[] = [];
  const redirect = async (url: string | URL, options?: RequestInit) => {
    calls.push(String(url));
    expect(options?.redirect).toBe('error');
    return Response.redirect('http://id.example.test/unsicher');
  };
  await expect(fetchOidc(metadata.token_endpoint, { method: 'POST' }, redirect)).rejects.toThrow();
  await expect(fetchOidc('http://id.example.test/unsicher', undefined, redirect)).rejects.toThrow();
  expect(calls).toEqual([metadata.token_endpoint]);
});
