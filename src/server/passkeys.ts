import { APIError } from 'better-auth';
import { deskAuth } from './desk-auth';

const endpoints=new Map([
  ['GET /api/auth/passkey/generate-authenticate-options',false],
  ['POST /api/auth/passkey/verify-authentication',false],
  ['GET /api/auth/passkey/generate-register-options',true],
  ['POST /api/auth/passkey/verify-registration',true],
  ['GET /api/auth/passkey/list-user-passkeys',true],
  ['POST /api/auth/passkey/delete-passkey',true],
]);
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};

export async function handlePasskey(request:Request) {
  const path=new URL(request.url).pathname;
  const requiresSession=endpoints.get(`${request.method} ${path}`);
  if(requiresSession===undefined) return Response.json({message:'Endpunkt nicht gefunden.'},{status:404,headers});
  try {
    const origin=new URL(process.env.DESK_ORIGIN ?? request.url).origin;
    if(request.method==='POST' && request.headers.get('origin')!==origin) {
      return Response.json({message:'Die Herkunft der Anfrage stimmt nicht.'},{status:403,headers});
    }
    if(requiresSession && request.headers.has('authorization')) {
      return Response.json({message:'Eine Desk-Sitzung ist erforderlich.'},{status:401,headers});
    }
    const response=await deskAuth().handler(request);
    for(const [name,value] of Object.entries(headers)) response.headers.set(name,value);
    if(response.ok && path==='/api/auth/passkey/generate-authenticate-options') {
      const options=await response.json();
      const responseHeaders=new Headers(response.headers);
      responseHeaders.delete('Content-Length');
      return Response.json({...options,userVerification:'required'},{headers:responseHeaders});
    }
    return response;
  } catch(error) {
    const status=error instanceof APIError ? error.statusCode : 500;
    if(status>=500) console.error('Desk-Anmeldung: Die Passkey-Anfrage ist fehlgeschlagen.');
    return Response.json({message:'Passkey-Anfrage fehlgeschlagen.'},{status,headers});
  }
}
