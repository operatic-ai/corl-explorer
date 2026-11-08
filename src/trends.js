import {topics} from './catalog.js';
import {escapeHtml as esc} from './sharing.js';

export function yearlyStats(papers) {
  const years=[...new Set(papers.map(p=>p.year))].sort((a,b)=>a-b);
  return years.map((year,index)=>{
    const rows=papers.filter(p=>p.year===year),previous=index?papers.filter(p=>p.year===years[index-1]).length:null;
    return {year,count:rows.length,growth:previous?(rows.length-previous)/previous*100:null,
      topics:Object.fromEntries(topics.map(t=>{const count=rows.filter(p=>p.topics.includes(t.id)).length;return [t.id,{count,share:rows.length?100*count/rows.length:0}]}))};
  });
}

export function mountTrends(root,papers,onExplore) {
  const data=yearlyStats(papers);
  let metric='count',topic='manipulation';
  root.innerHTML=`<article class="trends-panel" id="trends-panel"><header class="trends-heading"><div><span class="mono">2017—2026 Paper Trends</span><h1>A decade of robot learning</h1></div></header><div class="trends-content">
    <div class="trends-intro"><span><strong>${papers.length.toLocaleString()}</strong> indexed papers</span><span><strong>${data.length}</strong> editions</span></div>
    <div class="trends-grid"><section class="chart-panel" aria-labelledby="volume-heading"><div class="chart-heading"><div><span class="mono">01 / THE CONFERENCE</span><h3 id="volume-heading">More ideas, every year.</h3></div><label><span class="sr-only">Annual metric</span><select id="annual-metric" aria-label="Annual metric"><option value="count">Paper count</option><option value="growth">YoY growth %</option></select></label></div><div id="volume-chart"></div></section>
    <section class="chart-panel" aria-labelledby="topic-heading"><div class="chart-heading"><div><span class="mono">02 / FOLLOW A THREAD</span><h3 id="topic-heading">What’s gaining ground?</h3></div><label><span class="sr-only">Trend topic</span><select id="trend-topic" aria-label="Trend topic">${topics.filter(t=>t.id!=='other').map(t=>`<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select></label></div><div id="topic-chart"></div></section></div>
    <section class="chart-panel heatmap-panel" aria-labelledby="mix-heading"><div class="chart-heading"><div><span class="mono">03 / THE RESEARCH MIX</span><h3 id="mix-heading">Ten years of changing interests.</h3></div><span class="chart-note">% of each year’s papers · darker cells = larger share</span></div><div id="topic-heatmap"></div></section>
    <p class="trends-method">Charts show accepted papers in this collection, not acceptance rates. Themes are based on paper titles and can overlap, so percentages may add up to more than 100%.</p>
  </div></article>`;
  const signed=(value,suffix='%')=>value==null?'—':`${value>=0?'+':''}${value.toFixed(1)}${suffix}`;
  const table=(headers,rows)=>`<details class="chart-data"><summary>View data</summary><div class="chart-table-wrap"><table><thead><tr>${headers.map(h=>`<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map((cell,i)=>i?`<td>${esc(cell)}</td>`:`<th scope="row">${esc(cell)}</th>`).join('')}</tr>`).join('')}</tbody></table></div></details>`;
  function volume(){
    const maximum=Math.max(...data.map(d=>metric==='count'?d.count:Math.abs(d.growth||0)),1);
    root.querySelector('#volume-chart').innerHTML=`<div class="chart-stat"><strong>${metric==='count'?data.at(-1).count:signed(data.at(-1).growth)}</strong><span>${metric==='count'?'papers in 2026':'paper-count growth in 2026'}</span></div><div class="annual-bars" role="group" aria-label="${metric==='count'?'Indexed papers by year':'Year-over-year paper-count growth'}">${data.map(d=>{const value=metric==='count'?d.count:d.growth;return `<button class="annual-bar ${value<0?'negative':''}" data-trend-year="${d.year}" aria-label="${d.year}: ${value==null?'no preceding edition':metric==='count'?value+' papers':signed(value)+' growth'}. Explore this year."><span class="bar-value">${metric==='count'?value:value==null?'—':signed(value)}</span><span class="bar-track"><span class="bar-fill" style="height:${value==null?0:Math.max(2,Math.abs(value)/maximum*100)}%"></span></span><span class="bar-year">${String(d.year).slice(2)}</span></button>`}).join('')}</div><p class="chart-note">${metric==='count'?'Select a bar to explore that edition.':'Change from the preceding edition. Striped bars indicate declines; 2017 has no baseline.'}</p>${table(['Year','Indexed papers','YoY growth'],data.map(d=>[d.year,d.count,signed(d.growth)]))}`;
  }
  function topicChart(){
    const chosen=topics.find(t=>t.id===topic),series=data.map(d=>d.topics[topic]),maximum=Math.max(10,Math.ceil(Math.max(...series.map(s=>s.share))/10)*10);
    const width=520,height=190,left=38,right=16,top=14,bottom=30;
    const x=i=>left+i*(width-left-right)/(data.length-1), y=v=>height-bottom-v/maximum*(height-top-bottom);
    const points=series.map((s,i)=>`${x(i)},${y(s.share)}`).join(' ');
    root.querySelector('#topic-chart').innerHTML=`<div class="chart-stat"><strong>${series.at(-1).share.toFixed(1)}%</strong><span>of 2026 papers · ${signed(series.at(-1).share-series[0].share,' pp')} since 2017</span></div><svg class="topic-line" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="topic-line-title topic-line-desc"><title id="topic-line-title">${esc(chosen.name)} as a percentage of indexed papers</title><desc id="topic-line-desc">${data.map((d,i)=>`${d.year}: ${series[i].share.toFixed(1)} percent`).join('; ')}. Exact values are available in the data table.</desc>${[0,maximum/2,maximum].map(v=>`<line class="chart-gridline" x1="${left}" x2="${width-right}" y1="${y(v)}" y2="${y(v)}"/><text class="chart-tick" x="${left-8}" y="${y(v)+3}" text-anchor="end">${v}%</text>`).join('')}<polygon class="chart-area" points="${left},${height-bottom} ${points} ${width-right},${height-bottom}"/><polyline class="chart-line" points="${points}"/>${series.map((s,i)=>`<circle class="chart-dot" cx="${x(i)}" cy="${y(s.share)}" r="3"><title>${data[i].year}: ${s.count} of ${data[i].count} papers (${s.share.toFixed(1)}%)</title></circle><text class="chart-tick" x="${x(i)}" y="${height-9}" text-anchor="middle">${String(data[i].year).slice(2)}</text>`).join('')}</svg><p class="chart-note">${esc(chosen.name)} · share of each edition, not raw volume.</p>${table(['Year','Matching papers','Share of edition'],data.map((d,i)=>[d.year,series[i].count,series[i].share.toFixed(1)+'%']))}`;
  }
  const visibleTopics=topics.filter(t=>t.id!=='other');
  root.querySelector('#topic-heatmap').innerHTML=`<div class="heatmap-scroll"><table class="topic-matrix"><thead><tr><th scope="col">Theme</th>${data.map(d=>`<th scope="col">${d.year}</th>`).join('')}</tr></thead><tbody>${visibleTopics.map(t=>`<tr><th scope="row">${esc(t.name)}</th>${data.map(d=>`<td><button data-trend-topic="${t.id}" data-trend-year="${d.year}" style="--heat:${Math.min(78,8+d.topics[t.id].share*1.4)}%" title="${d.topics[t.id].count} of ${d.count} papers" aria-label="Explore ${esc(t.name)}, ${d.year}: ${d.topics[t.id].share.toFixed(1)} percent">${d.topics[t.id].share.toFixed(1)}%</button></td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  root.querySelector('#annual-metric').addEventListener('change',e=>{metric=e.target.value;volume()});
  root.querySelector('#trend-topic').addEventListener('change',e=>{topic=e.target.value;topicChart()});
  root.addEventListener('click',e=>{const button=e.target.closest('[data-trend-year]');if(button)onExplore(button.dataset.trendYear,button.dataset.trendTopic||'')});
  volume();topicChart();
}
