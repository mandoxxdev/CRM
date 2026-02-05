import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Base path - ajuste se o app não estiver na raiz do domínio
  // base: '/crm-gmp/',
  optimizeDeps: {
    include: ['dexie', 'recharts', 'framer-motion'],
  },
  resolve: {
    alias: {
      // Garantir resolução correta dos módulos
    },
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    minify: 'terser',
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'chart-vendor': ['recharts'],
          'db-vendor': ['dexie'],
        },
      },
    },
  },
  server: {
    proxy: {
      // Proxy para APIs de CNPJ (opcional, para evitar CORS)
      '/api/cnpj': {
        target: 'https://brasilapi.com.br',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/cnpj/, '/api/cnpj/v1'),
      },
    },
  },
})


