"""Import reachable code links from attributed, ID-matched CoRL metadata.

python3 scripts/import-code-links.py --metadata .cache/corl2026-archive.json
Only GitHub repository URLs attached to the same OpenReview ID and title are
considered. Network results are cached; missing/private repositories are omitted.
"""
import argparse,concurrent.futures,datetime,difflib,json,re,subprocess,unicodedata
from pathlib import Path
from urllib.parse import urlsplit,urlunsplit
ROOT=Path(__file__).resolve().parents[1]
SOURCE='https://gisbi-kim.github.io/conference-explorers/corl2026/data.json'

def normalize(text):
 return ''.join(c for c in unicodedata.normalize('NFKD',text).lower() if c.isalnum())

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--metadata',type=Path,required=True);args=parser.parse_args()
 archive=json.loads(args.metadata.read_text())['papers']
 papers={p['id']:p for p in json.loads((ROOT/'public/data/2026.json').read_text())['papers']}
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
  if urls:candidates[paper['id']]={'title':paper['title'],'source':SOURCE,'paperSource':paper['forumUrl'],'urls':list(dict.fromkeys(urls))}
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
 output={}
 for key,row in candidates.items():
  verified=[{'url':url,'checkedAt':checks[url]['checkedAt']} for url in row['urls'] if checks[url]['status']==200]
  if verified:output[key]={'title':row['title'],'source':row['source'],'paperSource':row['paperSource'],'code':verified}
 target=ROOT/'docs/data/paper-code-links.json';target.write_text(json.dumps(output,ensure_ascii=False,indent=2)+'\n')
 print(f'Saved code links for {len(output)} papers; {sum(checks[u]["status"]!=200 for u in {u for p in candidates.values() for u in p["urls"]})} unavailable URLs omitted.',flush=True)
if __name__=='__main__':main()
