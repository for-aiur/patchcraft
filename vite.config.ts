import { defineConfig } from 'vite';
export default defineConfig({ server: { proxy: { '/api': process.env.AUTHORING_PROXY || 'http://127.0.0.1:3001' } }, preview: { proxy: { '/api': process.env.AUTHORING_PROXY || 'http://127.0.0.1:3001' } }, build: { rollupOptions: { input: { audio: 'index.html', vision: 'vision.html' } } } });
