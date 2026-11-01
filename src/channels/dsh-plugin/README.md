# dsh-plugin-dreamskin (plugin package template)

The installable client plugin for the DreamSkin `dsh-plugin` channel
(plan 4.3). `src/channels/dsh-plugin.mjs` materializes this template at
install time (the `{{version}}` placeholder in `package.json` is replaced
with the DreamSkin version) and copies it into the DSH profile plugin
location the user approved. Installing requires the user's explicit
consent (plan 4.3 / 4.8 - the plugin channel is the single sanctioned
exception to the "never touch a target app" rule).

What the plugin does, and nothing else:

- Reads the local skin file `%LOCALAPPDATA%\DreamSkin\dsh\active-skin.css`
  (the same layered skin file the CDP routes use).
- Injects it into the DSH Web UI as three `<style>` elements
  (`dream-skin-2-dsh`, `-vars`, `-extra`) through the official
  `shell.overlay` UI slot (frame-level, session-independent - the same
  route the community skin plugin verified in spike S-2 uses).
- Removes all three styles when the skin file is deleted or emptied
  (DreamSkin `restore`, or the channel master switch being turned off).

Hard limits (plan 4.8), enforced by unit tests over the shipped files:
no network requests, no reading of page/session content, no cookies or
web storage access. The plugin only ever touches its own three style
elements and the one local CSS file.

Pending real-machine verification (needs the owner's consent, tracked in
the T2-4 evidence): the exact slot registration signature on the host,
the profile plugin directory layout and registration mechanism, and the
end-to-end browser-mode flow (V-CH-dsh-plugin). When the expected host
interface is missing, the plugin stays inert instead of breaking the
host.
