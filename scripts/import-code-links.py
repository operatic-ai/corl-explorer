"""Import reachable code links from attributed, ID-matched CoRL metadata.

python3 scripts/import-code-links.py --metadata .cache/corl2026-archive.json
python3 scripts/import-code-links.py --smallfry-readme .cache/smallfry-corl-2025.md
Match 2026 by OpenReview ID and title; match 2025 by exact title or verified arXiv
ID plus a near-exact title. Merge reachable GitHub repositories with attribution.
"""
import argparse,concurrent.futures,datetime,difflib,html,json,re,subprocess,unicodedata
from pathlib import Path
from urllib.parse import urlsplit,urlunsplit
ROOT=Path(__file__).resolve().parents[1]
SOURCE='https://gisbi-kim.github.io/conference-explorers/corl2026/data.json'
SMALLFRY='https://github.com/smallfryy/corl-2025-papers/blob/main/README.md'

def normalize(text):
 return ''.join(c for c in unicodedata.normalize('NFKD',text).lower() if c.isalnum())

def smallfry_archive(path):
 papers=json.loads((ROOT/'public/data/2025.json').read_text())['papers']
 matches=json.loads((ROOT/'public/data/arxiv-matches.json').read_text())
 by_title={normalize(p['title']):p for p in papers}
 archive=[]
 for row in re.findall(r'<tr>(.*?)</tr>',path.read_text(),re.S):
  cells=re.findall(r'<td[^>]*>(.*?)</td>',row,re.S)
  if len(cells)!=6:continue
  title=html.unescape(re.sub('<[^>]*>','',cells[1])).strip()
  urls=re.findall(r'https://github.com/[\w.-]+/[\w.-]+',cells[5])
  if not urls:continue
  paper=by_title.get(normalize(title))
  # A title typo is accepted only with an independently indexed matching arXiv ID.
  if not paper:
   ids=re.findall(r'arxiv.org/(?:abs|pdf)/(\d{4}\.\d{4,5})',cells[4])
   possible=[p for p in papers if any('/'+id in (p.get('arxivUrl') or matches.get(p['id'],{}).get('arxivUrl','')) for id in ids)
             and difflib.SequenceMatcher(None,normalize(title),normalize(p['title'])).ratio()>=.97]
   if len(possible)==1:paper=possible[0]
  if not paper:
   print(f'Unmatched code row, omitted: {title}',flush=True);continue
  archive.append({'id':paper['id'],'title':paper['title'],'openreview':paper['forumUrl'],'code':urls})
 return archive,{p['id']:p for p in papers}

def main():
 parser=argparse.ArgumentParser();inputs=parser.add_mutually_exclusive_group(required=True)
 inputs.add_argument('--metadata',type=Path);inputs.add_argument('--smallfry-readme',type=Path);args=parser.parse_args()
 if args.smallfry_readme:
  archive,papers=smallfry_archive(args.smallfry_readme);source=SMALLFRY
 else:
  archive=json.loads(args.metadata.read_text())['papers']
  papers={p['id']:p for p in json.loads((ROOT/'public/data/2026.json').read_text())['papers']};source=SOURCE
 candidates={}
 for row in archive:
  paper=papers.get(row['id'])
  if not paper or row.get('openreview')!=paper['forumUrl']:continue
  if difflib.SequenceMatcher(None,normalize(row['title']),normalize(paper['title'])).ratio()<.97:continue
  urls=[]
  for url in row.get('code',[]):
   parsed=urlsplit(url)
   if parsed.scheme!='https' or parsed.hostname!='github.com':continue
   if not re.fullmatch(r'/[\w.-]+/[\w.-]+/?',parsed.path):continue
   urls.append(urlunsplit(('https','github.com',parsed.path.rstrip('/'),'','')))
  if urls:candidates[paper['id']]={'title':paper['title'],'source':source,'paperSource':paper['forumUrl'],'urls':list(dict.fromkeys(urls))}
 cachefile=ROOT/'.cache/code-links/checks.json';cachefile.parent.mkdir(parents=True,exist_ok=True)
 checks=json.loads(cachefile.read_text()) if cachefile.exists() else {}
 def check(url):
  result=subprocess.run(['curl','--silent','--show-error','--head','--location','--max-time','15','--output','/dev/null','--write-out','%{http_code}',url],capture_output=True,text=True)
  return url,{'status':int(result.stdout) if result.stdout.isdigit() else 0,'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds')}
 urls=sorted({u for p in candidates.values() for u in p['urls'] if u not in checks})
 with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
  for i,(url,result) in enumerate(pool.map(check,urls),1):
   checks[url]=result;cachefile.write_text(json.dumps(checks,indent=2)+'\n')
   if i%20==0:print(f'Checked {i}/{len(urls)} repositories',flush=True)
 target=ROOT/'public/data/paper-code-links.json'
 output=json.loads(target.read_text()) if target.exists() else {}
 for key,row in candidates.items():
  verified=[{'url':url,'checkedAt':checks[url]['checkedAt']} for url in row['urls'] if checks[url]['status']==200]
  if verified:
   existing=output.get(key)
   if existing:
    known={entry['url'].lower().rstrip('/') for entry in existing['code']}
    existing['code'].extend({**entry,'source':source} for entry in verified if entry['url'].lower().rstrip('/') not in known)
   else:output[key]={'title':row['title'],'source':row['source'],'paperSource':row['paperSource'],'code':verified,'projects':[]}
 target.write_text(json.dumps(output,ensure_ascii=False,indent=2)+'\n')
 print(f'Saved code links for {len(output)} papers; {sum(checks[u]["status"]!=200 for u in {u for p in candidates.values() for u in p["urls"]})} unavailable URLs omitted.',flush=True)
if __name__=='__main__':main()
