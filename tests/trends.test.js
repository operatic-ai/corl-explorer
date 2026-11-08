import test from 'node:test';
import assert from 'node:assert/strict';
import {yearlyStats} from '../src/trends.js';
import {filterPapers} from '../src/catalog.js';
test('yearly stats use each edition as denominator and permit overlapping themes',()=>{
 const rows=[{year:2021,topics:['manipulation','touch']},{year:2021,topics:['touch']},{year:2022,topics:['manipulation']}];
 const stats=yearlyStats(rows);
 assert.equal(stats[0].growth,null);assert.equal(stats[1].growth,-50);
 assert.deepEqual(stats[0].topics.manipulation,{count:1,share:50});assert.equal(stats[0].topics.touch.share,100);
 assert.equal(stats[1].topics.manipulation.share,100);
});
test('poster filter includes oral papers that also had poster presentations',()=>{
 const p={id:'a',year:2023,title:'A paper',presentation:'Oral',presentations:['Oral','Poster'],topics:[],tasks:[]};
 assert.equal(filterPapers([p],{year:'2023',query:'',presentation:'Poster'}).length,1);
 assert.equal(filterPapers([p],{year:'2023',query:'',presentation:'Spotlight'}).length,0);
});

test('complete preview import accounts for every paper and preserves real source provenance',async()=>{
 const {readFile,access}=await import('node:fs/promises');
 const read=async name=>JSON.parse(await readFile(new URL(`../public/data/${name}.json`,import.meta.url)));
 const previews=await read('previews'),enrichment=await read('enrichment'),presentations=await read('presentations');
 let withImage=0;
 for(let year=2017;year<=2026;year++){
  for(const p of (await read(String(year))).papers){
   const record={...enrichment[p.id],...previews[p.id]};
   if(record.figure){
    withImage++;assert.ok(record.figureSource||record.figureOriginal,'real source URL required');
    await access(new URL('../public'+record.figure,import.meta.url));
   }else{assert.equal(record.previewStatus,'unavailable');assert.equal(year,2026)}
   if(presentations[p.id])assert.ok(presentations[p.id].presentationSources.length);
  }
 }
 assert.ok(withImage>=2089);
});
