import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [react()],
	// the scene chunk is three.js and the scene together, loaded after first paint. It stands at about 900 kB.
	build: { target: 'es2022', chunkSizeWarningLimit: 950 },
});
