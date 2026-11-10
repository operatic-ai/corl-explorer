"""Discover attributed code/project links; only publish reachable, matched resources.

Input: cached GitHub indexes and repository-search results in --sources-dir.
Output: a reviewable JSON file; never changes the published index automatically.
Network pages are cached so interrupted runs can resume. No remote code is run.
"""
import argparse, concurrent.futures, hashlib, html, json, re, subprocess, unicodedata
from collections import Counter, defaultdict
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit, urljoin, urlunsplit

ROOT = Path(__file__).resolve().parents[1]
SOURCE_2026 = 'https://github.com/gisbi-kim/conference-explorers/blob/master/corl2026/data.json'
SOURCE_JAYWU = 'https://github.com/jaywu109/corl-2026-papers/blob/main/papers.yaml'
SOURCE_SMALLFRY = 'https://github.com/smallfryy/corl-2025-papers/blob/main/README.md'
SOURCE_TOPCONF = 'https://github.com/Songwxuan/Embodied-AI-Paper-TopConf/blob/main/README.md'

def normalized(value):
    return ''.join(c for c in unicodedata.normalize('NFKD', html.unescape(value)).lower() if c.isalnum())

def clean_url(value):
    value = html.unescape(value).strip().rstrip('.,;:!\\}').replace('\\_', '_')
    while value.endswith(')') and value.count(')') > value.count('('):
        value = value[:-1]
    try:
        u = urlsplit(value)
        host = (u.hostname or '').lower()
        if u.scheme not in ('https', 'http') or not host or '.' not in host:
            return None
        if u.username or u.password or u.port not in (None, 80, 443):
            return None
        if host.endswith(('.local', '.localhost', '.internal')) or re.fullmatch(r'[\d.]+', host):
            return None
        return urlunsplit((u.scheme, u.netloc, u.path.rstrip('/'), u.query, ''))
    except ValueError:
        return None

def repository_url(value):
    url = clean_url(value)
    if not url:
        return None
    u = urlsplit(url)
    parts = u.path.strip('/').split('/')
    if u.hostname != 'github.com' or len(parts) < 2:
        return None
    if parts[0] in ('search', 'topics', 'orgs', 'users', 'settings'):
        return None
    if not all(re.fullmatch(r'[\w.-]+', p) for p in parts[:2]):
        return None
    return 'https://github.com/' + '/'.join(parts[:2]).removesuffix('.git')

def is_project(value):
    u = urlsplit(value)
    excluded = ('github.com','raw.githubusercontent.com','arxiv.org','openreview.net',
                'youtube.com','youtu.be','twitter.com','x.com','doi.org','huggingface.co',
                'drive.google.com','docs.google.com','scholar.google.com','img.shields.io',
                'alphaxiv.org','searcharxiv.com','gist.science','weekinpapers.com',
                'hub.baai.ac.cn','papers.tinrobotics.com','alex-wiki.langotime.ai',
                'aisea.builders','seokmin-hardstudy.tistory.com','paper-curation.jehyunlee.dev',
                'gptget.net','hdatf.com','embodied.transistor.fm','anonymous.4open.science',
                'google.com','wandb.ai')
    if u.hostname=='sites.google.com':return True
    return not any(u.hostname == h or u.hostname.endswith('.'+h) for h in excluded) and not re.search(r'\.(pdf|zip|png|jpg|gif|mp4)$',u.path,re.I)

class Anchors(HTMLParser):
    def __init__(self):
        super().__init__(); self.links=[]; self.href=None; self.label=''
    def handle_starttag(self,tag,attrs):
        if tag=='a': self.href=dict(attrs).get('href'); self.label=''
    def handle_data(self,data):
        if self.href: self.label+=' '+data
    def handle_endtag(self,tag):
        if tag=='a' and self.href:
            self.links.append((self.label.strip(),self.href)); self.href=None

def repository_paper(body,titles,arxiv_ids):
    head=re.split(r'(?im)^#{1,3}\s+(?:related work|references|acknowledg|other projects)',body[:7000])[0]
    text=normalized(head)
    ids={id for title,id in titles.items() if len(title)>20 and title in text}
    linked={arxiv_ids[m] for m in re.findall(r'arxiv.org/(?:abs|pdf)/(\d{4}\.\d{4,5})',head[:3500]) if m in arxiv_ids}
    if ids and linked and not ids.intersection(linked):return None,head
    matches=ids or linked
    return (next(iter(matches)) if len(matches)==1 else None),head

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--sources-dir',type=Path,default=ROOT/'.cache')
    parser.add_argument('--output',type=Path,default=ROOT/'.cache/paper-resources-discovered.json')
    args=parser.parse_args(); sources=args.sources_dir
    cache=sources/'resource-discovery'; cache.mkdir(parents=True,exist_ok=True)
    papers={p['id']:p for year in range(2017,2027) for p in json.loads((ROOT/f'public/data/{year}.json').read_text())['papers']}
    enrichment=json.loads((ROOT/'public/data/enrichment.json').read_text())
    arxiv=json.loads((ROOT/'public/data/arxiv-matches.json').read_text())
    titles={normalized(p['title']):id for id,p in papers.items()}
    arxiv_ids={}
    for id,p in papers.items():
        url=enrichment.get(id,{}).get('arxivUrl') or p.get('arxivUrl') or arxiv.get(id,{}).get('arxivUrl') or ''
        match=re.search(r'(\d{4}\.\d{4,5})',url)
        if match: arxiv_ids[match[1]]=id
    candidates={}
    def add(id,kind,url,source,evidence):
        url=repository_url(url) if kind=='code' else clean_url(url)
        if not url or (kind=='projects' and not is_project(url)): return
        key=(id,kind,url.lower().rstrip('/'))
        candidates.setdefault(key,{'id':id,'kind':kind,'url':url,'source':source,'evidence':evidence})
    def match_title(title,body=''):
        exact=titles.get(normalized(title))
        if exact: return exact
        ids={arxiv_ids[m] for m in re.findall(r'arxiv.org/(?:abs|pdf)/(\d{4}\.\d{4,5})',body) if m in arxiv_ids}
        # Only allow a near-exact title when independently confirmed by arXiv.
        if len(ids)==1:
            from difflib import SequenceMatcher
            id=next(iter(ids))
            if SequenceMatcher(None,normalized(title),normalized(papers[id]['title'])).ratio()>=.97: return id
        return None
    for filename,source,jaywu in [('corl2026-archive.json',SOURCE_2026,False),('jaywu-2026.json',SOURCE_JAYWU,True)]:
        if not (sources/filename).exists():continue
        data=json.loads((sources/filename).read_text()); rows=data if jaywu else data['papers']
        for row in rows:
            id=row['id']; p=papers.get(id); links=row.get('links',{}) if jaywu else row
            if not p or normalized(p['title'])!=normalized(row['title']) or links.get('openreview')!=p.get('forumUrl'):continue
            for field,kind in [('code','code'),('project','projects')]:
                values=links.get(field) or []; values=[values] if isinstance(values,str) else values
                for url in values:add(id,kind,url,source,'OpenReview ID and exact title')
    if (sources/'smallfry-corl-2025.md').exists():
        for tr in re.findall(r'<tr>(.*?)</tr>',(sources/'smallfry-corl-2025.md').read_text(),re.S):
            cells=re.findall(r'<td[^>]*>(.*?)</td>',tr,re.S)
            if len(cells)!=6:continue
            title=re.sub('<[^>]*>','',cells[1]); id=match_title(title,cells[4])
            if not id or papers[id]['year']!=2025:continue
            for col,kind in [(3,'projects'),(5,'code')]:
                for url in re.findall(r'https?://[^\s"<>]+',cells[col]):add(id,kind,url,SOURCE_SMALLFRY,'Title and/or independently indexed arXiv ID')
    if (sources/'topconf.md').exists():
        for line in (sources/'topconf.md').read_text().splitlines():
            if not line.startswith('- '):continue
            title=re.split(r'\[[^\]]*\]\(',line,1)[0].removeprefix('- ').replace('**','').strip()
            id=match_title(title,line)
            if not id:continue
            for label,url in re.findall(r'\[([^\]]+)\]\((https?://[^\s)]+)\)',line):
                if repository_url(url):add(id,'code',url,SOURCE_TOPCONF,'Exact paper title in curated list')
                elif re.search(r'page|project|website',label,re.I):add(id,'projects',url,SOURCE_TOPCONF,'Exact paper title in curated list')
    # Author-provided URLs in the indexed abstract supply direct paper attribution.
    for id,p in papers.items():
        abstract=enrichment.get(id,{}).get('abstract') or p.get('abstract','')
        for url in re.findall(r'https?://[^\s<>"\]]+',abstract):
            add(id,'code' if repository_url(url) else 'projects',url,p.get('forumUrl') or p['proceedingsUrl'],'URL in paper abstract')

    def fetch(url):
        key=hashlib.sha256(url.encode()).hexdigest(); meta=cache/(key+'.json'); body=cache/(key+'.txt')
        if meta.exists():return json.loads(meta.read_text()),body.read_text(errors='replace') if body.exists() else ''
        result=subprocess.run(['curl','-sS','-L','--proto','=http,https','--proto-redir','=http,https','--max-time','18','--connect-timeout','7','--max-filesize','2000000','-A','CoRL-Explorer-Link-Check/1.0','-o',str(body),'-w','%{http_code}\n%{url_effective}',url],capture_output=True,text=True)
        status,_,effective=result.stdout.partition('\n')
        info={'status':int(status) if status.isdigit() else 0,'effectiveUrl':effective,'checkedAt':datetime.now(timezone.utc).isoformat(timespec='seconds'),'complete':result.returncode==0}
        meta.write_text(json.dumps(info)); return info,body.read_text(errors='replace') if body.exists() else ''

    repo_file=sources/'github-discovery-repositories.json'
    repos=json.loads(repo_file.read_text()) if repo_file.exists() else []
    repos={r['name']:r for r in repos if not re.search(r'awesome|paper.?list|survey|reading|conference|course|notes|collection|resources',r['name'],re.I)}
    def read_repository(row):
        base=f"https://raw.githubusercontent.com/{row['name']}/{row['branch']}/"
        for name in ['README.md','readme.md','README.rst']:
            info,body=fetch(base+name)
            if info['status']==200:return row,base+name,body
        return row,None,''
    matches=[]; readmes={}
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        for i,(row,source,body) in enumerate(pool.map(read_repository,repos.values()),1):
            if body:readmes['https://github.com/'+row['name'].lower()]=body
            # Avoid matching references to other research buried later in a README.
            id,head=repository_paper(body,titles,arxiv_ids)
            if id:
                url='https://github.com/'+row['name']
                if '.github.io' not in row['name'] and not re.search(r'replication|reproduction|reimplementation|EECE-\d|assignment|course-project',row['name'],re.I):
                    add(id,'code',url,source,'Unique exact title or arXiv ID near top of repository README'); matches.append((id,url))
                for label,target in re.findall(r'\[([^\]]+)\]\((https?://[^\s)]+)\)',head):
                    if re.search(r'project|website|webpage|web page',label,re.I):add(id,'projects',target,source,'Project link in matched repository README')
                parser=Anchors()
                try:parser.feed(head)
                except Exception:pass
                for label,target in parser.links:
                    if re.search(r'project|website|webpage|web page',label,re.I):add(id,'projects',target,source,'Project link in matched repository README')
            if i%50==0:print(f'Read {i}/{len(repos)} GitHub repositories; matched {len(matches)}',flush=True)
    print(f'Candidates before project crawl: {dict(Counter(r["kind"] for r in candidates.values()))}',flush=True)
    projects=[r for r in candidates.values() if r['kind']=='projects']
    project_results={}
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        for i,(row,(info,body)) in enumerate(zip(projects,pool.map(fetch,[r['url'] for r in projects])),1):
            project_results[row['url']]=info
            if info['status']==200 and info['complete'] and is_project(info['effectiveUrl']):
                parser=Anchors()
                try:parser.feed(body)
                except Exception:pass
                for label,target in parser.links:
                    # Exclude site-template credits, generic GitHub footer icons,
                    # and links to related papers; only explicit code buttons.
                    if re.fullmatch(r'\s*(?:code|code repository|source code|implementation|github code)(?:\s*\([^)]*\))?\s*',label,re.I):
                        url=repository_url(urljoin(info['effectiveUrl'],target))
                        if url and not re.search(r'nerfies|academic-project-page-template|project-page-template',url,re.I):
                            add(row['id'],'code',url,row['url'],'Code button on matched paper project page')
            if i%100==0:print(f'Checked {i}/{len(projects)} project pages',flush=True)
    rows=list(candidates.values()); urls=sorted({r['url'] for r in rows}); results=dict(project_results)
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        missing=[u for u in urls if u not in results]
        for i,(url,(info,_)) in enumerate(zip(missing,pool.map(fetch,missing)),1):
            results[url]=info
            if i%100==0:print(f'Checked {i}/{len(missing)} code repositories',flush=True)
    # A project page may also link to baseline code. Check the target README so
    # those buttons do not silently become implementations of the current paper.
    needs_identity={r['url'] for r in rows if r['kind']=='code' and r['evidence'] in ('Code button on matched paper project page','URL in paper abstract')}
    def read_code(url):
        if url.lower() in readmes:return url,readmes[url.lower()]
        repo=url.removeprefix('https://github.com/')
        for filename in ['README.md','readme.md','README.rst']:
            info,body=fetch(f'https://raw.githubusercontent.com/{repo}/HEAD/{filename}')
            if info['status']==200:return url,body
        return url,''
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        identities={url:repository_paper(body,titles,arxiv_ids)[0] for url,body in pool.map(read_code,needs_identity)}
    existing=json.loads((ROOT/'public/data/paper-code-links.json').read_text())
    for record in existing.values():
        for entry in record['code']:entry.setdefault('source',record['source'])
        record.setdefault('projects',[])
    skipped=[]
    for row in rows:
        info=results[row['url']]
        if info['status']!=200 or not info['complete']:
            skipped.append({**row,**info});continue
        if row['kind']=='projects' and not is_project(info['effectiveUrl']):
            skipped.append({**row,'reason':'Redirects to a paper, repository, video, or other non-project resource'});continue
        if row['kind']=='projects' and row['evidence']=='Project link in matched repository README':
            _,body=fetch(row['url'])
            title_match=normalized(papers[row['id']]['title']) in normalized(re.sub('<[^>]*>',' ',body))
            paper_link=any(arxiv_ids.get(m)==row['id'] for m in re.findall(r'arxiv.org/(?:abs|pdf)/(\d{4}\.\d{4,5})',body)) or f"id={row['id']}" in body
            if not (title_match or paper_link):
                skipped.append({**row,'reason':'Linked page did not confirm paper identity'});continue
        if row['kind']=='code' and row['evidence'] in ('Code button on matched paper project page','URL in paper abstract') and identities.get(row['url'])!=row['id']:
            skipped.append({**row,'reason':'Repository README did not independently confirm this paper'});continue
        id=row['id'];p=papers[id]
        record=existing.setdefault(id,{'title':p['title'],'source':row['source'],'paperSource':p.get('forumUrl') or p['proceedingsUrl'],'code':[],'projects':[]})
        items=record[row['kind']]
        if any(e['url'].lower().rstrip('/')==row['url'].lower().rstrip('/') for e in items):continue
        items.append({k:row[k] for k in ['url','source','evidence']}|{'checkedAt':info['checkedAt']})
    args.output.write_text(json.dumps(existing,ensure_ascii=False,indent=2)+'\n')
    (cache/'unavailable.json').write_text(json.dumps(skipped,ensure_ascii=False,indent=2)+'\n')
    (cache/'candidates.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2)+'\n')
    counts={year:{kind:sum(bool(v[kind]) for id,v in existing.items() if papers[id]['year']==year) for kind in ['code','projects']} for year in range(2017,2027)}
    print(json.dumps(counts,indent=2),flush=True)
    print(f'Wrote reviewable output to {args.output}; {len(skipped)} unavailable candidate links omitted.',flush=True)

if __name__=='__main__':main()
