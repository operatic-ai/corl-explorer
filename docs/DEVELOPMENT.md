# Development

## Run locally

Install Node.js 22+, then run:

```sh
npm ci
npm run dev
```

Open the URL shown in your terminal. `npm run build` creates `dist/` for Cloudflare.

## Check changes

```sh
npm test
npm run test:browser
npm run docs:check
npm run test:matching
```

Browser tests need Google Chrome. Matching tests need Python 3.11+.

## Where things live

- `src/`: app code and styles.
- `public/`: paper data, images, and fonts.
- `scripts/`: data and documentation tools.
- `tests/`: tests.
- `docs/`: this guide and README assets.

## Update the README

```sh
npm run docs:readme
```

Edit the intro directly. Paper tables use the data files and TL;DRs in `src/summaries.js`; regenerate after corrections.

For a new GIF, keep the app running and run `npm run docs:gif`. This needs Chrome and the Python dependencies below.

## Data tools

Install Python 3.11+ dependencies:

```sh
python3 -m venv .venv
.venv/bin/pip install -r scripts/requirements.txt
```

Find missing arXiv links:

```sh
.venv/bin/python scripts/match-arxiv.py --max-hours 8
.venv/bin/python scripts/match-arxiv.py --status
```

Progress is saved automatically. Review uncertain matches before adding them.

Import code links from a downloaded metadata file:

```sh
.venv/bin/python scripts/import-code-links.py --metadata /path/to/corl2026-data.json
npm run docs:readme
```

For 2025, use `--smallfry-readme /path/to/README.md` with [smallfry's list](https://github.com/smallfryy/corl-2025-papers). Verified code links live in `public/data/paper-code-links.json`, shared by the site and README.

## Credits and licenses

Paper content belongs to its authors; topic tags are inferred from titles. Inter and JetBrains Mono licenses are bundled. Neue Machina is licensed separately; redistribution terms still need checking. A project code license is not yet selected.
