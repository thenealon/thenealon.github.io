# Neal Bushaw’s website

Edit `index.html` directly. Its HTML and CSS are the homepage source: no build step, JavaScript, JSON, or package installation is needed. Commit changes to `main`; GitHub Pages publishes that branch.

## Common edits

Search for the uppercase comments in `index.html`:

- **PAPERS:** copy the example list entry. Add topic names to its `class` attribute, separated by spaces.
- **TOPIC CHOICES / TOPIC RULES:** adding a topic takes one radio label, one CSS rule, and a matching class on each relevant paper. The comments include examples.
- **RESEARCH TALKS / OUTREACH TALKS:** add a list entry in the appropriate section.
- **CURRENT COURSES:** change the semester heading and its course list. The overview links here, so current courses need updating in only one place.
- **EXTRAS:** add a link under the final “Demos / slop” disclosure. Demos are added manually.
- **COLORS:** update the light and dark palettes together; preserve readable contrast.

Keep headings, link descriptions, keyboard focus styles, image descriptions and captions, and native MathML. Give new video captions and audio a transcript. After editing, check the page on a narrow screen, at increased zoom, and with a keyboard.

The portrait and Latin Modern fonts remain in `assets/`. The homepage uses their public URLs so a downloaded copy can display them too. Font licensing is in `assets/fonts/`.

## Other pages and the previous site

Standalone demos remain in `apps/`; academic documents and existing course/seminar pages retain their URLs. The genealogy demo still uses shared files in `assets/`. Those scripts are not loaded by the homepage.

The complete site before this simplification is preserved on branch [archive/before-single-page-2026-10-08](https://github.com/thenealon/thenealon.github.io/tree/archive/before-single-page-2026-10-08). It is visible on GitHub, but is not part of the published website. The old generator, its data, its automatic build workflow, and unused template assets have been removed from `main`.

Do not run the archived generator against the current homepage. Older `more.html`, `gen.html`, and duplicate demo URLs redirect to their current destinations.
