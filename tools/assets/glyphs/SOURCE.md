# Glyph source

The 二人 sculpture, the header mark, the favicon, and the first particle form all come from two glyph outlines.

| | |
| --- | --- |
| Characters | 二 (U+4E8C) and 人 (U+4EBA) |
| Typeface | Noto Sans JP |
| Weight | 900 (Black) |
| Obtained from | `@fontsource/noto-sans-jp` 5.3.1, WOFF subsets 111 and 117 |
| License | SIL Open Font License 1.1. See `OFL.txt`. |
| Copyright | Copyright 2014-2021 Adobe (http://www.adobe.com/), with Reserved Font Name 'Source' |

`futari-glyphs.json` holds the two outlines in em units with their exact curves. It is the only thing the build reads. No font file ships with the site, and the font package is a development dependency used only to regenerate the outlines:

```sh
node tools/assets/glyphs/extract.mjs 900
```

That command also rewrites `src/content/mark.ts` and `public/favicon.svg`.

The space between the two characters is 0.3 em. That is wider than the font's own spacing, because the visitor's path runs through it.
