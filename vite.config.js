import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    open: true,
    proxy: {
      '/comfyui': {
        target: 'http://127.0.0.1:8188',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/comfyui/, ''),
        timeout: 120000,
        proxyTimeout: 120000,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader('Origin', 'http://127.0.0.1:8188')
            proxyReq.setHeader('Referer', 'http://127.0.0.1:8188/')
          })
        },
      },
      '/sv-proxy': {
        target: 'https://maps.googleapis.com',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/sv-proxy/, ''),
      },
    },
  },
})
