"""Restore presentation formats from official programs, retaining source URLs.
Caches source snapshots in .cache/programs; never infers a format from a score.
"""
import csv,io,json,re,subprocess,unicodedata
from pathlib import Path
from urllib.parse import urlparse,parse_qs
from bs4 import BeautifulSoup
ROOT=Path(__file__).resolve().parents[1]
CACHE=ROOT/'.cache/programs';CACHE.mkdir(parents=True,exist_ok=True)
DATA={y:json.loads((ROOT/f'public/data/{y}.json').read_text())['papers'] for y in range(2017,2027)}
RESULT={}
def cached(url,name):
 path=CACHE/name
 if not path.exists():subprocess.run(['curl','-fLsS','--max-time','60',url,'-o',str(path)],check=True)
 return path
def fetch(url,name):return cached(url,name).read_text()
def norm(s):return re.sub(r'[^a-z0-9]','',unicodedata.normalize('NFKD',s).encode('ascii','ignore').decode().lower())
def match(year,title):
 target=norm(title)
 aliases={
  'Reinforcement Learning of Manipulation and Active Perception Policies under Occlusions':'Reinforcement Learning of Active Vision for Manipulating Objects under Occlusions',
  'Curiosity Driven Goal Exploration of Learned Disentangled Goal Spaces':'Curiosity Driven Exploration of Learned Disentangled Goal Spaces',
  'Mapping Navigation Instructions to Actions with Position Visitation Prediction':'Mapping Navigation Instructions to Continuous Control Actions with Position-Visitation Prediction',
  'QT-Opt: Scalable Deep Reinforcement Learning for Vision-Based Robotic Manipulation':'Scalable Deep Reinforcement Learning for Vision-Based Robotic Manipulation',
  'Multiple Interactions Made Easy (MIME) : A Large Scale Demonstrations Dataset':'Multiple Interactions Made Easy (MIME): Large Scale Demonstrations Data for Imitation',
  'Object-centric Forward Modeling for Visual Model Predictive Control':'Object-centric Forward Modeling for Model Predictive Control',
  'Learning to Manipulate Objects Collections Using Grounded State Representations':'Learning to Manipulate Object Collections Using Grounded State Representations',
  'Imagined Value Gradients: Model-Based Policy Optimization with Transferable Latent Dynamics Models':'Imagined Value Gradients: Model-Based Policy Optimization with Tranferable Latent Dynamics Models',
  'Energy-efficient Path Planning for Ground Robots by Combining Air and Ground Measurements':'Energy-efficient Path Planning for Ground Robots by and Combining Air and Ground Measurements',
  'ACNMP: Flexible Skill Formation with Learning from Demonstration and Reinforcement Learning via Representation Sharing':'ACNMP: Skill Transfer and Task Extrapolation through Learning from Demonstration and Reinforcement Learning via Representation Sharing',
 }
 target={norm(k):norm(v) for k,v in aliases.items()}.get(target,target)
 exact=next((p for p in DATA[year] if norm(p['title'])==target),None)
 if exact:return exact
 if title.endswith(('...','…')) and len(target)>60:
  hits=[p for p in DATA[year] if norm(p['title']).startswith(target)]
  if len(hits)==1:return hits[0]
 return None
def add(p,formats,source,session=''):
 if not p:return
 old=RESULT.get(p['id'],{})
 types=set(old.get('presentations',[]))|set(formats)
 ranked=[t for t in ['Oral','Spotlight','Poster','Interactive','Talk'] if t in types]
 RESULT[p['id']]={'presentation':ranked[0],'presentations':ranked,'presentationSources':list(dict.fromkeys(old.get('presentationSources',[])+[source]))}
 if session:RESULT[p['id']]['presentationSession']=session
for year,url in [(2023,'https://www.corl2023.org/papers'),(2025,'https://2025.corl.org/program/main-conference')]:
 soup=BeautifulSoup(fetch(url,f'{year}.html'),'html.parser')
 for a in soup.find_all('a',href=True):
  if 'openreview.net/forum?' not in a['href']:continue
  key=parse_qs(urlparse(a['href']).query).get('id',[''])[0]
  p=next((p for p in DATA[year] if p['id']==key),None)
  heading=a.find_previous('h2');session=heading.get_text(' ',strip=True) if heading else ''
  primary='Oral' if session.startswith('Oral') else 'Spotlight' if session.startswith('Spotlight') else 'Poster' if session.startswith('Poster') else None
  if primary:add(p,[primary,'Poster'],url,session)
url='https://2024.corl.org/program/papers-xx'
soup=BeautifulSoup(fetch(url,'2024.html'),'html.parser')
for el in soup.find_all('p'):
 title=el.get_text(' ',strip=True)
 if not re.match(r'^\d+\.',title):continue
 title=re.sub(r'^\d+\.\s*','',title).split('Authors:')[0].strip()
 heading=el.find_previous('h2');session=heading.get_text(' ',strip=True) if heading else ''
 add(match(2024,title),['Oral','Poster'] if session.startswith('Oral') else ['Poster'],url,session)
for kind,key in [('Oral','1phR9oXa3okyC6p8JbTNSWutIQhIS5I37DZbvAcJtqhs'),('Poster','1fMCZCVuuFRm9mRpYB8TjW1YyDS3R1S6R-Yl-_lOcP1s')]:
 url=f'https://docs.google.com/spreadsheets/d/{key}/export?format=csv'
 for row in csv.DictReader(io.StringIO(fetch(url,f'2021-{kind}.csv'))):
  key=parse_qs(urlparse(row.get('OR Link','')).query).get('id',[''])[0]
  p=next((p for p in DATA[2021] if p['id']==key),None) or match(2021,row.get('Title',''))
  add(p,[kind],url)
# Public OpenReview archive fallback where the original program is unavailable.
for year in [2022,2024]:
 path=cached(f'https://huggingface.co/datasets/papercopilot/paperlists/resolve/main/corl/corl{year}.json',f'{year}-archive.json')
 for row in json.loads(path.read_text()):
  p=next((p for p in DATA[year] if p['id']==row['id']),None)
  if p and p['id'] not in RESULT and row['status'] in ['Oral','Poster','Spotlight']:
   add(p,[row['status']],f'https://github.com/papercopilot/paperlists/blob/main/corl/corl{year}.json')
# Old Google Sites pages contain their schedules in embedded HTML attributes.
for year in [2018,2019]:
 outer=BeautifulSoup(fetch(f'https://{year}.corl.org/'+('corl-2018/program-at-a-glance' if year==2018 else 'home/program'),f'{year}-overview.html'),'html.parser')
 links=sorted(set(a['href'] for a in outer.find_all('a',href=True) if 'Schedule' in a.get_text())) if outer else []
 for i,url in enumerate(links):
  source=f'https://{year}.corl.org{url}'
  outer=BeautifulSoup(fetch(source,f'{year}-{i}.html'),'html.parser')
  soup=BeautifulSoup(outer.select_one('[data-code]')['data-code'],'html.parser')
  kind=None
  for el in soup.find_all(['font','span','a']):
   text=el.get_text(' ',strip=True)
   if len(text)<100 and 'Oral presentation' in text:kind='Oral'
   elif len(text)<100 and 'Poster spotlight' in text:kind='Poster'
   if el.name=='a' and 'viewAbstract' in el.get('onclick','') and kind:
    add(match(year,text),[kind],source)
# 2020 was virtual: keep its actual 'Interactive' format instead of inventing posters.
import zipfile,xml.etree.ElementTree as ET
for filename,kind,key in [('2020.xlsx','Oral','1Ub_93OyWLZSrjnJER3ZQ02Zrq9iR19kxPJ5x-D1WPxU'),('2020-interactive.xlsx','Interactive','1zlt9pO8fiz3MkMh0UDEzCdOvPrwcC7Emq_H1h1Hjs7k')]:
 path=cached(f'https://docs.google.com/spreadsheets/d/{key}/export?format=xlsx',filename)
 with zipfile.ZipFile(path) as archive:
  for el in ET.fromstring(archive.read('xl/sharedStrings.xml')):
   add(match(2020,''.join(el.itertext())),[kind],f'https://docs.google.com/spreadsheets/d/{key}/edit')
path=cached('https://docs.google.com/spreadsheets/d/1kThDqejg21-INx4vRLVdc0kHT-fjGEke1oZ0IrtLD-k/export?format=csv','2021-BlueSky.csv')
if path.exists():
 for row in csv.DictReader(io.StringIO(path.read_text())):
  p=match(2021,row.get('Title',''))
  if p:
   RESULT[p['id']]={'presentation':'Blue Sky','presentations':['Blue Sky'],'presentationSources':['https://docs.google.com/spreadsheets/d/1kThDqejg21-INx4vRLVdc0kHT-fjGEke1oZ0IrtLD-k/edit']}
# The first edition lists timed paper talks without oral/poster selection labels.
# Preserve that distinction rather than treating a longer slot as an award tier.
for i,day in enumerate(['monday-november-13','tuesday-november-14','wednesday-november-15']):
 url=f'https://2017.corl.org/corl-2017/{day}-schedule'
 outer=BeautifulSoup(fetch(url,f'2017-{i}.html'),'html.parser')
 soup=BeautifulSoup(outer.select_one('[data-code]')['data-code'],'html.parser')
 for a in soup.find_all('a',href=True):
  if 'proceedings.mlr.press/v78/' in a['href']:add(match(2017,a.get_text(' ',strip=True)),['Talk'],url)
for p in DATA[2026]:
 if p.get('presentation') in ['Oral','Spotlight','Poster']:add(p,[p['presentation'],'Poster'],'https://www.corl.org/program/accepted-papers')
# Additional manually audited official schedule extracts can be supplied without
# changing the base proceedings metadata or assuming all unlisted papers are posters.
extra=CACHE/'additional.json'
if extra.exists():
 for row in json.loads(extra.read_text()):add(match(row['year'],row['title']),row['presentations'],row['source'],row.get('session',''))
(ROOT/'public/data/presentations.json').write_text(json.dumps(RESULT,ensure_ascii=False,indent=2)+'\n')
from collections import Counter
for year,rows in DATA.items():print(year,Counter(RESULT.get(p['id'],{}).get('presentation','Unspecified') for p in rows))
