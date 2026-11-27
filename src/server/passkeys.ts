import { APIError } from 'better-auth';
import { deskAuth } from './desk-auth';
import { db } from './db';
import { configuredOrigin } from './origin';
import { withAccountAccess } from './accounts';
import { DeskError } from './errors';
import { readRequestBody } from './request-body';

const authenticationOptions='/api/auth/passkey/generate-authenticate-options';
const registrationOptions='/api/auth/passkey/generate-register-options';
const endpoints=new Map([
  ['GET '+authenticationOptions,false],
  ['POST /api/auth/passkey/verify-authentication',false],
  ['GET '+registrationOptions,true],
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
    const origin=configuredOrigin() ?? new URL(request.url).origin;
    if(request.method==='POST' && request.headers.get('origin')!==origin) {
      return Response.json({message:'Die Herkunft der Anfrage stimmt nicht.'},{status:403,headers});
    }
    if(requiresSession && request.headers.has('authorization')) {
      return Response.json({message:'Eine Desk-Sitzung ist erforderlich.'},{status:401,headers});
    }
    // A streaming client must finish sending before it can delay a revocation.
    const input=request.body ? new Request(request,{body:await readRequestBody(request)}) : request;
    const run=()=>deskAuth().handler(input);
    const response=path===authenticationOptions ? await run() : await withAccountAccess('shared',run);
    for(const [name,value] of Object.entries(headers)) response.headers.set(name,value);
    if(response.ok && (path===authenticationOptions || path===registrationOptions)) {
      await db.unsafe('DELETE FROM auth_verifications WHERE "expiresAt"<=now()');
    }
    if(response.ok && path===authenticationOptions) {
      const options=await response.json();
      const responseHeaders=new Headers(response.headers);
      responseHeaders.delete('Content-Length');
      return Response.json({...options,userVerification:'required'},{headers:responseHeaders});
    }
    return response;
  } catch(error) {
    if(error instanceof DeskError) return Response.json({message:error.message},{status:error.status,headers});
    const status=error instanceof APIError ? error.statusCode : 500;
    if(status>=500) console.error('Desk-Anmeldung: Die Passkey-Anfrage ist fehlgeschlagen.');
    return Response.json({message:'Passkey-Anfrage fehlgeschlagen.'},{status,headers});
  }
}
