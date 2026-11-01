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
  Rendering is block-based: a rule block whose forms are all absent
  from an app's map is skipped (that app simply does not have that
  block), a block missing only some forms is an error, and forms a
  template declares with `require:` in its header must be present
  in the map whenever the part is mapped at all.
- `maps.mjs` — TRANSITIONAL parts-maps for the two existing apps
  (cherry / zcode), with selectors lifted unchanged from the 2.1 rule
  sheets. The formal home is `adapters/<id>/parts-map.json` (plan 4.4);
  T1-3 moves them there and deletes this file.

Parts with no reusable rules yet (e.g. `chat.bubble.assistant`,
`ide.*`) exist in the catalogue but have no template file; adapters
whose map omits a part simply skip that template when rendering.
