# adapters/ (one directory per app, plan 4.2)

Each app is a directory `adapters/<id>/` of pure data:

- `adapter.json` — the app's facts (schema `dreamskin-adapter/1`):
  discovery (exe names, install candidates with `%ENV%` placeholders,
  env override, uninstall display name, macOS bundle), process traits,
  main-window target description, ready selector, probes, restart note,
  tested versions.
- `parts-map.json` — semantic part -> this app's selectors (plan 4.4),
  rendered through `parts/templates/*.css` into the parts layer.
- `extra.css` — app-specific rules no semantic part can express (the
  extra layer). The literal `{{version}}` placeholder in comments is
  replaced with the current DreamSkin version when the profile is built.

**`adapter.json` is the single source of app facts.** The loader is
`src/core/adapters.mjs` (validates, skips invalid adapters and collects
their errors instead of crashing). At runtime,
`src/core/app-runtime.mjs` assembles each adapter into the profile the
entry point and the launch channels consume: candidates expanded,
parts-map rendered, `target` turned into the `isMainTarget(item, port)`
matcher, `process.helperCmdPattern` into `isHelperCmd(cmd)`, and the
style ids derived as `dream-skin-2-<id>` / `dream-skin-2-<id>-live`.
Only write fields confirmed by the 2.1 code or by a Spike report; when a
field like `partsMap` is declared, the referenced file must exist in the
same directory or the adapter is rejected by the loader.

## Pending real-machine verification (A series)

- `codex` (A-1): package facts verified read-only by S-1 (package family,
  manifest entry executable, package version). DOM anchors are NOT
  verified yet, so `parts-map.json` is intentionally empty and only the
  variables layer (colors + wallpaper) can take effect until Q-1 captures
  a sanitized DOM snapshot. `target` follows the plan 4.2 example and is
  unconfirmed; the main-window URL form is still unknown. Codex-Dream-
  Skin's exact style id is also unconfirmed - page-level conflict
  detection (`src/core/conflicts.mjs`) matches its public brand prefix
  for now and must be corrected with the measured id at V-A10.
