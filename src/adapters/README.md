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
- `minimax-design` (A-3): install shape verified read-only by S-3
  (Electron, Velopack layout; the uninstall registry InstallLocation
  points at the install root and the launcher exe sits in that root -
  the exe channel's registry fallback resolves it, the static candidate
  covers the per-user default location). DOM anchors and the main
  window URL are unverified, so `parts-map.json` is empty and no
  target / readySelector is declared yet.
- `dsh` (A-2): shell facts verified read-only by S-2 plus a registry /
  directory recheck in this work order (DSH Desktop 2.0.18, community
  Electron shell; exe name measured; the uninstall entry's
  InstallLocation is EMPTY, so - like minimax-code - static discovery
  relies on the running process, the per-user default candidate, or the
  DREAMSKIN_DSH_EXE override; a read-only `status --app dsh` against the
  running shell resolves the exe). The Web UI has no verified DOM
  anchors, so `parts-map.json` is empty and no target / readySelector is
  declared. `shells` declares the three host forms from S-2 (desktop ->
  exe, tauri -> webview2, browser mode -> dsh-plugin); the tauri shell
  declares no exeNames (never measured), so `selectShell` can only pick
  it once real binaries are known. Still pending: the desktop shell's
  main-window URL form (its UI is served by a local service, so the
  file://-only main-target matcher may need a loopback extension), the
  helper-process pattern (plugin child processes were not inspected),
  and the with-debug-port restart check - all need a real-machine
  session with the owner's consent.
- `minimax-code` (A-4): install shape verified read-only by S-4
  (Electron, electron-builder per-user install; the exe name comes from
  the Start Menu shortcut target). Note the measured limits of static
  discovery on this machine: it is installed in a custom directory and
  its uninstall entry has an EMPTY InstallLocation, so neither the
  static candidate nor the registry fallback can find it while it is
  not running - discovery then relies on the running process or the
  DREAMSKIN_MINIMAX_CODE_EXE override. DOM anchors and the main window
  URL are unverified; `parts-map.json` is empty.
