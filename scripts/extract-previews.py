"""Extract a first-figure crop (or disclosed page preview) from public paper PDFs.

Run with .venv/bin/python scripts/extract-previews.py. Downloads are temporary;
the preview manifest is resumable and never invents an image for an inaccessible PDF.
"""
import argparse
import concurrent.futures
import io
import json
import re
import subprocess
import tempfile
from urllib.parse import quote
from pathlib import Path

import pymupdf as fitz
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
TARGET=ROOT/'public/data/previews.json'

def first_figure(doc):
    for number in range(min(5,len(doc))):
        page=doc[number]
        blocks=page.get_text('dict')['blocks']
        for block in blocks:
            if block.get('type')!=0:continue
            text=' '.join(''.join(s['text'] for s in line['spans']) for line in block['lines']).strip()
            if not re.match(r'^(?:Figure|Fig\.)\s*1\s*[:.\s]',text,re.I):continue
            caption=fitz.Rect(block['bbox'])
            # A caption identifies both the figure and the column it belongs to.
            wide=caption.width>page.rect.width*.55
            left=30 if wide or caption.x0<page.rect.width/2 else page.rect.width/2
            right=page.rect.width-30 if wide or caption.x0>=page.rect.width/2 else page.rect.width/2
            area=fitz.Rect(left,max(25,caption.y0-430),right,caption.y0-3)
            graphics=[fitz.Rect(i['bbox']) for i in page.get_image_info()]
            graphics += [fitz.Rect(d['rect']) for d in page.get_drawings() if fitz.Rect(d['rect']).get_area()>80]
            relevant=[r for r in graphics if r.intersects(area) and r.y1<=caption.y0+8 and r.width>12 and r.height>12]
            if relevant:
                crop=relevant[0]
                for rect in relevant[1:]:crop|=rect
                crop=fitz.Rect(max(left,crop.x0-10),max(15,crop.y0-12),min(right,crop.x1+10),min(caption.y0,crop.y1+12))
                if crop.width>90 and crop.height>45:return number,crop,'figure',text
    # Some theoretical papers or conversions have no extractable figure.
    # Show an honest page preview rather than unrelated or generated artwork.
    page=doc[0]
    return 0,fitz.Rect(25,35,page.rect.width-25,min(page.rect.height-30,620)),'page','First page of the paper; no first-figure crop was identified.'

def extract(paper):
    output=ROOT/'public/figures'/f'{paper["id"]}.webp'
    urls=[]
    if paper.get('arxivUrl'):urls.append(paper['arxivUrl'].replace('/abs/','/pdf/'))
    if paper.get('pdfUrl'):urls.append(paper['pdfUrl'])
    errors=[]
    for url in dict.fromkeys(urls):
        url=quote(url,safe=':/?=&%#')
        try:
            with tempfile.TemporaryDirectory(prefix='corl-pdf-') as temp:
                pdf=Path(temp)/'paper.pdf'
                result=subprocess.run(['curl','--fail','--silent','--show-error','--location','--max-time','90','--max-filesize','125829120',url,'-o',str(pdf)],capture_output=True,timeout=95)
                if result.returncode:
                    errors.append(result.stderr.decode(errors='replace').strip()[-160:]);continue
                if pdf.read_bytes()[:5]!=b'%PDF-':errors.append('Source returned a verification page instead of a PDF');continue
                with fitz.open(pdf) as doc:
                    if not len(doc):raise ValueError('Empty PDF')
                    page,crop,kind,caption=first_figure(doc)
                    scale=min(2,1100/max(crop.width,1))
                    pix=doc[page].get_pixmap(matrix=fitz.Matrix(scale,scale),clip=crop,alpha=False)
                    image=Image.open(io.BytesIO(pix.tobytes('png')))
                    image.thumbnail((1100,800))
                    output.parent.mkdir(parents=True,exist_ok=True)
                    image.convert('RGB').save(output,'WEBP',quality=84)
                    return paper['id'],{'figure':f'/figures/{paper["id"]}.webp','figureSource':url,'figureKind':kind,'figurePage':page+1,'figureClip':list(crop),'figureCaption':caption,'previewStatus':'available'}
        except Exception as error:errors.append(str(error)[:150])
    return paper['id'],{'previewStatus':'unavailable','previewError':'; '.join(errors) or 'No verified PDF URL'}

def save(data):
    temp=TARGET.with_suffix('.tmp');temp.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n');temp.replace(TARGET)

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--limit',type=int);parser.add_argument('--year',type=int);parser.add_argument('--retry-unavailable',action='store_true');args=parser.parse_args()
    existing=json.loads(TARGET.read_text()) if TARGET.exists() else {}
    enrichment=json.loads((ROOT/'public/data/enrichment.json').read_text())
    papers=[]
    for year in range(2017,2027):
        if args.year and year!=args.year:continue
        for paper in json.loads((ROOT/f'public/data/{year}.json').read_text())['papers']:
            if year==2026:paper.update(enrichment.get(paper['id'],{}))
            if paper.get('figure') and (ROOT/'public'/paper['figure'].lstrip('/')).exists():continue
            cached=existing.get(paper['id'],{})
            if cached.get('figure') and (ROOT/'public'/cached['figure'].lstrip('/')).exists():continue
            if cached.get('previewStatus')=='unavailable' and not args.retry_unavailable:continue
            papers.append(paper)
    if args.limit:papers=papers[:args.limit]
    print(f'Processing {len(papers)} PDF previews with four workers.',flush=True)
    with concurrent.futures.ProcessPoolExecutor(max_workers=4) as pool:
        futures=[pool.submit(extract,p) for p in papers]
        for count,future in enumerate(concurrent.futures.as_completed(futures),1):
            key,record=future.result();existing[key]=record
            if count%20==0:
                save(existing);print(f'{count}/{len(papers)} processed | {sum(bool(v.get("figure")) for v in existing.values())} extracted | {sum(v.get("previewStatus")=="unavailable" for v in existing.values())} unavailable',flush=True)
    save(existing)
    print(f'Complete: {sum(bool(v.get("figure")) for v in existing.values())} extracted previews.',flush=True)
