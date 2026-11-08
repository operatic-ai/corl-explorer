"""Enrich official paper IDs with attributed public metadata and first figures.

python3 scripts/enrich-papers.py [--limit 24] [--metadata /path/to/data.json]
Requires beautifulsoup4 and Pillow. Downloads are resumable; no credentials needed.
"""
import argparse
import concurrent.futures
import difflib
import io
import json
import re
import subprocess
import threading
import time
import urllib.parse
import urllib.request
from pathlib import Path

from bs4 import BeautifulSoup
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ARCHIVE = 'https://gisbi-kim.github.io/conference-explorers/corl2026/data.json'
LOCK = threading.Lock()

def get(url):
    return subprocess.run(['curl', '--fail', '--silent', '--show-error', '--location', '--max-time', '20', url], capture_output=True, check=True).stdout

def compact(text):
    text = re.sub(r'\s+', ' ', text).strip()
    sentences = re.split(r'(?<=[.!?])\s+', text)
    contribution = next((s for s in sentences if re.search(r'\bwe (?:introduce|present|propose|develop)\b', s, re.I)), sentences[0] if sentences else '')
    contribution = re.sub(r'^(?:In this (?:paper|work),?\s*)?(?:To [^,]+,\s*)?[Ww]e (?:introduce|present|propose|develop)\s+', '', contribution)
    contribution = contribution[:1].upper() + contribution[1:]
    if len(contribution) > 120:
        contribution = contribution[:119].rsplit(' ', 1)[0].rstrip(' ,;:') + '…'
    return contribution

def normalize(text):
    return re.sub(r'[^a-z0-9]', '', text.lower())

def download_figure(paper, record):
    path = ROOT / 'public/figures' / f'{paper["id"]}.webp'
    if path.exists() and record.get('figureSource'):
        return 'cached'
    url = record.get('arxivUrl', '').replace('/abs/', '/html/')
    if not url:
        return 'no preprint'
    try:
        time.sleep(1)
        soup = BeautifulSoup(get(url), 'html.parser')
        title = soup.select_one('h1.ltx_title') or soup.title
        if not title or max(difflib.SequenceMatcher(None, normalize(title.get_text()), normalize(t)).ratio() for t in [paper['title'], record.get('metadataTitle', paper['title'])]) < .72:
            return 'title mismatch or no HTML'
        figure = soup.select_one('figure.ltx_figure')
        img = figure.select_one('img') if figure else None
        # Some arXiv conversions put the image immediately before its caption.
        # Only use the adjacent paragraph, never an unrelated later figure.
        if not img and figure:
            previous = figure.find_previous_sibling()
            if previous:
                img = previous.select_one('img.ltx_graphics')
        if not img or not img.get('src'):
            return 'no first figure'
        source = urllib.parse.urljoin(url, img['src'])
        if urllib.parse.urlparse(source).hostname not in ('arxiv.org', 'www.arxiv.org'):
            return 'unexpected figure host'
        data = get(source)
        image = Image.open(io.BytesIO(data))
        if image.width < 80 or image.height < 50:
            return 'image too small'
        image.thumbnail((1000, 700))
        path.parent.mkdir(parents=True, exist_ok=True)
        rgba = image.convert('RGBA')
        background = Image.new('RGBA', rgba.size, 'white')
        background.alpha_composite(rgba)
        background.convert('RGB').save(path, 'WEBP', quality=85)
        caption = figure.select_one('figcaption')
        with LOCK:
            record.update({'figure': f'/figures/{paper["id"]}.webp', 'figureSource': source,
                           'figureCaption': caption.get_text(' ', strip=True) if caption else '',
                           'figureVersion': url})
        return 'figure saved'
    except Exception as error:
        return type(error).__name__

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--limit', type=int)
    parser.add_argument('--metadata')
    args = parser.parse_args()
    archive = json.loads(Path(args.metadata).read_text() if args.metadata else get(ARCHIVE))
    by_id = {p['id']: p for p in archive['papers']}
    papers = json.loads((ROOT / 'public/data/2026.json').read_text())['papers']
    target = ROOT / 'public/data/enrichment.json'
    result = json.loads(target.read_text()) if target.exists() else {}
    for p in papers:
        m = by_id.get(p['id'])
        if not m or m.get('openreview') != p['forumUrl']:
            continue
        result.setdefault(p['id'], {}).update({
            'authors': m.get('authors', []), 'abstract': m.get('abstract', ''),
            'keywords': m.get('keywords', []), 'arxivUrl': m.get('arxiv', ''),
            'tldr': result.get(p['id'], {}).get('tldr') or compact(m.get('abstract', '')),
            'summaryMethod': 'Extractive contribution sentence, shortened to 120 characters.',
            'metadataSource': m.get('metadata_source', p['forumUrl']),
            'metadataTitle': m.get('title'),
            'metadataArchive': ARCHIVE, 'metadataChecked': m.get('metadata_checked', archive.get('updated')),
        })
    def save():
        with LOCK:
            temp = target.with_suffix('.tmp')
            temp.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
            temp.replace(target)
    save()
    ordered = sorted(papers, key=lambda p: ({'Oral': 0, 'Spotlight': 1, 'Poster': 2}[p['presentation']], p['title']))
    candidates = [p for p in ordered if p['id'] in result and result[p['id']].get('arxivUrl')]
    if args.limit:
        candidates = candidates[:args.limit]
    print(f'Metadata: {len(result)} papers. Checking {len(candidates)} first figures.', flush=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        jobs = {pool.submit(download_figure, p, result[p['id']]): p for p in candidates}
        for i, future in enumerate(concurrent.futures.as_completed(jobs), 1):
            status = future.result()
            if i % 10 == 0 or status == 'figure saved':
                save()
                print(f'{i}/{len(candidates)} | {sum(bool(x.get("figure")) for x in result.values())} figures | {status}', flush=True)
    save()
    print('Enrichment complete.', flush=True)
