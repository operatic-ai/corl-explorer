"""Match missing CoRL arXiv links against arXiv's public metadata API.

python3 scripts/match-arxiv.py --max-hours 8
python3 scripts/match-arxiv.py --status

Sequential requests, >=3.2 seconds apart; no API key or paid service required.
Only high-confidence title AND author matches become public links. Every query,
response and rejected candidate is checkpointed in .cache/arxiv-matching/.
Public links are an additive overlay; original proceedings metadata is untouched.
"""
import argparse
import datetime as dt
import difflib
import fcntl
import hashlib
import json
import re
import subprocess
import time
import unicodedata
import urllib.parse
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'public/data'
CACHE = ROOT / '.cache/arxiv-matching'
OUTPUT = DATA / 'arxiv-matches.json'
STATE = CACHE / 'checkpoint.json'
REPORT = CACHE / 'report.json'
ATOM = '{http://www.w3.org/2005/Atom}'
API = 'https://export.arxiv.org/api/query'
STOP = {'learning','robot','robotic','robots','using','based','with','from','through','towards','toward','and','for','the','with','via','without'}


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds')


def read_json(path, default):
    return json.loads(path.read_text()) if path.exists() else default


def atomic_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + '.tmp')
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
    temp.replace(path)


def normalize(text):
    text = unicodedata.normalize('NFKD', text).casefold()
    return ''.join(c for c in text if c.isalnum() and not unicodedata.combining(c))


def words(text):
    return re.findall(r'[a-z0-9]+', unicodedata.normalize('NFKD', text).encode('ascii','ignore').decode().lower())


def author_matches(left, right):
    if normalize(left) == normalize(right):
        return True
    a, b = words(left), words(right)
    if len(a)<2 or len(b)<2 or a[-1]!=b[-1]:
        return False
    # Only abbreviations, never two different full given names with one initial.
    return a[0]==b[0] or (min(len(a[0]),len(b[0]))==1 and a[0][0]==b[0][0])


def assess(paper, candidate):
    title_score = difflib.SequenceMatcher(None, normalize(paper['title']), normalize(candidate['title'])).ratio()
    expected = list(dict.fromkeys(paper.get('authors') or []))
    remaining = list(candidate.get('authors') or [])
    matches = 0
    for author in expected:
        found = next((i for i,name in enumerate(remaining) if author_matches(author,name)),None)
        if found is not None:
            matches += 1
            remaining.pop(found)
    coverage = matches/max(len(expected),1)
    candidate_coverage = matches/max(len(candidate.get('authors') or []),1)
    year = int(candidate.get('published','0000')[:4])
    date_ok = paper['year']-3 <= year <= paper['year']+1
    enough_authors = matches >= min(2,len(expected)) and bool(expected)
    accepted = date_ok and enough_authors and (
        (title_score==1 and coverage>=.5 and candidate_coverage>=.5) or
        (title_score>=.97 and coverage>=.67 and candidate_coverage>=.67)
    )
    return {'accepted':accepted,'titleSimilarity':round(title_score,5),
            'matchedAuthors':matches,'authorCoverage':round(coverage,5),
            'candidateAuthorCoverage':round(candidate_coverage,5),'datePlausible':date_ok}


def parse_feed(xml):
    root = ET.fromstring(xml)
    if root.tag != ATOM+'feed':
        raise ValueError('Expected an arXiv Atom feed')
    records=[]
    for entry in root.findall(ATOM+'entry'):
        identifier=entry.findtext(ATOM+'id','')
        match=re.search(r'arxiv\.org/abs/((?:\d{4}\.\d{4,5}|[a-z.-]+/\d{7}))(?:v\d+)?$',identifier,re.I)
        if not match:
            raise ValueError('Invalid arXiv entry: '+identifier)
        records.append({'arxivUrl':'https://arxiv.org/abs/'+match.group(1),
                        'title':' '.join(entry.findtext(ATOM+'title','').split()),
                        'authors':[a.findtext(ATOM+'name','').strip() for a in entry.findall(ATOM+'author')],
                        'published':entry.findtext(ATOM+'published',''),
                        'updated':entry.findtext(ATOM+'updated','')})
    return records


def queries(paper):
    # Strip API query punctuation while retaining the exact title's words.
    clean=' '.join(words(paper['title']))
    yield f'ti:"{clean}"'
    terms=list(dict.fromkeys(w for w in words(paper['title']) if len(w)>=4 and w not in STOP))
    terms=sorted(terms,key=len,reverse=True)[:4]
    if len(terms)>=2:
        expression=' AND '.join('ti:'+t for t in terms)
        authors=paper.get('authors') or []
        if authors:
            surname=words(authors[0])[-1:]
            if surname: expression += ' AND au:'+surname[0]
        yield expression
    # Retitled preprints often retain an opening phrase; keep these for review
    # unless the complete returned title and author evidence still pass assess().
    opening=words(paper['title'])[:3]
    authors=paper.get('authors') or []
    if len(opening)==3 and authors and words(authors[0]):
        yield 'ti:"'+' '.join(opening)+'" AND au:'+words(authors[0])[-1]


class Client:
    def __init__(self, delay, deadline):
        self.delay=max(3.2,delay)
        self.deadline=deadline
        self.last=0
        self.requests=0

    def search(self, query):
        url=API+'?'+urllib.parse.urlencode({'search_query':query,'max_results':10,'sortBy':'relevance'})
        path=CACHE/'responses'/(hashlib.sha256(url.encode()).hexdigest()+'.xml')
        if path.exists():
            return parse_feed(path.read_bytes()),url
        for attempt in range(3):
            wait=max(0,self.delay-(time.monotonic()-self.last))
            if time.monotonic()+wait>=self.deadline:
                raise TimeoutError('Run time limit reached')
            time.sleep(wait)
            self.last=time.monotonic()
            self.requests+=1
            result=subprocess.run(['curl','--silent','--show-error','--location','--max-time','30',
                '--user-agent','CoRL-Explorer-Metadata/1.0 (https://github.com/operatic-ai/corl-explorer)',
                '--write-out','\n%{http_code}',url],capture_output=True)
            body,_,status=result.stdout.rpartition(b'\n')
            if result.returncode==0 and status==b'200':
                records=parse_feed(body)
                path.parent.mkdir(parents=True,exist_ok=True)
                path.write_bytes(body)
                return records,url
            if status not in (b'429',b'500',b'502',b'503',b'504',b'000'):
                raise RuntimeError('arXiv HTTP '+status.decode(errors='replace'))
            backoff=20*(2**attempt)
            if time.monotonic()+backoff>=self.deadline:
                raise TimeoutError('Run time limit reached')
            time.sleep(backoff)
        raise RuntimeError('arXiv unavailable after three attempts')


def load_papers():
    enrichment=read_json(DATA/'enrichment.json',{})
    result=[]
    for year in range(2017,2027):
        for paper in read_json(DATA/f'{year}.json',{})['papers']:
            result.append({**paper,**(enrichment.get(paper['id'],{}) if year==2026 else {})})
    return result


def report(papers, output, checkpoints, status, started, requests):
    rows=[]
    for year in range(2017,2027):
        group=[p for p in papers if p['year']==year]
        original=sum(bool(p.get('arxivUrl')) for p in group)
        added=sum(not p.get('arxivUrl') and p['id'] in output for p in group)
        rows.append({'year':year,'papers':len(group),'originalLinks':original,'newLinks':added,'missing':len(group)-original-added})
    return {'status':status,'startedAt':started,'updatedAt':now(),'requestsThisRun':requests,
            'newLinks':len(output),'checked':len(checkpoints),'byYear':rows,
            'outcomes':{name:sum(v['status']==name for v in checkpoints.values()) for name in ['matched','unmatched','review','error']}}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--max-hours',type=float,default=8)
    parser.add_argument('--limit',type=int)
    parser.add_argument('--years',type=int,nargs='+',choices=range(2017,2027))
    parser.add_argument('--delay',type=float,default=3.2)
    parser.add_argument('--status',action='store_true')
    parser.add_argument('--retry-unmatched',action='store_true')
    args=parser.parse_args()
    if args.status:
        print(json.dumps(read_json(REPORT,{'status':'not started'}),indent=2));return
    CACHE.mkdir(parents=True,exist_ok=True)
    lock=(CACHE/'run.lock').open('w')
    try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
    except BlockingIOError:raise SystemExit('A matching job is already running.')
    started=now();deadline=time.monotonic()+args.max_hours*3600
    papers=load_papers();output=read_json(OUTPUT,{});checkpoints=read_json(STATE,{})
    client=Client(args.delay,deadline)
    candidates=[p for p in papers if not p.get('arxivUrl') and p['id'] not in output and
                (p['id'] not in checkpoints or checkpoints[p['id']]['status']=='error' or args.retry_unmatched)]
    # Start with recent editions, where missing links affect the most browsing.
    if args.years:candidates=[p for p in candidates if p['year'] in args.years]
    candidates.sort(key=lambda p:(-p['year'],p['title']))
    if args.limit:candidates=candidates[:args.limit]
    print(f'{now()} | Starting {len(candidates)} missing papers; {len(output)} previously matched',flush=True)
    status='running';consecutive_errors=0
    def save():
        atomic_json(OUTPUT,output);atomic_json(STATE,checkpoints)
        atomic_json(REPORT,report(papers,output,checkpoints,status,started,client.requests))
    save()
    try:
        for i,paper in enumerate(candidates,1):
            if time.monotonic()>=deadline:status='time_limit';break
            found={};searches=[];outcome='unmatched'
            try:
                for query in queries(paper):
                    results,url=client.search(query);searches.append(url)
                    for candidate in results:
                        found[candidate['arxivUrl']]={**candidate,'assessment':assess(paper,candidate),'source':url}
                    accepted=[c for c in found.values() if c['assessment']['accepted']]
                    if accepted:break
                accepted=[c for c in found.values() if c['assessment']['accepted']]
                if len(accepted)==1:
                    match=accepted[0]
                    # Never silently assign the same preprint to different indexed titles.
                    conflicting=any(v['arxivUrl']==match['arxivUrl'] and normalize(v['arxivMatch']['indexedTitle'])!=normalize(paper['title']) for v in output.values())
                    if not conflicting:
                        output[paper['id']]={'arxivUrl':match['arxivUrl'],'arxivMatch':{
                            'indexedTitle':paper['title'],'matchedTitle':match['title'],'authors':match['authors'],
                            'published':match['published'],'source':match['source'],'checkedAt':now(),
                            'method':'arXiv API title and author verification',**match['assessment']}}
                        outcome='matched'
                    else:outcome='review'
                elif accepted or any(c['assessment']['titleSimilarity']>=.75 for c in found.values()):outcome='review'
                consecutive_errors=0
                checkpoints[paper['id']]={'status':outcome,'title':paper['title'],'year':paper['year'],'checkedAt':now(),'queries':searches,'candidates':list(found.values())}
            except TimeoutError:status='time_limit';break
            except Exception as error:
                consecutive_errors+=1;outcome='error'
                checkpoints[paper['id']]={'status':'error','title':paper['title'],'year':paper['year'],'checkedAt':now(),'error':str(error),'queries':searches}
            save()
            print(f'{now()} | {i}/{len(candidates)} | {outcome} | {len(output)} total new links | {paper["year"]} {paper["title"]}',flush=True)
            if consecutive_errors>=10:status='service_unavailable';break
        else:status='batch_complete' if args.limit or args.years else 'complete'
    except KeyboardInterrupt:status='interrupted'
    finally:
        save()
        print(f'{now()} | {status} | {len(output)} verified links | report: {REPORT}',flush=True)


if __name__=='__main__':main()
