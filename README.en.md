# Dream Skin

A Windows theming tool for desktop AI apps: a launcher (`.exe`) plus an embedded
Node engine (the payload). It injects theme CSS into app pages through the local
debugging channel (CDP). It never modifies any of the target app's official
files, and everything can be reverted in one click. The launcher source lives in
`src/launcher/` (reconstructed by decompiling the 2.1.0 release exe - see the
README there); the engine entry point is `src/dreamskin.mjs`.

中文版： [README.md](README.md)

## Supported apps

App support is data-driven: each app is an "adapter" under `src/adapters/<id>/`,
so adding an app never requires core changes. See the
[support matrix](docs/support-matrix.md) for adapters and tested versions.
In short: Cherry Studio and ZCode have fully mapped part layers; Codex (MSIX),
DeepSeek Harness, MiniMax Code and MiniMax Design have adapters and launch
channels ready, with part maps pending real DOM anchors.

## Quick start (GUI)

1. Download or build `梦境换肤-*-Windows.exe` and open the console.
2. Pick the target app and a skin, then click Apply.
3. Use Restore to go back to the app's original look at any time.
4. Your skins are shared across apps in `%LOCALAPPDATA%\DreamSkin\skins`;
   per-app runtime data lives in `%LOCALAPPDATA%\DreamSkin\<app id>`.

The zip distribution bundles a Node runtime (`runtime/node.exe`), so no
separate Node installation is needed.

## Command line

```powershell
node src/dreamskin.mjs apply    --app cherry     # apply the selected skin
node src/dreamskin.mjs check    --app cherry     # health: parts, contrast, conflicts
node src/dreamskin.mjs restore  --app cherry     # remove injected styles
node src/dreamskin.mjs status   --app cherry     # runtime status
node src/dreamskin.mjs apps-status               # five-state overview of all apps
node src/dreamskin.mjs sync --app cherry --to zcode
```

Exit codes: 0 success / 1 failed (nothing changed) / 2 outcome uncertain /
3 app restart required.

When an app update changes its DOM, the health check degrades gracefully:
if more than 30% of required parts are missing, only the variable layer and
wallpaper are kept ("compat mode", recorded in `compat.json` in the app's
data directory). If another skinning tool has styles on the same page,
`check` reports a conflict and `apply` refuses to proceed.

The DSH plugin channel is off by default: it installs only after you enable
it in the console and explicitly consent (`plugin-install --consent` on the
CLI), and uninstalls exactly what it installed.

## Safety

- CSS plus minimal decorative nodes only; conversation content is never read;
  cookies / localStorage are never touched; injected scripts make no network
  requests.
- Target app install directories, packages (asar), signatures and configs are
  never modified; theming works by launching the app with a debug port and
  talking to it over loopback CDP.
- Restore removes the injected `<style>` elements and normal launching.

## Windows SmartScreen

An unsigned exe may trigger "Windows protected your PC" (Microsoft Defender
SmartScreen) on first run. That only means the binary has no code-signing
certificate. If you trust the source, choose "More info" -> "Run anyway".
Publishers can sign with `tools/sign-release.ps1` (Authenticode + RFC 3161
timestamp, verified immediately after signing).

## Building from source

```powershell
powershell -ExecutionPolicy Bypass -File tools/fetch-node-runtime.ps1
node tools/build-payload.mjs
powershell -ExecutionPolicy Bypass -File tools/build-launcher.ps1
node tools/check-version.mjs
node --test "tests/*.test.mjs"
```

Developer docs: [support matrix](docs/support-matrix.md),
[how to add an adapter](docs/adapter-guide.md),
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

The single source of truth for the version number is `src/core/version.mjs`.
