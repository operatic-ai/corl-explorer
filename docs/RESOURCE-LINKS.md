# Code and project links

The site and README share `public/data/paper-code-links.json`. Each paper can have code repositories and project pages; each link retains its source and last successful HTTP check. A reachable link is not a guarantee that the code is maintained or reproduces the paper.

Sources include author-provided links in indexed abstracts, repository READMEs, and these GitHub collections:

- [smallfryy/corl-2025-papers](https://github.com/smallfryy/corl-2025-papers)
- [gisbi-kim/conference-explorers](https://github.com/gisbi-kim/conference-explorers)
- [jaywu109/corl-2026-papers](https://github.com/jaywu109/corl-2026-papers)
- [Songwxuan/Embodied-AI-Paper-TopConf](https://github.com/Songwxuan/Embodied-AI-Paper-TopConf)

Matches use OpenReview IDs, normalized titles, or independently indexed arXiv IDs. Repository searches are limited to matches near the top of a README, avoiding unrelated references. Ambiguous matches, unavailable pages, site templates, and unrelated collections are left out. Links from paper project pages are checked separately.

`scripts/discover-paper-resources.py` accepts cached source files in `--sources-dir` and writes a separate JSON file for review. Network responses are cached for resumable runs; downloaded code is never executed. Review candidate associations before replacing the published index, then run `npm run docs:readme` and the catalog/browser checks. The source filenames and extraction rules are documented in the script.

To contribute a missing resource, include its URL and the paper's OpenReview or proceedings link. Prefer the authors' repository or project page when available.
