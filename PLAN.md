# Search Containment Plugin — Build Plan

CloudTAK web plugin replicating ATAK Chokepoint: generate "Containment {n}" markers where
travel corridors (trails) cross a containment ring, and post them to the active DataSync mission.

## Locked decisions (confirmed with Paul, 2026-07-16)

| Decision | Choice |
|---|---|
| Trails source | `snapping.pmtiles`, hosted PMTiles in MinIO, already registered as CloudTAK's snapping basemap |
| Corridor filter | ALL LineString features in the tileset (matches route-snapping behavior) |
| Source object selection | List picker in plugin panel: active mission's polygons / circles / markers |
| Ring geometry | Marker → range ring at entered distance. Polygon/circle → boundary buffered **outward** by entered distance |
| Distance units | Miles or meters, user-selectable |
| Intersection dedupe | Cluster crossings closer than min-spacing (default 50 m, adjustable) into one point |
| Markers | `u-d-p` spot markers, `Containment {n}`, color pickable (default red) |
| Numbering | Scan mission for existing `Containment N`, continue from max+1 |
| Ring posting | Ring **and** markers both posted to the active mission |
| Server changes | **None** — pure web plugin, no API rebuild |

## CloudTAK facts (verified in source)

- Plugin surface: `api/web/plugin.ts` — `PluginStatic.install(app, api)` → `PluginInstance{enable,disable}`;
  `api.menu.add`, `api.routes.add`, `api.map` (maplibre), `api.pinia`. Loaded via
  `import.meta.glob(['../plugins/*.ts','../plugins/*/index.ts'])` in `api/web/src/main.ts`;
  built by Vite from `api/web` (`npm run build`), plugin repo symlinked into `api/web/plugins/search-containment`.
- Active mission: `useMapStore(pinia).mission` (a `Subscription`) — `src/stores/map.ts:129,446`.
- Mission features (read): `subscription-feature.ts` `list()` over `db.subscription_feature` keyed by mission guid.
- Posting to mission (write): `mapStore.worker.db.add(feat, { authored: true })` auto-adds new
  authored CoTs to the active mission — `src/workers/atlas-database.ts:637-700`. No manual dest handling needed.
- Snapping basemap discovery: `GET /api/basemap?snapping=true&overlay=true` (exact pattern:
  `draw.ts populateSnappingLayers()`, `src/stores/modules/draw.ts:473`). Returns `url` tile template + min/max zoom.
- Trail features as GeoJSON (no MVT decoding!): the pmtiles tile server exposes
  `GET .../tiles/{z}/{x}/{y}/features?type=LineString&multi=false&token=…`
  (`tasks/pmtiles/routes/public.ts:127`; consumed exactly this way by `draw.ts updateGraph():548-558`).
  Also `GET .../{name}/features?bbox=…` (`public.ts:160`) for whole-bbox queries.
- Tile enumeration: `@mapbox/tile-cover` already an `api/web` dep (`draw.ts:4`) — cover the **ring line only**
  (not the interior) at the tileset's maxzoom, so cost scales with ring length, not area.
- Auth token for tile server: Capacitor `Preferences.get({ key: 'token' })` (`draw.ts:552`).
  CORS proven safe — core client already fetches these URLs directly.
- Ring/marker precedent: `src/components/CloudTAK/Inputs/RangeRingsInput.vue` (u-d-p CoT shape, `worker.db.add`).
- Turf in `api/web`: destination, distance, buffer, bbox, boolean-point-in-polygon, etc.
  No `@turf/line-intersect` → implement small segment-intersection helper in-plugin (no core dep changes).
- Settings persistence: namespaced `db.kv` key `containment:settings` via `src/base/kv.ts` (per device).

## Architecture

Pure client plugin. Outputs are CoTs persisted by the TAK server via the mission — no plugin database.

```
plugin repo (symlinked to ~/CloudTAK/api/web/plugins/search-containment)
├── index.ts                 # PluginStatic: install/enable/disable, menu item + route
├── components/
│   └── ContainmentPanel.vue # mission-feature picker, distance/unit/spacing/color inputs,
│                            # preview + confirm, results list
└── lib/
    ├── trails.ts            # snapping basemap discovery + tile-cover fetch of ring-line tiles
    ├── geometry.ts          # ring construction, segment intersection, clustering (pure functions)
    └── markers.ts           # CoT builders, Containment-N numbering scan
```

## Flow

1. Menu item "Containment" → panel route. If `mapStore.mission` is undefined → prompt to activate a DataSync.
2. List active mission features filtered to Points, Polygons, and circle shapes; pick one.
3. Inputs: distance + unit (mi/m), min spacing (default 50 m), marker color. Last values restored from `db.kv`.
4. Build ring: point → geodesic circle (64-pt destination sweep); shape → `@turf/buffer` outward, take outer boundary.
5. `tile-cover` the ring line at tileset maxzoom → fetch each tile's `/features?type=LineString&multi=false`.
6. Intersect every trail segment with ring segments → intersection points → drop exact dupes (tile seams)
   → cluster within min-spacing → cluster centers become containment points.
7. Numbering: regex-scan mission feature callsigns for `Containment (\d+)`, start at max+1.
8. Preview ring + numbered points on a temp GeoJSON source with a count; on confirm,
   `worker.db.add(…, { authored: true })` for ring CoT + each marker CoT → auto-posted to active mission.
9. `disable()`: remove menu item only — never the route (dispatcher lesson).

## Risks / mitigations

- **Huge rings** → tile count scales with ring circumference only (line cover, not bbox). Cap tile count (~400) with a clear error suggesting a smaller distance.
- **Simplified geometry at maxzoom** — intersections computed on tileset maxzoom geometry; accuracy bounded by the tileset itself (same data snapping uses, so consistent with drawn routes).
- **Numbering races** (two operators running simultaneously) — accepted; numbering scan happens at generate time.
- **Turf spherical approximation** — negligible at SAR distances.

## Build phases

1. **Spike**: from a scratch page/console, discover snapping basemap + fetch one tile's `/features`; verify URL shape & token against Paul's deployment. *Go/no-go gate.*
2. `lib/geometry.ts` + `lib/markers.ts` as pure functions with unit tests.
3. Panel UI: picker, inputs, preview layer.
4. Mission posting + numbering, settings persistence.
5. Polish: enable/disable lifecycle, error states, empty-result handling.

Deploy: symlink into `~/CloudTAK/api/web/plugins/search-containment`, `cd ~/CloudTAK/api/web && npm run build`.
