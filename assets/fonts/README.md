# Fonts

The stylesheet asks for **Latin Modern Roman** first — GUST's redrawing of
Knuth's Computer Modern, which is what most mathematics is set in — and it asks
for it via `local()` before `url()`. So:

* If a TeX distribution has installed Latin Modern or CMU Serif as system
  fonts on the reader's machine (common among mathematicians, rare among
  everyone else), the browser uses those and downloads nothing.
* Otherwise it looks for the woff2 files listed below in this directory.
* Failing both, it falls back to Palatino / Iowan Old Style / Georgia. That is
  the `mathpazo` look, which is a perfectly respectable way to set a paper.

To serve Latin Modern yourself, drop these three files here:

    lmroman10-regular.woff2
    lmroman10-italic.woff2
    lmroman10-bold.woff2

Sources, both open licences, no account needed:

* **GUST e-foundry**, the upstream project — the Latin Modern family under the
  GUST Font License (a LaTeX Project Public License variant). Ships OpenType;
  convert with `fonttools`:

      pip install fonttools brotli
      fonttools ttLib.woff2 compress lmroman10-regular.otf

* **CTAN**, package `lm` — the same fonts as part of TeX Live. If you have
  TeX Live installed you already have them; `kpsewhich lmroman10-regular.otf`
  will find the file.

An alternative with a lower stroke contrast, which holds up better at small
sizes on a screen (and in the dark theme, where Computer Modern's hairlines
can get thin): **STIX Two Text**, SIL Open Font License, from the STIX
project. If you go that way, change the `font-family` names in the
`@font-face` blocks at the top of `assets/paper.css` and add STIX to the
`--serif` stack.

Nothing here is required for the site to work — it ships with no font files
and no CDN, so there are no third-party requests on any page.
