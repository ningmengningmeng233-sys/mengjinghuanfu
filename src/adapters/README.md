# adapters/ (transitional, T1-2)

One directory per app, each holding a pure-data `adapter.json`
(schema `dreamskin-adapter/1`, see plan section 4.2). The loader is
`src/core/adapters.mjs`: it scans this directory, validates each file,
skips invalid adapters and collects their errors instead of crashing.

Transitional status: the `cherry/` and `zcode/` files in this directory
are data copies of the profiles that still live in `src/core/apps.mjs`.
**`apps.mjs` remains the runtime source of truth.** These files only
prove the loader, the validation rules and `--app <any registered id>`
at the loader/test level. The formal migration of Cherry/ZCode onto
adapters (and removal of the duplication) is ticket T1-3.

Only confirmed fields are written here. Anything not yet confirmed by
a Spike or by the 2.1 code (for example `partsMap` / `extraCss` files)
is intentionally left out; when a field like `partsMap` is declared,
the referenced file must exist in the same directory or the adapter
is rejected by the loader.
