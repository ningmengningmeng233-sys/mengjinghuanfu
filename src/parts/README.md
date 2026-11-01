# parts/ (semantic parts layer, plan 4.4)

- `parts.json` — the cross-app part catalogue (schema `dreamskin-parts/1`).
  Themes never name app selectors; they style *parts*.
- `templates/*.css` — part styles written once, using `{{selector}}` and
  `{{selector:<form>}}` placeholders. Each file starts with a
  `/* part: <part id> */` header saying which part it belongs to. A part
  may expose several selector *forms* (e.g. `scope`, `pane`, `card`)
  when one part needs different selector shapes in different rules.
- `parts.mjs` — loader + validation + renderer (`loadParts`,
  `validateParts`, `loadTemplates`, `validateTemplates`,
  `validatePartsMap`, `renderPartsCss`). Pure data work only.
  A placeholder may be followed by a pseudo-class/element suffix
  (e.g. `{{selector}}:focus-within`); the suffix is distributed to
  every selector in the map's comma-separated list for that form.
  Rendering is block-based: a rule block whose forms are all absent
  from an app's map is skipped (that app simply does not have that
  block), a block missing only some forms is an error, and forms a
  template declares with `require:` in its header must be present
  in the map whenever the part is mapped at all.
- Per-app parts-maps live in `adapters/<id>/parts-map.json` (plan 4.4).
  They used to sit here as a transitional `maps.mjs`; T1-3 moved them
  into the adapter directories and deleted that file.

Parts with no reusable rules yet (e.g. `chat.bubble.assistant`,
`ide.*`) exist in the catalogue but have no template file; adapters
whose map omits a part simply skip that template when rendering.
