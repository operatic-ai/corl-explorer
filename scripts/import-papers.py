"""Import the official 2026 accepted-paper program, preserving OpenReview IDs.

Usage: python3 scripts/import-papers.py [downloaded-program.html]
The official program is a fallback while the OpenReview API requires a challenge.
"""
import html
import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

SOURCE = 'https://www.corl.org/program/accepted-papers'
ROOT = Path(__file__).resolve().parents[1]

def plain(value):
    return html.unescape(re.sub('<[^>]+>', '', value)).strip()

def parse_program(raw):
    document = html.unescape(raw)
    papers = {}
    for block in re.findall(r'<section class="session(?: poster)?".*?</section>', document, re.S):
        heading = re.search(r'<h3[^>]*>(.*?)</h3>', block, re.S)
        session = plain(heading[1]) if heading else ''
        presentation = 'Oral' if 'class="oral"' in block else 'Spotlight' if 'class="spotlight"' in block else 'Poster'
        for paper_id, title in re.findall(r'<a href="https://openreview.net/forum\?id=([\w-]+)"[^>]*>(.*?)</a>', block, re.S):
            if paper_id not in papers:
                papers[paper_id] = {
                    'id': paper_id, 'year': 2026, 'title': plain(title),
                    'presentation': presentation, 'session': session,
                    'forumUrl': f'https://openreview.net/forum?id={paper_id}',
                    'pdfUrl': f'https://openreview.net/pdf?id={paper_id}',
                }
    return list(papers.values())

if __name__ == '__main__':
    raw = Path(sys.argv[1]).read_text() if len(sys.argv) > 1 else subprocess.run(
        ['curl', '--fail', '--silent', '--show-error', '--location', '--max-time', '60', SOURCE],
        capture_output=True, check=True, text=True,
    ).stdout
    papers = parse_program(raw)
    if len(papers) < 100 or any(not p['title'] for p in papers):
        raise SystemExit('Program format changed or incomplete download; existing data left intact.')
    output = {
        'year': 2026, 'sourceUrl': SOURCE,
        'openReviewUrl': 'https://openreview.net/group?id=robot-learning.org/CoRL/2026/Conference',
        'retrievedAt': datetime.now(timezone.utc).isoformat(),
        'provenance': 'Official CoRL 2026 accepted-paper program, linked to OpenReview. Titles and presentation types only; topic tags are inferred from titles, not official conference tracks.',
        'papers': papers,
    }
    target = ROOT / 'public/data/2026.json'
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(output, ensure_ascii=False, indent=2) + '\n')
    print(f'Imported {len(papers)} unique accepted papers into {target}')
