import './style.css';
import {mountGithubStars} from './github-stars.js';
import {mountTrends} from './trends.js';
import {tagPaper} from './catalog.js';

document.querySelector('#app').innerHTML=`<header class="topbar"><a class="brand" href="/" aria-label="CoRL Explorer home"><span class="actuator-logo" aria-hidden="true"><img src="/brand/actuator.svg" alt="" width="48" height="44"/></span><img class="brand-wordmark" src="/brand/corl-explorer-wordmark.png" alt="CoRL Explorer" width="1615" height="303"/></a><div class="top-caption mono">2017—2026 · CONFERENCE ON ROBOT LEARNING</div><nav class="page-nav" aria-label="Main navigation"><a href="/">Papers</a><a href="/trends.html" aria-current="page">Trends</a></nav><a class="github-star" href="https://github.com/operatic-ai/corl-explorer" target="_blank" rel="noopener noreferrer" aria-label="View on GitHub" title="View on GitHub"><svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.65 7.65 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/></svg><span hidden></span></a><button id="theme-toggle" class="theme-toggle" aria-label="Dark mode" aria-pressed="false"></button></header><main class="trends-page"><section id="trends" aria-label="Year-on-year research trends"><p class="loading-state mono" role="status">LOADING RESEARCH TRENDS…</p></section><footer class="main-footer">For curious minds and wondrous machines.</footer></main>`;
const system=matchMedia('(prefers-color-scheme: dark)');
function theme(value,persist=false){
 document.documentElement.dataset.theme=value;
 const dark=value==='dark',button=document.querySelector('#theme-toggle');
 button.innerHTML=`<span class="theme-symbol" aria-hidden="true">${dark?'☼':'☾'}</span><span>${dark?'Light mode':'Dark mode'}</span>`;button.setAttribute('aria-pressed',String(dark));
 document.querySelector('meta[name="theme-color"]').content=dark?'#171717':'#f0f0f0';
 if(persist)try{localStorage.setItem('corl-theme',value)}catch{}
}
theme(document.documentElement.dataset.theme||'light');
document.querySelector('#theme-toggle').addEventListener('click',()=>theme(document.documentElement.dataset.theme==='dark'?'light':'dark',true));
system.addEventListener('change',e=>{let chosen;try{chosen=localStorage.getItem('corl-theme')}catch{}if(!chosen)theme(e.matches?'dark':'light')});
async function load(){
 try{
  const response=await fetch('/data/index.json');if(!response.ok)throw new Error('Index unavailable');
  const catalog=await response.json();
  const editions=await Promise.all(catalog.years.map(async year=>{const r=await fetch(year.file);if(!r.ok)throw new Error('Edition unavailable');return r.json()}));
  mountTrends(document.querySelector('#trends'),editions.flatMap(d=>d.papers).map(tagPaper),(year,topic)=>{
   const params=new URLSearchParams({year});if(topic)params.set('topic',topic);location.href=`/?${params}`;
  });
 }catch{document.querySelector('#trends').innerHTML='<div class="empty-state" role="alert"><h1>Trends couldn’t load.</h1><p>Please reload to try again.</p><a href="/">Back to papers</a></div>'}
}
load();

import('./actuator-logo.js').then(({mountActuatorLogo})=>mountActuatorLogo(document.querySelector('.actuator-logo'))).catch(()=>{});

mountGithubStars(document.querySelector('.github-star'));
