# Site text fonts

The site ships Latin Modern Roman 2.005, based on Computer Modern, in regular,
italic, bold, and bold italic. Every face retains its full upstream character
set. Text, navigation, labels, and buttons use this one family at three sizes:
16, 19, and 28 CSS pixels with the default browser root size. The rem units
respect a reader's preferred text size.

The WOFF2 files are the normal web format; WOFF is the legacy alternative.
These are lossless format conversions of the upstream OpenType files, made
with fontTools. No glyph outlines, metrics, names, or character maps changed.

Source: https://ctan.org/pkg/lm
Upstream: https://www.gust.org.pl/projects/e-foundry/latin-modern/
Copyright 2003–2021 B. Jackowski and J. M. Nowacki, on behalf of TeX user groups.
License: GUST Font License; see GUST-FONT-LICENSE.txt in this directory.

Loading uses font-display: swap, a same-origin preload of the regular face,
and system-serif fallbacks. No font CDN, JavaScript font loader, or hidden-text
loading gate is involved. Content is ordinary HTML and remains readable if
fonts or scripts are unavailable. Print styles use the same text family and
remove the animated background and controls.

Regenerate a face with fontTools and Brotli installed:

```python
from fontTools.ttLib import TTFont
font = TTFont("lmroman10-regular.otf")
font.flavor = "woff2"  # use "woff" for the legacy alternative
font.save("lmroman10-regular.woff2")
```
