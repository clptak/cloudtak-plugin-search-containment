# CLOUDTAK PLUGIN: SEARCH CONTAINMENT

Plugin to behave similar to ATAK's Chokepoint. Leverages the snapping trail network
(`snapping.pmtiles`) in CloudTAK to identify containment points at travel corridors
to contain a search area.

Select a shape or marker from the active DataSync mission, enter a distance
(miles or meters), and the plugin generates a containment ring, finds every point
where the trail network crosses it, and posts `Containment 1..n` markers plus the
ring itself back into the active mission for the whole team.

## How it works

- **Ring** — a marker gets a range ring at the entered distance; a polygon or circle
  gets its boundary buffered *outward* by the distance.
- **Trails** — fetched from the server's snapping-enabled hosted PMTiles basemap
  (the same network the route-snapping draw tool uses), tile-by-tile along the ring
  line only, as plain GeoJSON (`.../tiles/{z}/{x}/{y}/features`).
- **Containment points** — ring × trail segment intersections, clustered so points
  closer than the configurable merge spacing (default 50 m) become one marker,
  numbered clockwise. Numbering continues from the highest existing `Containment N`
  in the mission, so repeat runs never collide.
- **Posting** — features are added with `authored: true`, which CloudTAK routes into
  the active DataSync mission automatically.

## Install

```bash
ln -s ~/dev/cloudtak-plugin-search-containment ~/CloudTAK/api/web/plugins/search-containment
cd ~/CloudTAK/api/web && npm run build
```

Plugins are bundled by Vite from `api/web` — there is no build step inside this repo.

## Requirements

- A hosted vector basemap with **snapping enabled** (Admin → Basemaps;
  e.g. `snapping.pmtiles` in MinIO). The plugin discovers it the same way the
  draw tool does (`GET /api/basemap?snapping=true&overlay=true`).
- An **active DataSync mission**: Menu → Data Sync → subscribe → make active.
  Without it the panel will prompt you.

## Usage

1. Menu → **Containment**.
2. Pick the source shape/marker from the active mission.
3. Enter distance + units, merge spacing, color → **Generate**.
4. Review the preview on the map (dashed ring + numbered points) → **Post to Mission**.

Settings persist per device. Generated `Containment N` markers are excluded from
the source picker.

## Troubleshooting

| Symptom | Check |
|---------|-------|
| "No snapping tileset" | Admin: basemap has `snapping_enabled` + `snapping_layer`, vector, S3/MinIO hosted |
| "Active DataSync" prompt | Subscribe to the mission on the map and make it active |
| 401 fetching trails | Session token (log out/in); tile server reachable from browser |
| Ring covers too many tiles error | Reduce distance — tile fetches are capped at 400 |
| No crossings found | Verify trails exist near the ring at the tileset's maxzoom; try a different distance |

## Development

Files: `index.ts` (lifecycle: route under `home-menu`, menu item), `lib/ContainmentPanel.vue`
(UI/workflow), `lib/geometry.ts` (pure ring/intersection/cluster math), `lib/trails.ts`
(snapping basemap discovery + tile feature fetch), `lib/markers.ts` (CoT builders).

Typecheck & lint from the CloudTAK web root (covers `plugins/`):

```bash
cd ~/CloudTAK/api/web && npm run check && npm run lint
```

See `PLAN.md` for the source-cited architecture decisions.
