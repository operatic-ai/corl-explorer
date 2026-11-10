import './paper-view.css';
import {topics,tasks,shortSummary} from './catalog.js';
import {escapeHtml as esc} from './sharing.js';

export function mountPaperView(root,paper,{icon,isSaved,onBookmark,onClose,onCopyLink}) {
  const pdf=paper.localPdf || (paper.arxivUrl?paper.arxivUrl.replace('/abs/','/pdf/'):paper.pdfUrl);
  const authors=paper.authors||[];
  const tags=paper.tasks.length?paper.tasks.map(id=>tasks.find(t=>t.id===id)):paper.topics.map(id=>topics.find(t=>t.id===id));
  const sources=[
    paper.forumUrl&&{name:'OpenReview',url:paper.forumUrl},
    paper.proceedingsUrl&&{name:'Proceedings',url:paper.proceedingsUrl},
    paper.arxivUrl&&{name:'arXiv',url:paper.arxivUrl},
    ...(paper.codeUrls||[]).map((url,i)=>({name:i?'Code '+(i+1):'Code',url})),
  ].filter(Boolean);
  const external=(url,label,className)=>`<a class="${className}" href="${esc(url)}" target="_blank" rel="noreferrer">${label} ${icon('external')}</a>`;
  root.innerHTML=`<div class="reading-shell">
    <div class="reading-nav"><button id="close-paper" aria-label="Back to papers">← <span>Back to papers</span></button><span class="mono">CORL / PAPER</span></div>
    <div class="reading-content">
      <header class="reading-heading">
        <div class="paper-meta"><span class="mono">CORL ${paper.year}</span><span class="presentation ${paper.presentation.toLowerCase().replaceAll(' ','-')} mono">${esc(paper.presentation)}</span></div>
        <h1 class="reading-title" id="paper-title" tabindex="-1">${esc(paper.title)}</h1>
        <div class="reading-authors">${icon('person')}<span>${authors.length?esc(authors.slice(0,2).join(', ')):'Authors not yet indexed'}</span>${authors.length>2?`<button id="expand-authors" aria-expanded="false" aria-controls="paper-all-authors">+${authors.length-2} authors</button>`:''}</div>
        ${authors.length>2?`<p class="paper-all-authors" id="paper-all-authors" hidden>${esc(authors.join(' · '))}</p>`:''}
        <div class="reading-tags">${tags.map(t=>`<span>${esc(t.name)}</span>`).join('')}</div>
      </header>
      <aside class="source-rail" aria-label="Paper actions">
        <button class="paper-bookmark" aria-pressed="${isSaved()}">${icon('bookmark')}<span>${isSaved()?'Bookmarked':'Bookmark'}</span></button>
        <p class="source-label mono">READ THE PAPER</p>
        ${pdf?external(pdf,'Open PDF','paper-open-pdf'):''}
        <div class="paper-source-links">${sources.map(s=>external(s.url,s.name,'paper-source-link')).join('')}</div>
        <button class="paper-copy-link" title="Copy paper link">${icon('copy')}<span>Copy paper link</span></button><span class="paper-copy-status" role="status"></span>
      </aside>
      <div class="reading-main">
        <div class="paper-tabs" role="tablist" aria-label="Paper view"><button id="paper-overview-tab" role="tab" aria-selected="true" aria-controls="paper-overview">Overview</button>${pdf?'<button id="paper-pdf-tab" role="tab" aria-selected="false" aria-controls="paper-pdf" tabindex="-1">PDF</button>':''}</div>
        <section id="paper-overview" role="tabpanel" aria-labelledby="paper-overview-tab" tabindex="0">
          ${paper.tldr?`<p class="reading-summary">${esc(shortSummary(paper.tldr))}</p>`:''}
          ${paper.figure?`<figure class="reading-figure"><img src="${esc(paper.figure)}" alt="${paper.figureKind==='page'?'First page':'First figure'} from ${esc(paper.title)}"/><figcaption>${paper.figureKind==='page'?'FIRST PAGE':'FIG. 01'}</figcaption></figure>`:''}
          <section class="paper-abstract"><h2>Abstract</h2><p>${paper.abstract?esc(paper.abstract):'Abstract not available in this index. Read the paper using the source links.'}</p></section>
        </section>
        ${pdf?`<section id="paper-pdf" role="tabpanel" aria-labelledby="paper-pdf-tab" tabindex="0" hidden><div id="paper-pdf-embed"></div></section>`:''}
      </div>
    </div>
  </div>`;
  root.querySelector('#close-paper').onclick=onClose;
  const more=root.querySelector('#expand-authors');
  if(more)more.onclick=()=>{
    const expanded=more.getAttribute('aria-expanded')!=='true';
    more.setAttribute('aria-expanded',String(expanded));
    root.querySelector('#paper-all-authors').hidden=!expanded;
    more.textContent=expanded?'Show less':`+${authors.length-2} authors`;
  };
  root.querySelector('.paper-bookmark').onclick=()=>{onBookmark();syncPaperBookmark(root,isSaved())};
  const copyButton=root.querySelector('.paper-copy-link');
  const copyStatus=root.querySelector('.paper-copy-status');
  let copyTimer;
  copyButton.onclick=async()=>{
    copyStatus.textContent='';
    try{
      await onCopyLink();
      clearTimeout(copyTimer);
      copyButton.classList.add('is-copied');
      copyButton.querySelector('svg').outerHTML=icon('check');
      copyButton.setAttribute('aria-label','Paper link copied');
      copyButton.title='Copied';
      copyTimer=setTimeout(()=>{
        copyButton.classList.remove('is-copied');
        copyButton.querySelector('svg').outerHTML=icon('copy');
        copyButton.removeAttribute('aria-label');
        copyButton.title='Copy paper link';
      },1600);
    }catch{copyStatus.textContent='Copy the URL from your browser to share this paper.'}
  };
  const tabs=[...root.querySelectorAll('[role=tab]')];
  function selectTab(tab){
    for(const candidate of tabs){
      const selected=candidate===tab;
      candidate.setAttribute('aria-selected',String(selected));candidate.tabIndex=selected?0:-1;
      root.querySelector(`#${candidate.getAttribute('aria-controls')}`).hidden=!selected;
    }
    const embed=root.querySelector('#paper-pdf-embed');
    if(tab.id==='paper-pdf-tab'&&!embed.children.length){
      const frame=document.createElement('iframe');frame.src=`${pdf}#view=FitH`;frame.title=`PDF: ${paper.title}`;embed.append(frame);
    }
  }
  for(const tab of tabs){
    tab.onclick=()=>selectTab(tab);
    tab.onkeydown=e=>{
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
      e.preventDefault();
      const index=e.key==='Home'?0:e.key==='End'?tabs.length-1:(tabs.indexOf(tab)+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
      selectTab(tabs[index]);tabs[index].focus();
    };
  }
  root.querySelector('.reading-figure img')?.addEventListener('error',e=>{e.target.closest('figure').hidden=true},{once:true});
}

export function syncPaperBookmark(root,saved){
  const button=root.querySelector('.paper-bookmark');if(!button)return;
  button.setAttribute('aria-pressed',String(saved));button.querySelector('span').textContent=saved?'Bookmarked':'Bookmark';
}
