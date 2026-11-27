import { useEffect, useState } from 'react';

const endpoint = '/api/auth/oidc';
const failed = 'Die Anmeldung mit dem Organisationskonto ist fehlgeschlagen. Du kannst es erneut versuchen oder Passwort und Passkey verwenden.';

export function OidcLogin() {
  const [enabled, setEnabled] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const address = new URL(location.href);
    if (address.searchParams.get('oidc') === 'failed') {
      setError(failed);
      address.searchParams.delete('oidc');
      history.replaceState(history.state, '', address);
    }
    const controller = new AbortController();
    void fetch(endpoint, { signal: controller.signal })
      .then(response => response.ok ? response.json() : null)
      .then(status => { if (!controller.signal.aborted) setEnabled(status?.enabled === true); })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  async function signIn() {
    if (pending) return;
    setPending(true);
    setError('');
    try {
      const response = await fetch(endpoint, { method: 'POST' });
      if (!response.ok) throw new Error();
      const result = await response.json();
      const target = new URL(result.url);
      if (target.protocol !== 'https:') throw new Error();
      location.assign(target);
    } catch {
      setError(failed);
      setPending(false);
    }
  }

  if (!enabled && !error) return null;
  return <div className="oidc-login">
    {enabled && <button type="button" disabled={pending} onClick={() => void signIn()}>
      {pending ? 'Anbieter wird geöffnet …' : 'Mit Organisationskonto anmelden'}
    </button>}
    {error && <p className="inline-error" role="alert">{error}</p>}
  </div>;
}
