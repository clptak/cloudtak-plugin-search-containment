# CLOUDTAK PLUGIN: SEARCH CONTAINMENT

Plugin to behave similar to ATAK's Chokepoint. Leverages the snapping trail network
(`snapping.pmtiles`) in CloudTAK to identify containment points at travel corridors
to contain a search area.

Pick a source — a mission shape, a mission line, or a manually entered point — and
the plugin finds every place the trail network crosses the resulting boundary,
plots numbered markers, and posts them into the active DataSync mission for the
whole team.

## Requirements

- A hosted vector basemap with **snapping enabled** (Admin → Basemaps;
  e.g. `snapping.pmtiles` in MinIO). The plugin discovers it the same way the
  route-snapping draw tool does.
- An **active DataSync mission**: Menu → Data Sync → subscribe → make active.
  The panel prompts you if there isn't one.

## Usage

Open **Menu → Containment** (barrier-block icon). The panel walks through four
steps: pick a source, configure, preview, post.

### 1. Pick a source

The list shows the active mission's **polygons, circles, and lines** (markers are
intentionally excluded — use the Manual Point entry instead). The refresh button
re-fetches the mission's features from the TAK Server if something is missing.

<!-- screenshot: source picker -->

**Shapes (polygons / circles)** go straight to the configure step. The
containment ring is the shape's boundary offset *outward* by the distance you
enter (distance 0 uses the boundary as-is).

**Lines** pop up a choice of what the line means:

<!-- screenshot: line choice modal -->

| Choice | What happens | Marker labels |
|--------|--------------|---------------|
| **Containment** | The line is treated as a containment boundary. Distance offsets a corridor outward from the line (0 = the line itself). Trail crossings are marked and the offset ring is posted alongside them (nothing is reposted when distance is 0). | `Containment {n}` |
| **Location Check** | The raw line is intersected with the trail network directly — no distance, no transform. Use this to check a planned route or travel path against trail crossings. Only markers are posted. | `Check Location {n}` |

Location Check markers are numbered **in order along the line** from its start;
Containment markers on a ring are numbered clockwise from north. The two label
sequences are independent — each continues from the highest existing number in
the mission, so repeat runs never collide.

**Manual Point** (collapsible card at the bottom of the picker, closed by
default) is for a location that isn't in the DataSync yet:

- type coordinates in the standard CloudTAK coordinate field (DD / DMS / MGRS), or
- press **Select on Map** and click the map (crosshair cursor), then
- name it (optional) and press **Use This Point**.

A manual point behaves like a marker: the ring is a range ring at the entered
distance (must be greater than 0).

<!-- screenshot: manual point entry -->

### 2. Configure

- **Distance + Units** (miles or meters) — hidden for Location Check, which
  always uses the raw line.
- **Merge points within (m)** — crossings closer together than this (default
  50 m) merge into a single marker; prevents marker spam at switchbacks and
  tile seams.
- **Color** — applied to the ring and markers.
- **Trail Network** — only shown if more than one snapping basemap exists.

Settings persist per device between runs.

### 3. Preview

The proposed ring (dashed line) and numbered crossing points render on the map
without touching the mission, and the panel reports the label range (e.g.
"Containment 4 through Containment 9"). Go back to adjust, or:

<!-- screenshot: preview -->

### 4. Post to Mission

Markers — and the containment ring, when one was generated — are posted into the
active DataSync mission and sync to all subscribers. Marker numbering is
re-checked at post time in case the mission changed while previewing.

## Install

```bash
ln -s ~/dev/cloudtak-plugin-search-containment ~/CloudTAK/api/web/plugins/search-containment
cd ~/CloudTAK/api/web && npm run build
```

Plugins are bundled by Vite from `api/web` — there is no build step inside this
repo. Hard-refresh CloudTAK after building.

## Troubleshooting

| Symptom | Check |
|---------|-------|
| "No snapping tileset" | Admin: basemap has `snapping_enabled` + `snapping_layer`, vector, S3/MinIO hosted |
| "Active DataSync" prompt | Subscribe to the mission on the map and make it active |
| Features missing from the picker | Press the refresh button — it forces a server re-fetch of mission features |
| 401 fetching trails | Session token (log out/in); tile server reachable from browser |
| "Ring covers too many tiles" error | Reduce the distance — tile fetches are capped at 400 |
| No crossings found | Verify trails exist near the ring/line at the tileset's maxzoom; widen the distance or check the right trail network is selected |

## Development

Files: `index.ts` (lifecycle: route under `home-menu`, menu item),
`lib/ContainmentPanel.vue` (UI/workflow incl. line-choice modal and manual point),
`lib/geometry.ts` (pure ring/offset/intersection/cluster/sort math),
`lib/trails.ts` (snapping basemap discovery + tile feature fetch),
`lib/markers.ts` (CoT builders + label numbering).

Typecheck & lint from the CloudTAK web root (covers `plugins/`):

```bash
cd ~/CloudTAK/api/web && npm run check && npm run lint
```

See `PLAN.md` for the source-cited architecture decisions.
