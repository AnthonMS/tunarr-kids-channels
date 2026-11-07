# Minimal Disney inventory fixtures

These two JSON files preserve the tested 2026-11-07 Disney catalogue shape for the existing local schedule test:

- [disney-library-da.json](disney-library-da.json)
- [disney-library-en.json](disney-library-en.json)

Each contains 1116 selected episode records: 1039 main episodes, 17 Shorts and 60 dated Disney Sjov files. Retained fields are duration, episode/season order, title, show name and the source identities needed by the scheduler. Program, show and external IDs have been replaced with anonymous stable identifiers; the two languages deliberately use different program IDs for translation tests.

Artwork, summaries, paths, unrelated library items and service configuration are excluded. These are test inputs, not a live API backup or a file to upload to Tunarr. The builder rejects fixture mode combined with apply.

The test has a fixed start time and produces 5648 initial entries. The deployed creation used a different start time and produced 5655 entries; the Friday-gap padding accounts for the difference.

From the project root:

```powershell
node disney-schedule.test.mjs fixtures
```

See [the script index](../README.md) and [adaptation guide](../CONFIGURATION.md) for runtime copies and deployment paths.
