import { createFileRoute } from '@tanstack/react-router';
import { handle } from '../../../server/api';

const handler = ({request}:{request:Request})=>handle(request);
export const Route = createFileRoute('/api/v1/$')({
  server: { handlers:{ GET:handler, POST:handler, PATCH:handler, DELETE:handler } },
});
