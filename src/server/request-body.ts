import { DeskError } from './errors';

export async function readRequestBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new DeskError(400,'JSON fehlt.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const next = await reader.read();
    if (next.done) break;
    size += next.value.byteLength;
    if (size > 7_200_000) {
      await reader.cancel();
      throw new DeskError(413,'Die Anfrage ist zu groß.');
    }
    chunks.push(next.value);
  }
  return Buffer.concat(chunks);
}

export async function readJson(request: Request) {
  if (request.headers.get('content-type')?.split(';')[0] !== 'application/json') throw new DeskError(415,'JSON ist erforderlich.');
  const body = await readRequestBody(request);
  try { return JSON.parse(body.toString('utf8')); }
  catch { throw new DeskError(400,'Ungültiges JSON.'); }
}
