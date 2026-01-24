import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/SpendGuard/',
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
