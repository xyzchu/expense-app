import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: {
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
    __BUILD_TIME__: JSON.stringify(new Date().toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false })),
  },
});