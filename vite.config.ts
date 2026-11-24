import { defineConfig } from 'vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
import { nitro } from 'nitro/vite';

export default defineConfig({
  optimizeDeps: { exclude: ['bun'] },
  ssr: { external: ['bun'] },
  plugins: [tanstackStart(), react(), nitro({ preset: 'bun' })],
});
