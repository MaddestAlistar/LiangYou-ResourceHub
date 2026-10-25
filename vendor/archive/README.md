# Browser archive codecs

Self-hosted build of fflate 0.8.3 (MIT) and node-unrar-js 2.0.2 (MIT wrapper; UnRAR engine has its own included license). No remote CDN runtime dependency. The unmodified WASM is copied from the pinned npm package.

Sources: https://github.com/101arrowz/fflate and https://github.com/YuJianrong/node-unrar.js

Rebuild from repository root:

```
npm ci --prefix scripts/archive-codec --ignore-scripts
node scripts/archive-codec/build.mjs
```

Retain the included notices and UnRAR engine license with distributions. UnRAR code must not be used to recreate the RAR compression algorithm. This application only extracts user-selected archives in a short-lived Web Worker.
