export function configuredOrigin() {
  const value=process.env.DESK_ORIGIN;
  if(value===undefined) return;
  const url=URL.parse(value);
  if(url && /^https?:\/\/[^/]+\/?$/i.test(value) && !/[\p{Cc}\s\\?#@]/u.test(value) &&
    (url.protocol==='https:' || ['localhost','127.0.0.1','[::1]'].includes(url.hostname))) {
    return url.origin;
  }
  throw new Error('DESK_ORIGIN muss eine HTTPS-Basisadresse ohne Pfad, Zugangsdaten, Query oder Fragment sein. HTTP ist nur über Loopback zulässig.');
}
