import { defineConfig } from 'vite';

export default defineConfig({
  build: { rollupOptions: { input: { main: 'index.html', trends: 'trends.html' } } },
  server: {
    // Background indexing should not close a reader or interrupt a search.
    // Reload manually to pick up an updated data snapshot.
    watch: { ignored: ['**/public/data/**', '**/public/figures/**'] },
  },
});
