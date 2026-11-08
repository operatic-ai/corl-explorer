"""Import the official CoRL 2017–2025 proceedings using PMLR's bulk metadata."""
import concurrent.futures
import html
import json
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import yaml
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
VOLUMES = {2017: 78, 2018: 87, 2019: 100, 2020: 155, 2021: 164, 2022: 205, 2023: 229, 2024: 270, 2025: 305}

def fetch(url):
    return subprocess.run(['curl','--fail','--silent','--show-error','--location','--retry','2','--max-time','45',url],capture_output=True,check=True).stdout.decode()

def clean(value):
    value = html.unescape(str(value or ''))
    value = re.sub(r'\\(?:textit|textbf|emph|mathrm)\{([^{}]*)\}', r'\1', value)
    return re.sub(r'\s+', ' ', value.replace('\\pi', 'π').replace('$', '').replace('_{', '').replace('}', '').replace('{', '')).strip()

def summary(abstract):
    sentences = re.split(r'(?<=[.!?])\s+', abstract)
    text = next((s for s in sentences if re.search(r'\bwe (introduce|propose|present|develop)\b',s,re.I)), sentences[0] if sentences else '')
    text = re.sub(r'^(In this (paper|work),? )?[Ww]e (introduce|propose|present|develop) ', '', text)
    text = text[:1].upper()+text[1:]
    return text if len(text)<=120 else text[:119].rsplit(' ',1)[0].rstrip(' ,;:')+'…'

def import_year(year,volume):
    source = f'https://proceedings.mlr.press/v{volume}/'
    raw = fetch(source+'assets/bib/citeproc.yaml')
    records = yaml.safe_load(raw)
    soup = BeautifulSoup(fetch(source),'html.parser')
    heading = soup.select_one('h1,h2')
    if 'robot learning' not in soup.get_text(' ',strip=True).lower():
        raise ValueError(f'Unexpected venue for {year}')
    links_by_url = {}
    for block in soup.select('.paper'):
        abstract = next((a['href'] for a in block.select('a[href]') if a.get_text(strip=True)=='abs'),None)
        if abstract:
            links_by_url[abstract] = [a['href'] for a in block.select('a[href]')]
    papers=[]
    for record in records:
        title = clean(record.get('title'))
        abstract = clean(record.get('abstract'))
        if not record.get('PDF') or not title or title.lower() in ('preface','front matter'):
            continue
        source_url = record['URL']
        links = links_by_url.get(source_url,[])
        forum = next((url for url in links if urlparse(url).hostname=='openreview.net' and '/forum' in url),None)
        arxiv = next((url for url in links if urlparse(url).hostname in ('arxiv.org','www.arxiv.org') and '/abs/' in url),None)
        if not arxiv:
            match = re.search(r'https?://arxiv\.org/abs/(\d{4}\.\d{4,5}(?:v\d+)?)',abstract)
            arxiv = match.group(0) if match else None
        forum_id = parse_qs(urlparse(forum).query).get('id',[None])[0] if forum else None
        papers.append({
            'id':forum_id or f'pmlr-v{volume}-{record["id"]}', 'year':year,
            'title':title,'authors':[clean(' '.join(str(a.get(k,'')) for k in ('given','family'))) for a in record.get('author',[])],
            'abstract':abstract,'tldr':summary(abstract),'summaryMethod':'Extractive contribution summary, at most 120 characters.',
            'presentation':'Accepted','session':'','forumUrl':forum,'arxivUrl':arxiv,
            'pdfUrl':record['PDF'].replace('http://proceedings.mlr.press/', 'https://proceedings.mlr.press/').replace(' ', '%20'),'proceedingsUrl':source_url,'metadataSource':source_url,
        })
    unique={}
    for paper in papers:
        if paper['id'] in unique:
            previous=unique[paper['id']]
            if previous['title']!=paper['title'] or previous['authors']!=paper['authors']:
                raise ValueError(f'Conflicting duplicate for {year}: {paper["id"]}')
            previous.setdefault('alternateProceedingsUrls',[]).append(paper['proceedingsUrl'])
        else:
            unique[paper['id']]=paper
    papers=list(unique.values())
    if len(papers)<40:
        raise ValueError(f'Incomplete or duplicate data for {year}; existing snapshot preserved')
    output={'year':year,'sourceUrl':source,'sourceEntries':len(records),'retrievedAt':datetime.now(timezone.utc).isoformat(),
            'provenance':'Official PMLR main-conference proceedings. Year is conference edition, not publication year. Presentation type is unknown beyond acceptance.','papers':papers}
    target=ROOT/'public/data'/f'{year}.json'
    temp=target.with_suffix('.tmp');temp.write_text(json.dumps(output,ensure_ascii=False,indent=2)+'\n');temp.replace(target)
    print(f'{year}: {len(papers)} papers; {sum(bool(p["forumUrl"]) for p in papers)} OpenReview links',flush=True)
    return {'year':year,'count':len(papers),'sourceUrl':source,'file':f'/data/{year}.json'}

if __name__=='__main__':
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        years=list(pool.map(lambda item:import_year(*item),VOLUMES.items()))
    current=json.loads((ROOT/'public/data/2026.json').read_text())
    years.append({'year':2026,'count':len(current['papers']),'sourceUrl':current['sourceUrl'],'file':'/data/2026.json'})
    manifest={'years':sorted(years,key=lambda y:y['year'],reverse=True)}
    (ROOT/'public/data/index.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print(f'All ten editions: {sum(y["count"] for y in years)} papers.',flush=True)
