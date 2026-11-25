import { defineConfig } from 'vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
import { nitro } from 'nitro/vite';
import packageInfo from './package.json' with { type: 'json' };
import { migrationFiles } from './src/server/migration-files.js';

const buildCommit = process.env.DESK_BUILD_COMMIT?.trim() ?? '';
if (buildCommit && !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(buildCommit)) {
  throw new Error('DESK_BUILD_COMMIT muss eine vollständige Git-Commit-ID sein.');
}
const sourceUrl = process.env.DESK_SOURCE_URL?.trim() ?? '';
if (sourceUrl) {
  const url = URL.canParse(sourceUrl) ? new URL(sourceUrl) : null;
  if (!url || url.protocol !== 'https:' || url.username || url.password) {
    throw new Error('DESK_SOURCE_URL muss eine öffentliche HTTPS-Adresse ohne Zugangsdaten sein.');
  }
}

export default defineConfig(async () => ({
  define: {
    __DESK_MIGRATION_FILES__: JSON.stringify(await migrationFiles()),
    __DESK_VERSION__: JSON.stringify(packageInfo.deskVersion),
    __DESK_BUILD_COMMIT__: JSON.stringify(buildCommit),
    __DESK_SOURCE_URL__: JSON.stringify(sourceUrl),
  },
  optimizeDeps: { exclude: ['bun'] },
  ssr: { external: ['bun'] },
  plugins: [tanstackStart(), react(), nitro({ preset: 'bun', plugins: ['./src/server/startup.ts'] })],
}));
