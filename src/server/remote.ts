import { DeskError } from './errors';

export class RemoteError extends DeskError {
  constructor(message: string, public upstream?: number) { super(502, message); }
}

export function integration(service: 'HABEN' | 'ZAMMAD') {
  const base = process.env[`${service}_URL`];
  const token = process.env[`${service}_TOKEN`];
  if (!base || !token) throw new DeskError(503, `${service} ist nicht eingerichtet.`);
  const url = URL.parse(base);
  if (!url || url.username || url.password || url.pathname !== '/' || url.search || url.hash ||
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost','127.0.0.1'].includes(url.hostname)))) {
    throw new DeskError(503, `${service}_URL muss eine HTTPS-Basisadresse sein.`);
  }
  const origin=url.origin;
  const authorization = service === 'HABEN' ? `Bearer ${token}` : `Token token=${token}`;
  async function requestResponse(path:string,method:string,accept:string,body?:unknown) {
    let result:Response;
    try {
      result=await fetch(new URL(`/api/v1${path}`,origin),{
        method,redirect:'error',signal:AbortSignal.timeout(12_000),
        headers:{Authorization:authorization,'Content-Type':'application/json',Accept:accept},
        body:body===undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new RemoteError(`${service} ist nicht erreichbar oder die Antwort ist unklar.`);
    }
    if(!result.ok) {
      await result.body?.cancel();
      throw new RemoteError(`${service} antwortet mit HTTP ${result.status}.`,result.status);
    }
    return result;
  }
  return {
    origin,
    download:(path:string)=>requestResponse(path,'GET','*/*'),
    async request(path: string, method = 'GET', body?: unknown): Promise<unknown> {
      const result=await requestResponse(path,method,'application/json',body);
      try {
        return await result.json();
      } catch {
        throw new RemoteError(`${service} hat keine gültige JSON-Antwort geliefert.`);
      }
    },
  };
}

export function integrationStatus() {
  return {
    haben: Boolean(process.env.HABEN_URL && process.env.HABEN_TOKEN),
    zammad: Boolean(process.env.ZAMMAD_URL && process.env.ZAMMAD_TOKEN),
  };
}
