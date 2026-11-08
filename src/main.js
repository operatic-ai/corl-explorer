import './style.css';
import {mountPaperView,syncPaperBookmark} from './paper-view.js';
import { summaries } from './summaries.js';
import { decodeList, shareUrl, readingListHtml } from './sharing.js';
import { topics, tasks, tagPaper, filterPapers, shortSummary } from './catalog.js';

const icons = {
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  filters: '<path d="M3 6h18M3 12h18M3 18h18"/><circle cx="8" cy="6" r="2" fill="var(--surface)"/><circle cx="16" cy="12" r="2" fill="var(--surface)"/><circle cx="10" cy="18" r="2" fill="var(--surface)"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  grid: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>',
  stack: '<rect x="3" y="3" width="18" height="7"/><rect x="3" y="14" width="18" height="7"/>',
  person: '<circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
  bookmark: '<path d="M6 3h12v18l-6-4-6 4z"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
  share: '<circle cx="6" cy="12" r="3"/><circle cx="18" cy="5" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.5 10.5 7-4M8.5 13.5l7 4"/>',
  moon: '<path d="M20 14a8 8 0 0 1-10-10 8.5 8.5 0 1 0 10 10z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  external: '<path d="M14 3h7v7M21 3 10 14M10 3H3v18h18v-7"/>',
};
const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5">${icons[name]}</svg>`;
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const params = new URLSearchParams(location.search);
let sharedList=null, sharedError='';
try {sharedList=decodeList(location.hash)} catch(error){sharedError=error.message}
const state = { year: params.get('year') || (sharedList?'all':'2026'), query: params.get('q') || '', topic: params.get('topic') || '', task: params.get('task') || '', presentation: params.get('type') || '', view: params.get('view') === 'stack' ? 'stack' : 'grid', sort: 'featured', savedOnly: false, sharedOnly:Boolean(sharedList), limit: 24 };
let saved;
try { saved = new Set(JSON.parse(localStorage.getItem('corl-saved') || '[]')); } catch { saved = new Set(); }
let papers = [], catalog;
let shareIds=[];
let toastTimer;
let returnFocus;
let currentPaperId=params.get('paper')||null;
let paperReturnScroll=0;
let paperReturnFocus=null;
const collectionTitle=document.title;

document.querySelector('#app').innerHTML = `
  <header class="topbar"><a class="brand" href="/" aria-label="CoRL Explorer home"><span class="actuator-logo" aria-hidden="true"><img src="/brand/actuator.svg" alt="" width="48" height="44"/></span><strong>CoRL<span>Explorer</span></strong></a><div class="top-caption mono">2017—2026 · CONFERENCE ON ROBOT LEARNING</div><nav class="page-nav" aria-label="Main navigation"><a href="/" aria-current="page">Papers</a><a href="/trends.html">Trends</a></nav><button id="theme-toggle" class="theme-toggle" aria-label="Dark mode" aria-pressed="false">${icon('moon')}<span>Dark mode</span></button></header>
  <div class="shell"><aside class="sidebar">
    <div class="searchbar"><div class="search-input">${icon('search')}<input id="search" aria-label="Search papers" placeholder="Search papers, authors, or an idea…" value="${esc(state.query)}" autocomplete="off"/><button id="clear-search" aria-label="Clear search">${icon('close')}</button><kbd>/</kbd></div>
    <div id="filter-selects-home"><div id="filter-selects"><label class="type-select"><span class="filter-field-label">Robot task</span><select id="task" aria-label="Robot task"><option value="">All tasks</option>${tasks.map(t=>`<option value="${t.id}">${t.name}</option>`).join('')}</select></label>
    <label class="type-select"><span class="filter-field-label">Presentation</span><select id="presentation" aria-label="Presentation type"><option value="">All presentations</option><option>Oral</option><option>Spotlight</option><option>Poster</option><option>Interactive</option><option>Blue Sky</option><option>Talk</option><option value="Accepted">Accepted · type unspecified</option></select></label></div></div></div>
    <label class="edition-select"><span class="mono">EDITION</span><select id="edition" aria-label="Conference year"><option value="all">All years</option>${Array.from({length:10},(_,i)=>2026-i).map(y=>`<option value="${y}">${y}</option>`).join('')}</select></label>
    <button id="open-filters" class="mobile-filter-button" aria-haspopup="dialog" aria-controls="mobile-filters">${icon('filters')} Filters <span id="filter-count" hidden></span></button>
    <div class="library-controls"><button class="collection active" id="all-papers"><span>All papers</span><span id="total" class="mono">—</span></button>
    <button class="collection" id="saved-papers"><span>${icon('bookmark')} Reading list</span><span id="saved-count" class="mono">0</span></button>
    <button class="collection" id="shared-papers" hidden><span>${icon('share')} Shared list</span><span id="shared-count" class="mono">0</span></button>
    <button id="share-list" class="share-list" aria-label="Share reading list">${icon('share')}<span>Share reading list</span></button></div>
    <div id="filter-topics-home"><div class="topic-row"><span class="mono topic-label">EXPLORE BY THEME</span><div id="topics" class="topics"></div></div></div>
    <div class="sidebar-foot"><a href="/trends.html">Trends 2017-2026</a></div>
  </aside><main><section class="explore" aria-label="Explore papers">
    <div class="results-toolbar"><div><h2 id="results-heading" tabindex="-1">The 2026 Collection</h2><span class="mono results-count" id="results-count" role="status">Loading the index…</span></div><div class="view-controls"><label class="sort-label"><select id="sort" aria-label="Sort papers"><option value="featured">Featured first</option><option value="title">Title A–Z</option></select></label><div class="view-toggle" aria-label="Card layout"><button data-view="grid" aria-label="Grid view">${icon('grid')}<span>Grid</span></button><button data-view="stack" aria-label="Stack view">${icon('stack')}<span>Stack</span></button></div></div></div>
    <div id="shared-banner"></div><div id="active-filters"></div><div id="papers" class="paper-grid"><div class="loading-state mono">LOADING PAPERS…</div></div><div class="load-more-wrap"><button id="load-more" class="load-more">Load more papers ${icon('arrow')}</button></div>
    <footer class="main-footer">For curious minds and wondrous machines.</footer>
  </section></main></div>
  <dialog id="mobile-filters" class="filter-dialog" aria-labelledby="filter-title"><div class="filter-sheet"><div class="filter-header"><h2 id="filter-title">Find your papers.</h2><button data-close aria-label="Close filters" autofocus>${icon('close')}</button></div><div id="filter-sheet-body" class="filter-sheet-body"></div><div class="filter-footer"><button id="clear-mobile-filters">Clear filters</button><button id="show-filter-results" class="primary-button" data-close>Show papers ${icon('arrow')}</button></div></div></dialog>
  <main id="reader" class="paper-reader" aria-labelledby="paper-title" hidden></main>
  <dialog id="share-dialog" class="share-dialog" aria-labelledby="share-title"><div class="reader-top"><span class="mono">PASS IT ON</span><button data-close aria-label="Close sharing">${icon('close')}</button></div><div class="share-body"><h2 id="share-title">Share a little curiosity.</h2><p id="share-description"></p><label class="share-label">List name<input id="list-name" maxlength="100" value="My CoRL reading list"/></label><label class="share-label">Share link<input id="share-url" readonly aria-label="Share link"/></label><div class="share-actions"><button id="copy-share" class="primary-button">Copy link ${icon('share')}</button><button id="download-list" class="secondary-button">Download reading list ↓</button></div><p id="share-hint" class="share-hint"></p><p id="share-feedback" role="status"></p></div></dialog>
  <div id="toast" role="status"></div>`;

document.querySelector('#edition').addEventListener('change',e=>{state.year=e.target.value;state.limit=24;render()});
const mobileLayout=matchMedia('(max-width: 800px)');
const filterDialog=document.querySelector('#mobile-filters');
function placeFilters(){
  if(!mobileLayout.matches&&filterDialog.open)filterDialog.close();
  document.querySelector(mobileLayout.matches?'#filter-sheet-body':'#filter-selects-home').append(document.querySelector('#filter-selects'));
  document.querySelector(mobileLayout.matches?'#filter-sheet-body':'#filter-topics-home').append(document.querySelector('.topic-row'));
}
mobileLayout.addEventListener('change',placeFilters);
placeFilters();
const systemTheme=matchMedia('(prefers-color-scheme: dark)');
function setTheme(theme,persist=false){
  document.documentElement.dataset.theme=theme;
  const dark=theme==='dark';
  document.querySelector('#theme-toggle').innerHTML=`${icon(dark?'sun':'moon')}<span>${dark?'Light mode':'Dark mode'}</span>`;
  document.querySelector('#theme-toggle').setAttribute('aria-pressed',String(dark));
  document.querySelector('meta[name="theme-color"]').content=dark?'#171717':'#f0f0f0';
  if(persist)try{localStorage.setItem('corl-theme',theme)}catch{}
}
setTheme(document.documentElement.dataset.theme || (systemTheme.matches?'dark':'light'));
systemTheme.addEventListener('change',e=>{let choice;try{choice=localStorage.getItem('corl-theme')}catch{}if(!choice)setTheme(e.matches?'dark':'light')});

function updateUrl() {
  const p = new URLSearchParams();
  p.set('year', state.year);
  if(state.query) p.set('q',state.query);
  if(state.topic) p.set('topic',state.topic);
  if(state.task) p.set('task',state.task);
  if(state.presentation) p.set('type',state.presentation);
  if(state.view==='stack') p.set('view','stack');
  if(currentPaperId)p.set('paper',currentPaperId);
  history.replaceState(history.state,'',`?${p}${location.hash}`);
}
function renderTopics() {
  const focusedTopic=document.activeElement?.dataset.topic;
  const counts = Object.fromEntries(topics.map(t=>[t.id,papers.filter(p=>(state.year==='all'||p.year===Number(state.year))&&p.topics.includes(t.id)).length]));
  document.querySelector('#topics').innerHTML = `<button class="topic ${!state.topic?'active':''}" data-topic="" aria-pressed="${!state.topic}">All themes</button>`+topics.map(t=>`<button class="topic ${state.topic===t.id?'active':''}" data-topic="${t.id}" aria-pressed="${state.topic===t.id}">${esc(t.name)}<span>${counts[t.id]}</span></button>`).join('');
  if(focusedTopic!==undefined)document.querySelector(`[data-topic="${CSS.escape(focusedTopic)}"]`)?.focus();
}
function card(p,index) {
  const tags = p.tasks.length ? p.tasks.slice(0,3).map(id=>({...tasks.find(t=>t.id===id),kind:'task'})) : p.topics.slice(0,2).map(id=>({...topics.find(t=>t.id===id),kind:'topic'}));
  const authors = p.authors?.length ? `${p.authors[0]}${p.authors.length>1?` +${p.authors.length-1}`:''}` : 'Authors not yet indexed';
  return `<article class="paper-card"><button class="paper-image" data-open="${p.id}" aria-label="Read ${esc(p.title)}">${p.figure?`<img src="${esc(p.figure)}" alt="${p.figureKind==='page'?'First page':'First figure'} from ${esc(p.title)}" loading="lazy"/>`:`<div class="figure-pending"><span class="pending-cross">+</span><span class="mono">${p.previewStatus==='unavailable'?'PREVIEW UNAVAILABLE':'FIGURE NOT YET INDEXED'}</span><span class="pending-cross bottom">+</span></div>`}<span class="paper-number mono">${String(index+1).padStart(3,'0')}</span><span class="presentation ${p.presentation.toLowerCase().replaceAll(" ","-")} mono">${p.presentation}</span></button><div class="card-body"><div class="card-topline mono"><span>CORL ${p.year}</span><button class="save-button ${saved.has(p.id)?'saved':''}" data-save="${p.id}" aria-pressed="${saved.has(p.id)}" aria-label="${saved.has(p.id)?'Remove from':'Add to'} reading list: ${esc(p.title)}">${icon('bookmark')}</button></div><h3><button data-open="${p.id}">${esc(p.title)}</button></h3><div class="authors">${icon('person')}<span>${esc(authors)}</span></div><div class="paper-links">${p.forumUrl?`<a href="${esc(p.forumUrl)}" target="_blank" rel="noreferrer" aria-label="OpenReview record for ${esc(p.title)}">OpenReview ↗</a>`:p.proceedingsUrl?`<a href="${esc(p.proceedingsUrl)}" target="_blank" rel="noreferrer">Proceedings ↗</a>`:''}${p.arxivUrl?`<a href="${esc(p.arxivUrl)}" target="_blank" rel="noreferrer" aria-label="arXiv preprint for ${esc(p.title)}">arXiv ↗</a>`:'<span title="No verified arXiv match in this index">arXiv not matched</span>'}</div><div class="tldr"><p>${esc(shortSummary(p.tldr) || 'Summary not yet indexed. Open the paper to explore the full research.')}</p></div><div class="card-bottom"><div class="chips">${tags.map(t=>`<button data-${t.kind}="${t.id}" title="Inferred from paper title">${esc(t.name)}</button>`).join('')}</div><button class="read-arrow" data-open="${p.id}" aria-label="Read ${esc(p.title)}">${icon('arrow')}</button></div></div></article>`;
}
function render() {
  const sharedIds=new Set(sharedList?.ids||[]);
  const result = filterPapers(state.sharedOnly?papers.filter(p=>sharedIds.has(p.id)):papers,state,saved);
  document.querySelector('#total').textContent=papers.length;
  document.querySelector('#edition').value=state.year;
  document.querySelector('#saved-count').textContent=saved.size;
  document.querySelector('#all-papers').classList.toggle('active',!state.savedOnly&&!state.sharedOnly);
  document.querySelector('#saved-papers').classList.toggle('active',state.savedOnly);
  document.querySelectorAll('[data-year]').forEach(b=>{b.classList.toggle('active',b.dataset.year===state.year);b.setAttribute('aria-pressed',b.dataset.year===state.year)});
  document.querySelectorAll('[data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===state.view);b.setAttribute('aria-pressed',b.dataset.view===state.view)});
  document.querySelector('#results-heading').textContent=state.sharedOnly?sharedList.name:state.savedOnly?'Your Reading List':state.year==='all'?'All Collections':`The ${state.year} Collection`;
  document.querySelector('#shared-papers').hidden=!sharedList;
  document.querySelector('#shared-papers').classList.toggle('active',state.sharedOnly);
  document.querySelector('#shared-count').textContent=sharedList?.ids.length||0;
  renderSharedBanner();
  document.querySelector('#results-count').textContent=`${result.length} ${result.length===1?'PAPER':'PAPERS'}${state.topic?' / '+topics.find(t=>t.id===state.topic)?.name.toUpperCase():''}`;
  document.querySelector('#clear-search').hidden=!state.query;
  document.querySelector('#presentation').value=state.presentation;
  document.querySelector('#task').value=state.task;
  const grid=document.querySelector('#papers'); grid.className=`paper-${state.view}`;
  grid.innerHTML=result.length?result.slice(0,state.limit).map(card).join(''):`<div class="empty-state">${state.savedOnly&&!saved.size?'<p>No saves. Bookmark a paper to create your reading list.</p>':'<span class="empty-symbol">∅</span><h3>No papers on this frequency.</h3><p>Try a broader search or clear your filters.</p>'}<button id="reset">Show all papers ${icon('arrow')}</button></div>`;
  document.querySelector('#load-more').hidden=result.length<=state.limit;
  document.querySelector('#active-filters').innerHTML=(state.query||state.topic||state.task||state.presentation)?'<button id="reset-filters" class="reset-filters">Clear filters ×</button>':'';
  const filterCount=[state.task,state.presentation,state.topic].filter(Boolean).length;
  document.querySelector('#filter-count').textContent=filterCount;
  document.querySelector('#filter-count').hidden=!filterCount;
  document.querySelector('#open-filters').classList.toggle('has-filters',filterCount>0);
  document.querySelector('#show-filter-results').innerHTML=`Show ${result.length} ${result.length===1?'paper':'papers'} ${icon('arrow')}`;
  document.querySelector('#clear-mobile-filters').disabled=!filterCount;
  renderTopics(); updateUrl();
  if(currentPaperId)syncPaperBookmark(document.querySelector('#reader'),saved.has(currentPaperId));
}
function reset() {Object.assign(state,{year:'all',query:'',topic:'',task:'',presentation:'',savedOnly:false,sharedOnly:false,limit:24});document.querySelector('#search').value='';render()}
function openDialog(dialog) { returnFocus=document.activeElement; dialog.showModal(); document.body.classList.add('modal-open'); }
function closeDialog(dialog) { dialog.close(); }
document.querySelectorAll('dialog').forEach(d=>{d.addEventListener('close',()=>{document.body.classList.remove('modal-open');returnFocus?.focus()});d.addEventListener('click',e=>{if(e.target===d)d.close()})});
function toggleSaved(id){
  saved.has(id)?saved.delete(id):saved.add(id);
  try{localStorage.setItem('corl-saved',JSON.stringify([...saved]))}catch{notify('Bookmarks are available for this session only.')}
  render();
}
function openPaper(id,{push=true}={}) {
  const p=papers.find(p=>p.id===id);
  if(!p){currentPaperId=null;updateUrl();notify('This paper is not available in the index.');return;}
  const reader=document.querySelector('#reader');
  if(reader.hidden){paperReturnScroll=scrollY;paperReturnFocus=document.activeElement;}
  currentPaperId=id;
  if(push){
    const url=new URL(location.href);url.searchParams.set('paper',id);
    history.pushState({corlPaper:true},'',url);
  }
  mountPaperView(reader,p,{
    icon,isSaved:()=>saved.has(id),onBookmark:()=>toggleSaved(id),onClose:closePaper,
    onCopyLink:()=>{
      const url=new URL(location.origin+location.pathname);url.searchParams.set('year',p.year);url.searchParams.set('paper',p.id);
      return navigator.clipboard.writeText(url.href);
    },
  });
  document.querySelector('.shell').hidden=true;reader.hidden=false;
  document.title=`${p.title} — CoRL Explorer`;
  scrollTo(0,0);reader.querySelector('#paper-title').focus({preventScroll:true});
}
function finishClosePaper(){
  const id=currentPaperId;currentPaperId=null;
  const reader=document.querySelector('#reader');reader.hidden=true;reader.innerHTML='';
  document.querySelector('.shell').hidden=false;document.title=collectionTitle;
  const restored=paperReturnFocus?.isConnected&&!paperReturnFocus.closest('#reader')&&paperReturnFocus!==document.body?paperReturnFocus:document.querySelector(`.paper-card h3 [data-open="${CSS.escape(id||'')}"]`)||document.querySelector('#results-heading');
  restored.focus({preventScroll:true});scrollTo(0,paperReturnScroll);
}
function closePaper(){
  if(history.state?.corlPaper){history.back();return;}
  finishClosePaper();updateUrl();
}
addEventListener('popstate',()=>{
  const id=new URLSearchParams(location.search).get('paper');
  if(id)openPaper(id,{push:false});
  else if(currentPaperId)finishClosePaper();
});
document.querySelector('.page-nav a[href="/"]').addEventListener('click',e=>{if(currentPaperId){e.preventDefault();closePaper()}});
document.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.hasAttribute('data-topic')){state.topic=b.dataset.topic;state.limit=24;render()}
  else if(b.dataset.task){state.task=b.dataset.task;state.limit=24;render()}
  else if(b.dataset.year){state.year=b.dataset.year;state.limit=24;render()}
  else if(b.dataset.view){state.view=b.dataset.view;render()}
  else if(b.dataset.open)openPaper(b.dataset.open);
  else if(b.dataset.save){toggleSaved(b.dataset.save);document.querySelector(`[data-save="${b.dataset.save}"]`)?.focus()}
  else if(b.hasAttribute('data-close'))closeDialog(b.closest('dialog'));
  else if(b.id==='open-filters')openDialog(filterDialog);
  else if(b.id==='clear-mobile-filters'){Object.assign(state,{task:'',presentation:'',topic:'',limit:24});render()}
  else if(b.id==='theme-toggle')setTheme(document.documentElement.dataset.theme==='dark'?'light':'dark',true);
  else if(b.id==='share-list')openShare();
  else if(b.id==='copy-share')copyShare();
  else if(b.id==='download-list')downloadList();
  else if(b.id==='save-shared')saveShared();
  else if(b.id==='dismiss-shared'){sharedError='';sharedList=null;state.sharedOnly=false;history.replaceState(null,'',location.pathname+location.search);render();}
  else if(b.id==='shared-papers'){state.sharedOnly=true;state.savedOnly=false;state.year='all';clearSearchFilters();render();}
  else if(b.id==='saved-papers'){state.savedOnly=true;state.sharedOnly=false;state.year='all';clearSearchFilters();render()}
  else if(b.id==='all-papers'){state.savedOnly=false;state.sharedOnly=false;render()}
  else if(b.id==='reset'||b.id==='reset-filters')reset();
  else if(b.id==='clear-search'){state.query='';document.querySelector('#search').value='';render();document.querySelector('#search').focus()}
  else if(b.id==='load-more'){state.limit+=24;render()}
});
document.querySelector('#search').addEventListener('input',e=>{state.query=e.target.value;state.limit=24;render()});
document.querySelector('#presentation').addEventListener('change',e=>{state.presentation=e.target.value;state.limit=24;render()});
document.querySelector('#task').addEventListener('change',e=>{state.task=e.target.value;state.limit=24;render()});
document.querySelector('#sort').addEventListener('change',e=>{state.sort=e.target.value;render()});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&currentPaperId&&!document.querySelector('dialog[open]')){e.preventDefault();closePaper();return;}if(e.key==='/'&&!currentPaperId&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)&&!document.querySelector('dialog[open]')){e.preventDefault();document.querySelector('#search').focus()}});
function clearSearchFilters(){Object.assign(state,{query:'',topic:'',task:'',presentation:'',limit:24});document.querySelector('#search').value='';}
function notify(message){clearTimeout(toastTimer);document.querySelector('#toast').textContent=message;toastTimer=setTimeout(()=>document.querySelector('#toast').textContent='',4000);}
function renderSharedBanner(){
  const banner=document.querySelector('#shared-banner');
  if(sharedError){banner.innerHTML=`<div class="shared-banner" role="alert"><p>${esc(sharedError)}</p><button id="dismiss-shared">Dismiss</button></div>`;return;}
  if(!sharedList||!state.sharedOnly){banner.innerHTML='';return;}
  const available=new Set(papers.map(p=>p.id));
  const missing=sharedList.ids.filter(id=>!available.has(id)).length;
  banner.innerHTML=`<div class="shared-banner"><div><span class="mono">A SHARED READING LIST</span><p>A snapshot of ${sharedList.ids.length} papers. Your own bookmarks are kept separately.${missing?` ${missing} ${missing===1?'paper is':'papers are'} not available in this index.`:''}</p></div><button id="save-shared" class="secondary-button">Save to my reading list</button></div>`;
}
function saveShared(){
  const available=new Set(papers.map(p=>p.id));let added=0;
  for(const id of sharedList.ids)if(available.has(id)&&!saved.has(id)){saved.add(id);added++;}
  try{localStorage.setItem('corl-saved',JSON.stringify([...saved]));notify(added?`${added} papers added to your reading list.`:'These papers are already in your reading list.')}catch{notify('Saved for this session; browser storage is unavailable.')}
  render();
}
function updateShareUrl(){
  try{document.querySelector('#share-url').value=shareUrl(location.href,document.querySelector('#list-name').value,shareIds)}catch(error){document.querySelector('#share-feedback').textContent=error.message}
}
function openShare(){
  const available=new Set(papers.map(p=>p.id));
  shareIds=[...(state.sharedOnly?sharedList.ids:saved)].filter(id=>available.has(id));
  if(!shareIds.length){notify('Bookmark a paper first, then share your reading list.');return;}
  document.querySelector('#list-name').value=state.sharedOnly?sharedList.name:'My CoRL reading list';
  document.querySelector('#share-description').textContent=`Share a snapshot of all ${shareIds.length} bookmarked papers across every year. Recipients can browse it and save their own copy.`;
  document.querySelector('#share-feedback').textContent='';
  const local=['localhost','127.0.0.1','[::1]'].includes(location.hostname);
  document.querySelector('#share-hint').textContent=local?'This is a local preview. Download the reading list to share it with someone else; local links only open on this computer.':'Anyone with the link can read this snapshot. Download a standalone copy to share by email or keep offline.';
  updateShareUrl();openDialog(document.querySelector('#share-dialog'));
}
async function copyShare(){
  updateShareUrl();const input=document.querySelector('#share-url');
  try{await navigator.clipboard.writeText(input.value);document.querySelector('#share-feedback').textContent='Link copied.'}catch{input.focus();input.select();document.querySelector('#share-feedback').textContent='Select and copy the link above.'}
}
function downloadList(){
  const ids=new Set(shareIds), name=document.querySelector('#list-name').value.trim()||'My CoRL reading list';
  const html=readingListHtml(name,papers.filter(p=>ids.has(p.id)));
  const url=URL.createObjectURL(new Blob([html],{type:'text/html;charset=utf-8'}));
  const link=document.createElement('a');link.href=url;link.download='corl-reading-list.html';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  document.querySelector('#share-feedback').textContent='Reading list downloaded. Send the HTML file to anyone; it opens in a browser.';
}
document.querySelector('#list-name').addEventListener('input',updateShareUrl);
document.querySelector('#share-url').addEventListener('click',e=>e.target.select());
addEventListener('hashchange',()=>{
  try{sharedList=decodeList(location.hash);sharedError=''}catch(error){sharedList=null;sharedError=error.message}
  state.sharedOnly=Boolean(sharedList);state.savedOnly=false;state.year='all';clearSearchFilters();render();
});

async function load() {
  try {
    const response=await fetch('/data/index.json');if(!response.ok)throw new Error('Catalog unavailable');catalog=await response.json();
    const datasets=await Promise.all(catalog.years.map(async y=>{const r=await fetch(y.file);if(!r.ok)throw new Error(`Edition ${y.year} unavailable`);return r.json()}));
    let enrichment={};try{const r=await fetch('/data/enrichment.json');if(r.ok)enrichment=await r.json()}catch{}
    const [previews,presentations]=await Promise.all(['previews','presentations'].map(async name=>{try{const r=await fetch(`/data/${name}.json`);return r.ok?await r.json():{}}catch{return {}}}));
    papers=datasets.flatMap(d=>d.papers).map(p=>tagPaper({...p,...(p.year===2026?enrichment[p.id]:{}),...previews[p.id],...presentations[p.id],...(summaries[p.id]?{tldr:summaries[p.id],summaryMethod:'Abstract-based paraphrase'}:{})}));
    if(state.year!=='all'&&!catalog.years.some(y=>String(y.year)===state.year))state.year='all';
    if(!topics.some(t=>t.id===state.topic))state.topic='';
    if(!tasks.some(t=>t.id===state.task))state.task='';
    render();
    if(currentPaperId)openPaper(currentPaperId,{push:false});
  } catch {document.querySelector('#papers').innerHTML='<div class="empty-state"><h3>The index couldn’t load.</h3><p>Please reload the page to try again.</p></div>';document.querySelector('#results-count').textContent='INDEX UNAVAILABLE';document.querySelector('#load-more').hidden=true;}
}
load();

import('./actuator-logo.js').then(({mountActuatorLogo})=>mountActuatorLogo(document.querySelector('.actuator-logo'))).catch(()=>{});
