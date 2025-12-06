// NovaTune/vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
    plugins: [react()],
    server: {
        port: 5173,
        proxy: {
            // Contenidos -> 8001
            '/api/content': {
                target: 'http://127.0.0.1:8001',
                changeOrigin: true,
                rewrite: (p) => p.replace(/^\/api\/content/, '/api/v1'),
            },
            // Estadísticas -> 8000
            '/api/stats': {
                target: 'http://127.0.0.1:8002',
                changeOrigin: true,
                rewrite: (p) => p.replace(/^\/api\/stats/, '/api/v1/stats'),
            },
        },
    },
})
