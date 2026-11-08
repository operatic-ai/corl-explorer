import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tagPaper, filterPapers, shortSummary } from '../src/catalog.js';
import { summaries } from '../src/summaries.js';

const catalog = JSON.parse(fs.readFileSync(new URL('../public/data/2026.json', import.meta.url)));
const enrichment = JSON.parse(fs.readFileSync(new URL('../public/data/enrichment.json', import.meta.url)));
const papers = catalog.papers.map(p => tagPaper({...p,...enrichment[p.id]}));
const defaults = {year:'2026',query:'',topic:'',task:'',presentation:'',savedOnly:false,sort:'featured'};

test('2026 official program is complete, deduplicated, and links to matching OpenReview IDs', () => {
  assert.equal(papers.length, 687);
  assert.equal(new Set(papers.map(p=>p.id)).size, 687);
  assert.equal(papers.filter(p=>p.presentation==='Oral').length,21);
  assert.equal(papers.filter(p=>p.presentation==='Spotlight').length,72);
  for(const p of papers){
    assert.equal(new URL(p.forumUrl).searchParams.get('id'),p.id);
    assert.equal(p.year,2026);
    assert.ok(p.title.length>10);
    assert.ok(p.authors?.length);
    assert.ok(p.tldr.length>0 && p.tldr.length<=120);
    if(p.figure)assert.ok(fs.existsSync(new URL('../public'+p.figure,import.meta.url)));
  }
});

test('search supports author names, title words and abstracts, combined with task and presentation',()=>{
  assert.ok(filterPapers(papers,{...defaults,query:'hao luo'}).some(p=>p.id==='cfzFrOJmKA'));
  const results=filterPapers(papers,{...defaults,task:'grasping',presentation:'Oral'});
  assert.ok(results.length>0);
  assert.ok(results.every(p=>p.tasks.includes('grasping')&&p.presentation==='Oral'));
  assert.equal(filterPapers(papers,{...defaults,query:'zzzznoexist'}).length,0);
});

test('bookmarks intersect filters and unimported editions never contain 2026 papers',()=>{
  const saved=new Set(['cfzFrOJmKA']);
  assert.deepEqual(filterPapers(papers,{...defaults,savedOnly:true},saved).map(p=>p.id),['cfzFrOJmKA']);
  assert.equal(filterPapers(papers,{...defaults,year:'2025'}).length,0);
});

test('TLDR display is capped at 120 characters without expanding short summaries',()=>{
  for (const text of Object.values(summaries)) assert.ok(text.length<=120);
  assert.equal(shortSummary('A short summary.'),'A short summary.');
  assert.ok(shortSummary('robot learning '.repeat(30)).length<=120);
  assert.equal(shortSummary(null),'');
});

test('all ten editions load with complete metadata and no duplicate paper IDs',()=>{
  const manifest=JSON.parse(fs.readFileSync(new URL('../public/data/index.json',import.meta.url)));
  assert.deepEqual(manifest.years.map(y=>y.year),[2026,2025,2024,2023,2022,2021,2020,2019,2018,2017]);
  const all=manifest.years.flatMap(y=>{
    const data=JSON.parse(fs.readFileSync(new URL('../public'+y.file,import.meta.url)));
    assert.equal(data.papers.length,y.count);
    assert.ok(data.papers.every(p=>p.year===y.year));
    return data.papers;
  });
  assert.equal(all.length,2175);
  assert.equal(new Set(all.map(p=>p.id)).size,all.length);
  for(const p of all.filter(p=>p.year<2026)){
    assert.ok(p.authors.length&&p.abstract&&p.pdfUrl&&p.proceedingsUrl);
    assert.ok(p.tldr.length<=120);
    assert.equal(p.presentation,'Accepted');
    if(p.forumUrl)assert.equal(new URL(p.forumUrl).searchParams.get('id'),p.id);
  }
  const tagged=all.map(tagPaper);
  assert.equal(filterPapers(tagged,{...defaults,year:'all'}).length,2175);
  assert.equal(filterPapers(tagged,{...defaults,year:'2017'}).length,49);
});
