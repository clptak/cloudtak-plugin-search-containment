# CLOUDTAK PLUGIN: SEARCH CONTAINMENT

Plugin to behave similar to ATAK's Chokepoint. Leverages the snapping trail network
(`snapping.pmtiles`) in CloudTAK to identify containment points at travel corridors
to contain a search area.

<img width="1123" height="514" alt="search_containment_plugin_screenshot" src="https://github.com/user-attachments/assets/10e7d01e-d653-4d19-b91b-a266a75b0a6c" />

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

Open **Menu → Containment** <img width="40" height="40" alt="barrier-block" src="https://github.com/user-attachments/assets/2b98dd8d-a2a0-4fc1-a46e-73ec43d88dc8" /><?xml version="1.0" encoding="UTF-8" standalone="no"?><!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
<svg width="100%" height="100%" viewBox="0 0 24 24" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xml:space="preserve" xmlns:serif="http://www.serif.com/" style="fill-rule:evenodd;clip-rule:evenodd;stroke-linecap:round;stroke-linejoin:round;">
    <rect x="0" y="0" width="24" height="24" style="fill:none;fill-rule:nonzero;"/>
    <path d="M4,8C4,7.451 4.451,7 5,7L19,7C19.549,7 20,7.451 20,8L20,15C20,15.549 19.549,16 19,16L5,16C4.451,16 4,15.549 4,15L4,8" style="fill:none;fill-rule:nonzero;stroke:white;stroke-width:1px;"/>
    <path d="M7,16L7,20" style="fill:none;fill-rule:nonzero;stroke:white;stroke-width:1px;"/>
    <path d="M7.5,16L16.5,7" style="fill:none;fill-rule:nonzero;stroke:white;stroke-width:1px;"/>
    <path d="M13.5,16L20,9.5" style="fill:none;fill-rule:nonzero;stroke:white;stroke-width:1px;"/>
    <path d="M4,13.5L10.5,7" style="fill:none;fill-rule:nonzero;stroke:white;stroke-width:1px;"/>
    <path d="M17,16L17,20" style="fill:none;fill-rule:nonzero;stroke:white;stroke-width:1px;"/>
    <path d="M5,20L9,20" style="fill:none;fill-rule:nonzero;stroke:white;stroke-width:1px;"/>
    <path d="M15,20L19,20" style="fill:none;fill-rule:nonzero;stroke:white;stroke-width:1px;"/>
    <path d="M17,7L17,5" style="fill:none;fill-rule:nonzero;stroke:white;stroke-width:1px;"/>
    <path d="M7,7L7,5" style="fill:none;fill-rule:nonzero;stroke:white;stroke-width:1px;"/>
</svg>(barrier-block icon).  The panel walks through four
steps: pick a source, configure, preview, post.

### 1. Pick a source

The list shows the active mission's **polygons, circles, and lines** (markers are
intentionally excluded — use the Manual Point entry instead). The refresh button
re-fetches the mission's features from the TAK Server if something is missing.

  <img width="311" height="200" alt="containment_selector copy" src="https://github.com/user-attachments/assets/fc11b51e-8e68-443f-9abe-4bd2d4f26f2b" />

**Shapes (polygons / circles)** go straight to the configure step. The
containment ring is the shape's boundary offset *outward* by the distance you
enter (distance 0 uses the boundary as-is).

**Lines** pop up a choice of what the line means:

  <img width="299" height="213" alt="use_line_as" src="https://github.com/user-attachments/assets/65991bad-b03e-4163-b3fa-182dfacb4d3a" />

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

  <img width="312" height="168" alt="containment_selector" src="https://github.com/user-attachments/assets/f92dda42-686c-4e38-9225-8032e5b91d52" />

### 2. Configure

  <img width="452" height="280" alt="containment_configure" src="https://github.com/user-attachments/assets/a72a8d58-a1ed-4490-92fe-e9422da55599" />

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

  <img width="452" height="185" alt="containment_preview" src="https://github.com/user-attachments/assets/27ab9650-93a3-4056-8970-4fa90045ea98" />

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
