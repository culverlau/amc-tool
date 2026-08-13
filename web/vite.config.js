import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Served from the domain root on Vercel — the old VITE_BASE_PATH / '/amc-tool/'
// subpath juggling was a GitHub Pages requirement and is gone with it.
export default defineConfig({
  plugins: [react()],
})
