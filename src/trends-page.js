import './style.css';
import {mountTrends} from './trends.js';
import {tagPaper} from './catalog.js';

document.querySelector('#app').innerHTML=`<header class="topbar"><a class="brand" href="/" aria-label="CoRL Explorer home"><span class="actuator-logo" aria-hidden="true"><img src="/brand/actuator.svg" alt="" width="48" height="44"/></span><strong>CoRL<span>Explorer</span></strong></a><div class="top-caption mono">2017—2026 · CONFERENCE ON ROBOT LEARNING</div><nav class="page-nav" aria-label="Main navigation"><a href="/">Papers</a><a href="/trends.html" aria-current="page">Trends</a></nav><a class="github-star" href="https://github.com/operatic-ai/corl-explorer" target="_blank" rel="noopener noreferrer" aria-label="Star on GitHub" title="Star on GitHub"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 2.8 5.7 6.3.9-4.6 4.4 1.1 6.3-5.6-3-5.6 3 1.1-6.3L2.9 9.6l6.3-.9Z"/></svg><span>Star on GitHub</span></a><button id="theme-toggle" class="theme-toggle" aria-label="Dark mode" aria-pressed="false"></button></header><main class="trends-page"><section id="trends" aria-label="Year-on-year research trends"><p class="loading-state mono" role="status">LOADING RESEARCH TRENDS…</p></section><footer class="main-footer">For curious minds and wondrous machines.</footer></main>`;
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
