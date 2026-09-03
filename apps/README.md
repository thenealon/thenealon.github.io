# apps/

Drop a self-contained `.html` file in here and it shows up in **Demos / Slop**
automatically. Its name comes from the file's `<title>`, and GitHub takes its
screenshot during the next site build. Nothing else to do.

- One file per app. It can pull in its own CSS/JS, or be a single file.
- The `<title>` is the label shown under the card.
- Screenshots are recaptured when an app's HTML changes.
- To override an automatic screenshot, replace its matching file in
  `assets/demos/` and leave the HTML unchanged.
