import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/', // necesario para que React Router funcione en producción
  build: {
    outDir: 'dist',   // Vercel detecta automáticamente esta carpeta
    sourcemap: false,  // opcional, reduce tamaño
    emptyOutDir: true, // limpia dist antes de build
  },
})
