import { defineConfig } from 'vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
import { nitro } from 'nitro/vite';
import { migrationFiles } from './src/server/migration-files.js';

export default defineConfig(async () => ({
  define: { __DESK_MIGRATION_FILES__: JSON.stringify(await migrationFiles()) },
  optimizeDeps: { exclude: ['bun'] },
  ssr: { external: ['bun'] },
  plugins: [tanstackStart(), react(), nitro({ preset: 'bun' })],
}));
