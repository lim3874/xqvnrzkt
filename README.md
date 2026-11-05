# Script Archive

Public static frontend for the script archive, version 1.19.2.

The page uses a public bootstrap snapshot, then checks the existing public read-only archive API every minute. Search, tag filters, sorting and pagination run locally. GIF previews load near the viewport. New visits start in dark mode.

No build step is required. GitHub Pages serves the root of `main`.

Version 1.19.2 normalizes invisible title characters and removes confirmed duplicates before pagination, including saved browser data and background refreshes. Conflicting publication links, lengths, dates and categories remain separate.
