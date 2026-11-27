import { createFileRoute } from '@tanstack/react-router';
import { handlePasskey } from '../../../server/passkeys';
import { handleOidc, isOidcRequest } from '../../../server/oidc-auth';

const handler = ({request}:{request:Request})=>isOidcRequest(request) ? handleOidc(request) : handlePasskey(request);
export const Route = createFileRoute('/api/auth/$')({
  server:{handlers:{GET:handler,POST:handler}},
});
