# Artwork provenance

The selected deployment icons are transparent 1024 by 1024 PNGs. They combine channel artwork with a Danish or UK flag. The flags identify language preference; single-language media can still play its only available language.

- `cartoon-network-da-v2-white.png` and `cartoon-network-en-v2-white.png` were rendered by `make_cn_logos.py`. That generator uses Pillow and Arial Black at `C:/Windows/Fonts/ariblk.ttf`. The font itself is not included.
- `disney-channel-da-v3.png` and `disney-channel-en-v3.png` were rendered by `make_disney_logos.py`, which imports flag/layout helpers from the CN generator.
- `source/disney-channel-2019-logo.png` is the retained PNG identified in the original work as Wikimedia Commons `File:2019 Disney Channel logo.svg`. It is the source for selected v3 artwork.
- `source/disney-channel-2014-text-logo.png` is the retained PNG identified as Wikimedia Commons `File:2014 Disney Channel text logo.svg`. It is used by the optional v2 generator variants.

Regeneration requires Python and Pillow. Running a generator writes new PNG files beside it. It does not install anything. The CN generator's black base filenames end in `-v2.png`; rename deliberately to the icon installer's `-v2-black.png` convention if using them.

Cartoon Network and Disney names and marks belong to their respective owners. This personal-channel project is unaffiliated. These source names document provenance; they are not a licence determination or permission grant. The scripts' MIT licence excludes raster artwork and fonts. See [NOTICE.md](../NOTICE.md).
