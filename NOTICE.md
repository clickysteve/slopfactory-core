# Notices

**Licence.** Slop Factory Core is MIT licensed (`LICENSE`). It was extracted from ANVIL
(<https://github.com/clickysteve/anvil>, MIT, same author), where it was first developed.

**The Good Bits.** DSP code from The Good Bits (<https://github.com/clickysteve/the-good-bits>,
MIT, same author) is vendored unchanged in `src/dsp/vendor/goodbits/`, with its own licence
file and `vendor.json` (upstream commit and per-file SHA-256). The one addition is an export
line appended to `js/outputstage.js`; the upstream bytes are unchanged. See
`docs/GOOD-BITS-DSP.md`.

**Naming.** Good Bits' generic processing names are kept on purpose. Core describes what the
processing does and does not present any mode as an emulation of a particular product.

**Not used.** Good Bits' runtime CDN dependencies (essentia.js, AGPL-3.0; JSZip) are not part
of Core. Core has no runtime dependencies. Development-only dependencies are listed in
`package.json` (`fake-indexeddb`, Apache-2.0, for IndexedDB unit tests).
