import { db } from '../src/server/db';
import { createAccount } from '../src/server/accounts';

try {
  const [, , email, name] = process.argv;
  const password = process.env.DESK_ADMIN_PASSWORD;
  if (!email || !name || !password) throw new Error('DESK_ADMIN_PASSWORD setzen und bun run admin <E-Mail> <Name> aufrufen.');
  await createAccount({ email, name, password, role: 'admin' });
} finally {
  await db.close();
}
