# Abstract snapshots

`abstracts.json` contains the source wording, source URL/version, retrieval date,
and derived HTML. Whitespace and PDF line wrapping are normalized; wording is not
summarized or edited. The source titles are retained because preprints can have
different titles from the published papers. Mathematical TeX is rendered as native
MathML, with no runtime downloads. Repository transcription quirks are preserved.

To edit: update `text` and source metadata, run `npm install`, then
`node scripts/render-abstracts.cjs` and `python3 build.py`. The build checks the text
hash to catch stale typesetting. `fetch_abstracts.py` only writes candidates for
review and never replaces the checked snapshots.

Pending: `bushaw-larson-vancleemput-primus`. The publisher
https://doi.org/10.1080/10511970.2025.2507040 blocked retrieval and the coauthor's
https://math1um.github.io/Research/r32.pdf returned 404 on 2026-09-18. Obtain the
paper from the author before adding its abstract; its button stays hidden.
