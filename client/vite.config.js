import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Proxy API calls in dev so the browser sees one origin (no CORS setup needed).
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/tickets': 'http://localhost:3000' } },
});
