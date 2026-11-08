# CoRL Explorer

A small, static paper explorer with a neutral gray interface and light/dark modes. It indexes **2,175 unique papers across all ten CoRL editions, 2017–2026**, including 687 accepted papers from 2026.

## Run

Use Node 22+ (or supported Node 20).

```sh
npm install
npm run dev
```

The local preview is at http://127.0.0.1:5173. `npm run build` produces a static site in `dist/`; no database, API keys, or server backend are required.

## Experience

- Grid cards: first available paper figure, title, first author + remaining author count, conference year, inferred task chips.
- Stack cards: the same paper information with an extractive TLDR of at most 120 characters.
- A separate `/trends.html` page shows annual paper counts, YoY count growth, topic share lines, and a topic/year heatmap. Chart bars and cells link into filtered paper collections; exact values are available as accessible tables.
- Muted blue statistics, pale green task chips, orange saved bookmarks, and distinct soft presentation colors.
- Search across titles, authors, abstracts, keywords, and inferred themes/tasks.
- Combine theme, task, presentation type, and year filters. Search/filter/layout state is shareable in the URL.
- Local reading list, sorting, incremental loading, keyboard search (`/`), and a PDF dialog (`Escape` to close).
- Share named reading-list snapshots by URL, or download a standalone HTML reading list with titles, authors, summaries, and paper links. Recipient imports merge into their existing bookmarks only when they choose “Save to my reading list.”
- Dark mode follows the system until the user chooses a mode, then persists that choice. The wordmark and collection headings use Neue Machina Plain Medium.
- Separate OpenReview record and arXiv preprint backlinks on each card and in the reader. An unmatched arXiv record is never guessed.
- Prefer an available public arXiv PDF for the reader, with an explicit preprint-version notice. Always retain the OpenReview discussion link and external-PDF fallback.

## Data and provenance

For 2017–2025, titles, authors, abstracts, and PDFs come directly from official PMLR proceedings and their bulk citeproc metadata. Edition years follow the conference date rather than the proceedings publication date. Volumes: 78 (2017), 87 (2018), 100 (2019), 155 (2020), 164 (2021), 205 (2022), 229 (2023), 270 (2024), and 305 (2025). The 2023 volume has 201 entries but two repeated papers; these are deduplicated by OpenReview ID, matching title, and matching authors, with both proceedings URLs preserved. Presentation formats are overlaid from original conference programs and their public spreadsheet exports. The 2022 program is no longer accessible; its OpenReview decisions come from the Paper Copilot archive, also used for 22 title-changed entries missing from the 2024 program match. Each record retains its source URL in `public/data/presentations.json`. The 2017 program lists timed talks without an oral/poster selection distinction, so those cards say “Talk”; one unscheduled 2019 record remains “Accepted.” Virtual 2020 sessions retain “Interactive,” and 2021 Blue Sky papers retain their actual format. Where a paper has multiple verified presentation formats, it matches each corresponding filter.

The official [CoRL 2026 program](https://www.corl.org/program/accepted-papers) is the authority for 2026 inclusion, paper title, and presentation type. Deduplication is by OpenReview forum ID, so oral and spotlight papers are not counted again as posters.

Direct OpenReview API/PDF requests returned a verification challenge during development. For 2026, author lists, abstracts, arXiv links, and keywords are sourced from the [public OpenReview metadata archive by Giseop Kim / APRL](https://gisbi-kim.github.io/conference-explorers/corl2026/), matched by exact OpenReview ID and forum URL. Its metadata snapshot is dated October 18, 2026. Program titles can differ from older metadata titles; both are retained. This is a fallback snapshot, not a live OpenReview sync. Historical OpenReview links are taken from proceedings entries; earlier editions without those links use their official proceedings record. arXiv links are never guessed.

Figure previews are the first `figure.ltx_figure` from title-checked arXiv HTML, including an adjacent preceding image when the HTML separates a figure from its caption. They are resized to local WebP files; their original URL, caption, and version are retained in `public/data/enrichment.json`. No synthetic research figures are used. Missing HTML, figures, or reliable preprints have explicit placeholders. A preprint figure can differ from the final accepted version.

The complete snapshot now has **2,089 real paper previews**, including every paper from 2017–2025. Of these, 500 come from arXiv HTML and 1,589 were extracted from public PDFs. PDF extraction locates the first figure caption and nearby graphics; when no crop can be identified, it uses an explicitly labeled first-page preview. No paper artwork is fabricated. The remaining 86 records are 2026 papers whose accessible PDF could not be found; cards clearly say “Preview unavailable.”

2026 now has 601 verified arXiv links. Additional matches came from the public Arpit Agarwal conference archive (exact OpenReview ID), then arXiv title/author metadata searches. Renamed titles were accepted only with strong author and abstract overlap. Per-record match methods and sources are retained in the enrichment manifest. Historical arXiv links remain limited to explicit official-source matches.

Task/theme chips are title-based heuristics, not official conference labels. Featured TLDRs are concise abstract-based paraphrases; the rest are extractive contribution sentences compacted to 120 characters. They are not expert-reviewed summaries or evaluations of the results. Full abstracts are retained for search.

## Sharing

Select “Share reading list,” name the list, then copy its link or download it. The URL fragment carries a versioned snapshot of paper IDs and the list name; there is no server-side list, login, or synchronization. Editing the sender's bookmarks does not change an existing share link. Recipient bookmarks remain separate until explicitly merged. Missing IDs in an older catalog are reported.

On localhost, links only work on the same computer. **Use the downloaded HTML file to share from the local preview**, or deploy `dist/` to a public host for links that other people can open. The downloaded document needs no app or account and contains ordinary external paper links.

## Refresh data

```sh
python3 -m pip install -r scripts/requirements.txt
npm run data:refresh
npm run data:history
npm run data:enrich
npm run data:presentations
npm run data:previews
```

The PDF preview extractor resumes its `public/data/previews.json` manifest, uses four separate worker processes, and deletes temporary PDFs after saving WebP previews. Run `python3 scripts/extract-previews.py --retry-unavailable` to retry failed sources, or `--year 2024 --limit 10` for a sample. PyMuPDF is included in `scripts/requirements.txt`; a virtual environment is recommended.

The enrichment script resumes downloaded figures and uses two download workers. For a small preview, run `python3 scripts/enrich-papers.py --limit 24`. To work with previously downloaded source files:

```sh
python3 scripts/import-papers.py /path/to/official-program.html
python3 scripts/enrich-papers.py --metadata /path/to/metadata.json
```

Files under `public/data/` and `public/figures/` are the deployable snapshot. `public/data/index.json` lists edition files and counts. The 2026 importer, historical proceedings importer, and 2026 enrichment script are independent so a failed download does not overwrite unrelated editions.

## Checks

```sh
npm test
npm run test:browser
npm run build
```

Browser tests use locally installed Google Chrome and start or reuse the development server. They cover historical editions, search, filters, layout switching, bookmarks, independent-browser sharing, HTML export, theme persistence, pagination, PDF links, keyboard behavior, and mobile overflow. Trends checks cover direct page loading, browser-back navigation, metric/topic changes, filtered drill-down, dark mode, and mobile overflow. Theme statistics apply identical title rules across editions; themes overlap and percentages do not sum to 100%. YoY growth measures indexed accepted paper counts, not acceptance rates.

External PDF availability can vary; a successful catalog test does not establish that every external PDF is reachable.

The compact visual layout follows the local Operatic Embodiment Map reference. Inter and JetBrains Mono are self-hosted; their OFL notices are included in `public/fonts/`.

The current brand mark is a silver rotary actuator built from real Three.js geometry in `src/actuator-logo.js`. Scrolling rotates its housing and keyed shaft with easing, on both pages. The header stays visible while scrolling. Rendering pauses when the animation settles or the tab is hidden; reduced-motion preferences keep it still. Three.js loads separately from the paper interface. `public/brand/actuator.svg` is the favicon and static WebGL fallback. The earlier generated hand and its prompt remain as unused design assets.
