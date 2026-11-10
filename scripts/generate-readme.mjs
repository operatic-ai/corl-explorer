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
const code=fs.existsSync(path.join(root,'public/data/paper-code-links.json'))?read('public/data/paper-code-links.json'):{};
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
// Match the Atlas badges' rounded shape and typography, keeping the CoRL palette.
const badges=[
 ['explore','Explore','online',65,60,'668C7B'],
 ['papers','Accepted papers',editions.reduce((n,e)=>n+e.papers.length,0).toLocaleString('en-US'),115,59,'7696B3'],
 ['years','Years','2017–2026',55,88,'8B9098'],
 ['collection','2026 collection',`${papers.length} papers`,110,85,'668C7B'],
];
for(const [name,label,value,left,right,color] of badges){
 const width=left+right;
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="26" viewBox="0 0 ${width} 26" role="img" aria-label="${label}: ${value}"><title>${label}: ${value}</title><clipPath id="r"><rect width="${width}" height="26" rx="6"/></clipPath><g clip-path="url(#r)"><path fill="#303438" d="M0 0h${left}v26H0z"/><path fill="#${color}" d="M${left} 0h${right}v26H${left}z"/></g><g font-family="Verdana,DejaVu Sans,sans-serif" font-size="11" text-anchor="middle" fill="#fff"><text x="${left/2}" y="17">${label}</text><text x="${left+right/2}" y="17" font-weight="bold">${value}</text></g></svg>\n`;
 const file=path.join(root,`docs/assets/badges/${name}.svg`);
 if(process.argv.includes('--check')){
  if(!fs.existsSync(file)||fs.readFileSync(file,'utf8')!==svg)throw new Error(`Stale README badge: ${name}`);
 }else{
  fs.mkdirSync(path.dirname(file),{recursive:true});
  fs.writeFileSync(file,svg);
 }
}
if(process.argv.includes('--check')){
 if(result!==current)throw new Error('README paper tables are stale; run npm run docs:readme');
 console.log(`README verified: ${papers.length} papers, ${papers.filter(p=>code[p.id]?.code?.length).length} papers with code, 9 historical collections.`);
}else{
 fs.writeFileSync(target,result);
 console.log(`README generated: ${papers.length} papers; ${Buffer.byteLength(result).toLocaleString()} bytes.`);
}
