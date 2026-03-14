import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import tailwindcss from '@tailwindcss/vite'

// GitHub Pages 部署时使用 /StudyFlow/，本地开发和 Electron 使用 ./
const isGitHubPages = process.env.GITHUB_PAGES === 'true';

// https://vite.dev/config/
export default defineConfig({
  base: isGitHubPages ? '/StudyFlow/' : './',
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
