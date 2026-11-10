import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

export default defineConfig({
  plugins: [{
    name: 'explorer-sharing-page',
    // A real page, not a redirect: sharing crawlers can fetch a fresh card while
    // visitors get the same explorer. Derive it from the built homepage so the
    // content, metadata, and asset references cannot drift between copies.
    writeBundle({dir}) {
      const output=path.resolve(dir||'dist');
      const page=fs.readFileSync(path.join(output,'index.html'),'utf8')
        .replace('</head>','<meta property="og:url" content="https://corl.operatic.ai/explore/" />\n</head>')
        .replaceAll('/social/corl-explorer-chrome.png','/social/corl-explorer-share-v2.png');
      fs.mkdirSync(path.join(output,'explore'),{recursive:true});
      fs.writeFileSync(path.join(output,'explore/index.html'),page);
      fs.copyFileSync(path.join(output,'social/corl-explorer-chrome.png'),path.join(output,'social/corl-explorer-share-v2.png'));
    },
  }],
  build: { rollupOptions: { input: { main: 'index.html', trends: 'trends.html' } } },
  server: {
    // Background indexing should not close a reader or interrupt a search.
    // Reload manually to pick up an updated data snapshot.
    watch: { ignored: ['**/public/data/**', '**/public/figures/**'] },
  },
});
