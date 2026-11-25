import { createFileRoute } from '@tanstack/react-router';
import { handlePasskey } from '../../../server/passkeys';

const handler = ({request}:{request:Request})=>handlePasskey(request);
export const Route = createFileRoute('/api/auth/$')({
  server:{handlers:{GET:handler,POST:handler}},
});
