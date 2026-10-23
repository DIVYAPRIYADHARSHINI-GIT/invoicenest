import adapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		// Server routes exist ONLY for PDF generation and CSV export.
		// Every piece of user data lives in the browser's localStorage - there is no
		// database, no KV, no Blob store and no API key anywhere in this project.
		// Runtime pinned explicitly (the adapter refuses to infer one from newer local Node versions).
		adapter: adapter({ runtime: 'nodejs22.x' })
	}
};

export default config;
