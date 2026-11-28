import { expect, test } from 'bun:test';
import { fixture } from './fixture';
import { required } from '../src/server/errors';

const database = process.env.DATABASE_URL;
if (!database || !new URL(database).pathname.endsWith('_test')) {
  throw new Error('Tests benötigen eine isolierte DATABASE_URL mit Endung _test.');
}

const { createAccount, createToken } = await import('../src/server/auth');
const { handle } = await import('../src/server/api');
const { saveCore } = await import('../src/server/core');
const { db, first } = await import('../src/server/db');
const { createReservation } = await import('../src/server/stock');

test('Reservierungsseiten behalten die Zeitfolge bei Offset-Gleichstand und Mikrosekunden', async () => {
  const actor = await createAccount({
    email: `sortierung-${crypto.randomUUID()}@example.test`, name: 'Muster Planung',
    password: 'muster-test-passwort', role: 'admin',
  });
  if (!actor) throw new Error('Das Testkonto konnte nicht angelegt werden.');
  const data = await fixture(saveCore, 'Muster Reservierungsfolge');
  // Use an empty day after existing fixtures so this test can run again on the same database.
  const { count: offset, day } = required(await first<{ count: number; day: string }>(db, `
    SELECT count(*)::int AS count,
      to_char(greatest(current_date, max(starts_at AT TIME ZONE 'UTC')::date) + 1, 'YYYY-MM-DD') AS day
    FROM reservations
  `));
  const firstStart = `${day}T08:00:00.000050Z`;
  const base = { project_id: data.project, quantity: 1, ends_at: `${day}T10:00:00Z` };
  const item = { item_id: data.material, location_id: data.location };
  const reserve = async (input: Parameters<typeof createReservation>[0]) => {
    const reservation = required(await createReservation(input));
    return reservation.id;
  };
  const last = await reserve({ ...base, ...item, starts_at: `${day}T08:00:00.000900Z` });
  const tiedItem = await reserve({ ...base, ...item, starts_at: `${day}T09:00:00.000100+01:00` });
  const secondTiedItem = await reserve({ ...base, ...item, starts_at: `${day}T08:00:00.000100Z` });
  const tiedPerson = await reserve({ ...base, user_id: actor.id, starts_at: `${day}T08:00:00.000100Z` });
  const firstItem = await reserve({ ...base, ...item, starts_at: firstStart });

  const { token } = await createToken(actor, { label: 'Reservierungen lesen', scope: 'read' });
  async function page(pageOffset: number, limit: number) {
    const params = new URLSearchParams({ limit: String(limit), offset: String(pageOffset) });
    const request = new Request(`http://desk.local/api/v1/reservations?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const response = await handle(request);
    expect(response.status).toBe(200);
    return ((await response.json()) as { id: string }[]).map(row => row.id);
  }
  const [lowerId, higherId] = [tiedItem, secondTiedItem].sort();
  expect(await page(offset, 3)).toEqual([firstItem, tiedPerson, lowerId]);
  expect(await page(offset + 3, 2)).toEqual([higherId, last]);
});
