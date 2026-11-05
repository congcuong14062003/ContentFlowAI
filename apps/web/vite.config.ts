import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
const proxy = { '/api': process.env.API_PROXY_TARGET || 'http://127.0.0.1:3000' };
const qaHeaders: Record<string, string> = process.env.QA_SERVER_NONCE ? { 'X-ContentFlow-QA': process.env.QA_SERVER_NONCE } : {};
export default defineConfig({ plugins: [vue(), tailwindcss()], server: { port: 5173, strictPort: true, proxy, headers: qaHeaders }, preview: { port: 5173, strictPort: true, proxy, headers: { ...qaHeaders, 'Content-Security-Policy': "default-src 'self'; connect-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" } } });
