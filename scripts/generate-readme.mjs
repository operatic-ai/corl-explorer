import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {tagPaper,topics,tasks} from '../src/catalog.js';
import {summaries} from '../src/summaries.js';

const root=fileURLToPath(new URL('../',import.meta.url));
const read=name=>JSON.parse(fs.readFileSync(path.join(root,name),'utf8'));
const markdown=text=>String(text).replace(/\s+/g,' ').trim().replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\|/g,'&#124;').replace(/[\\`*_[\]]/g,'\\$&');
const link=(label,url)=>`[${markdown(label)}](${encodeURI(url).replaceAll('(','%28').replaceAll(')','%29')})`;
const editions=Array.from({length:10},(_,i)=>read(`public/data/${2026-i}.json`));
const enrichment=read('public/data/enrichment.json'),arxiv=read('public/data/arxiv-matches.json'),presentations=read('public/data/presentations.json');
const code=fs.existsSync(path.join(root,'docs/data/paper-code-links.json'))?read('docs/data/paper-code-links.json'):{};
const papers=editions[0].papers.map(p=>tagPaper({...p,...enrichment[p.id],...presentations[p.id],arxivUrl:enrichment[p.id]?.arxivUrl||p.arxivUrl||arxiv[p.id]?.arxivUrl}));
if(papers.length!==687||new Set(papers.map(p=>p.id)).size!==687)throw new Error('Expected 687 unique 2026 papers');
const groups=[['Oral','🏅'],['Spotlight','🌟'],['Poster','📌']];
if(papers.some(p=>!groups.some(([name])=>name===p.presentation)))throw new Error('Unlisted presentation type');
const counts=Object.fromEntries(groups.map(([name])=>[name,papers.filter(p=>p.presentation===name).length]));
const output=[
 '## 2026 papers','',
 `${papers.length} accepted papers · ${counts.Oral} oral · ${counts.Spotlight} spotlight · ${counts.Poster} poster`,'',
 '[Oral](#-oral) · [Spotlight](#-spotlight) · [Poster](#-poster) · [Earlier years](#earlier-years)','',
 'Click a paper title to open its summary in the explorer. Authors are shown as first author + remaining authors. TL;DRs are AI-written paraphrases of paper abstracts. Tags are inferred from titles; missing links are left out.','',
];
for(const [presentation,emoji] of groups){
 output.push(`### ${emoji} ${presentation}`,'','| Paper | Authors | TL;DR | Tasks & themes | Links |','| --- | --- | --- | --- | --- |');
 for(const paper of papers.filter(p=>p.presentation===presentation).sort((a,b)=>a.title.localeCompare(b.title))){
  const url=`https://corl.operatic.ai/?year=2026&paper=${encodeURIComponent(paper.id)}`;
  const author=(paper.authors?.[0]||'Authors not indexed')+(paper.authors?.length>1?` +${paper.authors.length-1}`:'');
  const summary=summaries[paper.id];
  if(!summary)throw new Error(`Missing summary: ${paper.id}`);
  if(summary.length>120||!summary.endsWith('.')||summary.includes('…'))throw new Error(`Incomplete or overlong summary: ${paper.id}`);
  const tags=[...new Set([...paper.tasks.map(id=>tasks.find(t=>t.id===id).name),...paper.topics.map(id=>topics.find(t=>t.id===id).name)])];
  const links=[];
  if(paper.arxivUrl)links.push(link('arXiv',paper.arxivUrl));
  if(paper.forumUrl)links.push(link('OpenReview',paper.forumUrl));
  for(const [i,entry] of (code[paper.id]?.code||[]).entries())links.push(link(i?'Code '+(i+1):'Code',entry.url));
  output.push(`| ${link(paper.title,url)} | ${markdown(author)} | ${markdown(summary)} | ${tags.map(markdown).join(' · ')} | ${links.join(' · ')} |`);
 }
 output.push('');
}
output.push('## Earlier years','','| Year | Accepted papers | Collection |','| --- | ---: | --- |');
for(const edition of editions.slice(1)){
 const year=edition.papers[0].year;
 output.push(`| ${year} | ${edition.papers.length} | [Explore ${year}](https://corl.operatic.ai/?year=${year}) |`);
}
output.push('');
const start='<!-- PAPERS:START -->',end='<!-- PAPERS:END -->';
const target=path.join(root,'README.md'),current=fs.readFileSync(target,'utf8');
if(!current.includes(start)||!current.includes(end))throw new Error('README paper markers are missing; refusing to overwrite prose');
const generated=output.join('\n');
const result=current.slice(0,current.indexOf(start)+start.length)+'\n\n'+generated+'\n'+current.slice(current.indexOf(end));
if(process.argv.includes('--check')){
 if(result!==current)throw new Error('README paper tables are stale; run npm run docs:readme');
 console.log(`README verified: ${papers.length} papers, ${Object.keys(code).length} papers with code, 9 historical collections.`);
}else{
 fs.writeFileSync(target,result);
 console.log(`README generated: ${papers.length} papers; ${Buffer.byteLength(result).toLocaleString()} bytes.`);
}
