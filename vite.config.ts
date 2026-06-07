import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';
import {defineConfig, loadEnv} from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VITE_WATCH_IGNORES = [
  '**/.git/**',
  '**/.kaggle/**',
  '**/.mongodb/**',
  '**/.venv/**',
  '**/assets/**',
  '**/contracts/**',
  '**/datasets/**',
  '**/dist/**',
  '**/ml/artifacts/**',
  '**/node_modules/**',
  '**/*.log',
  '**/*.zip',
];

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: {
        ignored: VITE_WATCH_IGNORES,
      },
    },
  };
});
