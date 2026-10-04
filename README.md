# CLOUDTAK PLUGIN: SEARCH CONTAINMENT

Plugin to behave similar to ATAK's Chokepoint. Leverages the snapping trail network
(`snapping.pmtiles`) in CloudTAK to identify containment points at travel corridors
to contain a search area.

<img width="1123" height="514" alt="search_containment_plugin_screenshot" src="https://github.com/user-attachments/assets/10e7d01e-d653-4d19-b91b-a266a75b0a6c" />

Pick a source — a mission shape, a mission line, a DataSync marker, or a manually
entered point — and the plugin finds every place the trail network crosses the
resulting boundary, plots numbered markers, and posts them into the active
DataSync mission for the whole team, or onto your own map only.

From a point (a DataSync marker or a manual point) the boundary can be a fixed
distance or a **WiSAR Travel Time** contour: how far a subject could physically
travel in a given time, modelled over terrain, land cover and trails by the
shared WiSAR server.

## Requirements

- A hosted vector basemap with **snapping enabled** (Admin → Basemaps;
  e.g. `snapping.pmtiles` in MinIO). The plugin discovers it the same way the
  route-snapping draw tool does.
- An **active DataSync mission** to post for the team (Menu → Data Sync →
  subscribe → make active). Without one, everything up to the preview works,
  and **Post to Map** puts the result on your own map only.
- For **WiSAR Travel Time** (optional): a reachable WiSAR server. Search
  Containment uses the WiSAR Server set in Incident Manager's Settings on this
  browser, otherwise `https://wisar.clpdevtak.com`; the Configure step shows
  which. The WiSAR server must list this CloudTAK (`WISAR_CLOUDTAK_INSTANCES`),
  and this CloudTAK's Content-Security-Policy must allow the WiSAR address
  (`NGINX_CSP_CONNECT_SRC`) unless both share a parent domain.

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

The list shows the active mission's **polygons, circles, and lines**. Point
markers are offered separately in the **DataSync Marker** card, and a location
that isn't in the DataSync goes in the **Manual Point** card. The refresh button
re-fetches the mission's features from the TAK Server if something is missing.

With no active DataSync the list and the DataSync Marker card are hidden and a
note says so; the Manual Point still works.

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

**DataSync Marker** (active DataSync only) lists every point marker in the
mission, with ICP, LKP, IPP and PLS callsigns first and the rest alphabetically;
repeated callsigns show their coordinates. **Use This Marker** opens Configure
with WiSAR Travel Time selected (Distance is one click away).

**Manual Point** (collapsible card at the bottom of the picker, closed by
default) is for a location that isn't in the DataSync yet:

- type coordinates in the standard CloudTAK coordinate field (DD / DMS / MGRS), or
- press **Select on Map** and click the map (crosshair cursor), then
- name it (optional) and press **Use This Point**.

A manual point behaves like a marker: the ring is a range ring at the entered
distance (must be greater than 0), or a WiSAR Travel Time contour.

  <img width="312" height="168" alt="containment_selector" src="https://github.com/user-attachments/assets/f92dda42-686c-4e38-9225-8032e5b91d52" />

### 2. Configure

  <img width="452" height="280" alt="containment_configure" src="https://github.com/user-attachments/assets/a72a8d58-a1ed-4490-92fe-e9422da55599" />

- **Distance | WiSAR Travel Time** — the method. WiSAR needs a single starting
  point, so it is only available for a DataSync marker or a manual point; for
  shapes and lines it is greyed out with the reason.
- **Distance + Units** (miles or meters) — hidden for Location Check, which
  always uses the raw line, and for WiSAR.
- **Merge points within (m)** — crossings closer together than this (default
  50 m) merge into a single marker; prevents marker spam at switchbacks and
  tile seams.
- **Color** — applied to the ring and markers.
- **Trail Network** — only shown if more than one snapping basemap exists.
- **Label Prefix** — optional. Leave it blank for `Containment {n}` (or
  `Check Location {n}`) filed in a layer named `Containment`. A prefix such as
  `North` names markers `North 1`, `North 2`, … and files them in
  `North Containment`. The prefix is not saved between runs.

Settings other than the prefix persist per device between runs.

**WiSAR Travel Time** shows the starting point, the WiSAR server in use and a
connection check, then the same form as Incident Manager:

- **Flat-ground travel speed** in mph or km/h, or a preset (0.5 Impaired,
  1.0 Slow, 2.0 Moderate, 3.1 Fit hiker mph).
- **Time intervals** — 2, 4, 6, 8, 10 or 12 h, **up to 3** (2, 4 and 6 h by
  default). Each becomes one contour.
- **Run Travel Time Analysis** — queued and run on WiSAR (typically one to a
  few minutes), with Cancel. Every contour is then drawn on the map.
- **Contour for Containment** — pick one; it is drawn heavier. Generate uses
  the outer boundary of every part of that contour (holes ignored), simplified
  about 5 m.

Changing the source discards the run; switching to Distance hides its preview.

### 3. Preview

The proposed ring (dashed line) and numbered crossing points render on the map
without touching the mission. The panel lists each marker: the name centers the
map on that point, and the checkbox chooses whether it is posted. Every marker
starts checked. Unchecked markers stay on the preview, drawn lighter, and are
left off the mission. The label range is reported when all are selected (e.g.
"Containment 4 through Containment 9"). Go back to adjust, or:

  <img width="452" height="185" alt="containment_preview" src="https://github.com/user-attachments/assets/27ab9650-93a3-4056-8970-4fa90045ea98" />

### 4. Post

**Post to Mission** (needs an active DataSync): checked markers — and the
containment ring, when one was generated — are posted into the active DataSync
mission and sync to all subscribers. They are filed in the `Containment` layer,
or in `{prefix} Containment` when a label prefix was set. Marker names are
assigned at Generate and those exact names are posted. Markers generated with
no active DataSync are renumbered from its existing markers once one is active.

**Post to Map** (always available): the same items go onto your own map as
your features, in a `Containment` (or `{prefix} Containment`) folder. They are
saved to your CloudTAK profile and **not** sent to the TAK Server, so nobody
else sees them.

For WiSAR the ring is the contour outline, named like `ICP 2h Travel Time`
(with ` 1`, ` 2` when the contour has several parts).

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
| "No Active DataSync" note, Post to Mission disabled | Subscribe to the mission on the map and make it active, or use Post to Map |
| WiSAR Travel Time greyed out | The source is a shape or line; WiSAR starts from a single point (DataSync marker or manual point) |
| WiSAR "Can't reach WiSAR" | This CloudTAK's CSP doesn't allow the WiSAR address (`NGINX_CSP_CONNECT_SRC`), WiSAR's `WISAR_CORS_ORIGINS` / `WISAR_CLOUDTAK_INSTANCES` don't list this CloudTAK, or WiSAR is down |
| WiSAR "did not accept this CloudTAK session" | WiSAR checks tokens against a different CloudTAK: fix this origin's entry in `WISAR_CLOUDTAK_INSTANCES`, or sign in again |
| Features missing from the picker | Press the refresh button — it forces a server re-fetch of mission features |
| 401 fetching trails | Session token (log out/in); tile server reachable from browser |
| "Containment ring covers N tiles (max 3000)" | Reduce the distance, or pick a shorter WiSAR contour — tile fetches are capped at 3000 |
| No crossings found | Verify trails exist near the ring/line at the tileset's maxzoom; widen the distance or check the right trail network is selected |

## Development

Files: `index.ts` (lifecycle: route under `home-menu`, menu item),
`lib/ContainmentPanel.vue` (UI/workflow incl. line-choice modal and manual point),
`lib/geometry.ts` (pure ring/offset/intersection/cluster/sort math),
`lib/trails.ts` (snapping basemap discovery + tile feature fetch),
`lib/markers.ts` (CoT builders + label numbering).

WiSAR: `lib/wisar.ts` (API client, identical to Incident Manager's, with a
drift test against WiSAR's `docs/openapi.json`), `lib/wisarServer.ts` (server
from Incident Manager's setting), `lib/wisarSource.ts` (starting point),
`lib/wisarMarkers.ts` (DataSync marker list), `lib/wisarTravelTime.ts` (form
logic, copied from Incident Manager), `lib/wisarContours.ts` (interval limit,
contour list and rings), `lib/useWisarJob.ts` + `lib/WisarJobStatus.vue` (run
and status).

Unit tests (no package.json needed):

```bash
node --experimental-strip-types --test lib/*.test.ts
```

Typecheck & lint from the CloudTAK web root (covers `plugins/`):

```bash
cd ~/CloudTAK/api/web && npm run check && npm run lint
```

See `PLAN.md` for the source-cited architecture decisions.
