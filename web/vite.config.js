import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Served from the domain root on Vercel — the old VITE_BASE_PATH / '/amc-tool/'
// subpath juggling was a GitHub Pages requirement and is gone with it.
export default defineConfig({
  plugins: [react()],
  // Fixed, uncommon port (5173 collides with other local apps); add it to Supabase's redirect URLs
  server: { port: 5317, strictPort: true },
})
