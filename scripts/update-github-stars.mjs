import {writeFileSync} from 'node:fs';

// Pipe `gh api repos/operatic-ai/corl-explorer` here. Publish only the count,
// never the authenticated response or credentials.
let input = '';
for await (const chunk of process.stdin) input += chunk;
const data = JSON.parse(input);
if (data.full_name !== 'operatic-ai/corl-explorer' ||
    !Number.isSafeInteger(data.stargazers_count) || data.stargazers_count < 0) {
  throw new Error('Invalid GitHub repository star count');
}
writeFileSync(new URL('../public/data/github-stars.json', import.meta.url),
  JSON.stringify({stars: data.stargazers_count}, null, 2) + '\n');
