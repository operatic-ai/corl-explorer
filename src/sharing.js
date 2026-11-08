const MAX_PAPERS = 10000;
const validId = id => typeof id === 'string' && /^[\w -]{1,100}$/.test(id);
export const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function encodeList(name, ids) {
  const unique = [...new Set(ids)];
  if (!unique.length || unique.length > MAX_PAPERS || !unique.every(validId)) throw new Error('Choose valid papers to share.');
  const bytes = new TextEncoder().encode(JSON.stringify({v:1,name:String(name).trim().slice(0,100)||'A reading list',ids:unique}));
  let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}

export function decodeList(hash) {
  if (!hash.startsWith('#list=')) return null;
  const payload=hash.slice(6);
  if(payload.length>1500000 || !/^[\w-]+$/.test(payload))throw new Error('This shared list link is invalid.');
  try {
    const bytes=Uint8Array.from(atob(payload.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
    const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
    if(data.v!==1 || typeof data.name!=='string' || data.name.length>100 || !Array.isArray(data.ids) || !data.ids.length || data.ids.length>MAX_PAPERS || !data.ids.every(validId))throw new Error();
    return {...data,ids:[...new Set(data.ids)]};
  } catch {throw new Error('This shared list link is invalid.');}
}

export function shareUrl(base, name, ids) {
  const url=new URL(base);url.search='';url.hash=`list=${encodeList(name,ids)}`;return url.href;
}

export function readingListHtml(name, papers) {
  const esc=escapeHtml;
  const link=(url,label)=>/^https:\/\//.test(url||'')?`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${label} ↗</a>`:'';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(name)} · CoRL Explorer</title><style>body{font:15px/1.7 system-ui,sans-serif;background:#f2f2f2;color:#222;max-width:800px;margin:50px auto;padding:0 24px}h1{font-size:32px;line-height:1.3}article{background:white;border:1px solid #ddd;border-radius:6px;padding:22px;margin:14px 0}h2{font-size:18px;line-height:1.5;margin:6px 0}small,p,footer{color:#666}nav{display:flex;flex-wrap:wrap;gap:20px}a{color:inherit}footer{margin:14px 0;font-size:12px;text-align:center}</style></head><body><small>CORL EXPLORER · SHARED READING LIST</small><h1>${esc(name)}</h1><p>${papers.length} papers · A snapshot you can keep and share.</p>${papers.map(p=>`<article><small>CoRL ${p.year}</small><h2>${esc(p.title)}</h2><p>${esc((p.authors||[]).join(', '))}</p>${p.tldr?`<p>${esc(p.tldr)}</p>`:''}<nav>${link(p.pdfUrl,'PDF')}${link(p.forumUrl,'OpenReview')}${link(p.arxivUrl,'arXiv')}${link(p.proceedingsUrl,'Proceedings')}</nav></article>`).join('')}<footer>For curious minds and wondrous machines.</footer></body></html>`;
}
