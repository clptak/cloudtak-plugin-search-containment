# DataSync Mission Folders (CloudTAK Plugins)

How to create a folder in an active DataSync mission and file CoTs into it from a CloudTAK web plugin.

Reference implementation: [`lib/folder.ts`](../lib/folder.ts) and `confirm()` in [`lib/ContainmentPanel.vue`](../lib/ContainmentPanel.vue).

## Concepts

| Term | Meaning |
|------|---------|
| **Mission folder** | A **UID** mission layer (`Subscription.layer`) — what Mission → Layers shows as a folder |
| **Feature `path`** | Profile / My Features path (often `'/'`) — **not** the mission folder |
| **Dest `path`** | On CoT `properties.dest[]`, `path` is the **mission layer UID** (atomic filing on ingest) |
| **attachFeatures** | Move mission CoT UIDs under a layer after they already exist in the mission |

Use `type: 'UID'` for folders that hold map CoTs. TAK only returns filed UIDs for UID layers, not `GROUP`.

## Why attach-only often 500s

`worker.db.add(feat, { authored: true })` publishes over the websocket, then
`SubscriptionFeature.update` sets dest to `{ 'mission-guid' }` **only** — no folder.

If you immediately call `layer.attachFeatures`, TAK often returns **500 Internal Server Error** because the CoT is not in mission contents yet. The folder is created, markers sit at mission root.

**Prefer dest `path` at send time.** Use `attachFeatures` only as a delayed backup.

## Prerequisites

- Active DataSync: `useMapStore().mission` is a `Subscription`
- `MISSION_WRITE` (create/attach fail without it)
- For attach backup: UIDs must already be in the mission

## Client API

```ts
import type Subscription from '../../../src/base/subscription.ts';
import type { MissionLayer } from '../../../src/types.ts';

const sub = useMapStore().mission; // Subscription | undefined
```

| Method | Purpose |
|--------|---------|
| `sub.layer.list({ refresh?: boolean })` | List root layers |
| `sub.layer.create({ name, type: 'UID', uid?, parentUid? })` | Create folder |
| `sub.layer.attachFeatures(layerUid, uids)` | File existing mission CoTs (racy if called too soon) |
| `mapStore.worker.conn.sendCOT(feat)` | Publish GeoJSON CoT (preserves `dest.path`) |

## Pattern: ensure folder by name

```ts
const FOLDER_NAME = 'MyPlugin';

async function ensureMissionFolder(sub: Subscription, name = FOLDER_NAME): Promise<MissionLayer> {
    let layers = await sub.layer.list({ refresh: true });
    const existing = layers.find((l) => l.name === name);
    if (existing) return existing;

    await sub.layer.create({ name, type: 'UID' });
    layers = await sub.layer.list(); // create() already refreshed Dexie
    const created = layers.find((l) => l.name === name);
    if (!created) throw new Error(`Failed to create "${name}" mission folder`);
    return created;
}
```

Soft-ensure on panel open (do not block UI if write fails):

```ts
watch(() => mapStore.mission, async (m) => {
    if (!m) return;
    try { await ensureMissionFolder(m); }
    catch (err) { console.warn('Failed to ensure mission folder', err); }
}, { immediate: true });
```

## Pattern: post into folder (recommended)

1. Ensure folder → get `folder.uid`
2. `sendCOT` with `dest: [{ 'mission-guid', path: folder.uid, after: '' }]`
3. Local mission store **without** a second network publish that strips `path`:
   `db.add({ ...feat, origin: { mode: 'Mission', mode_id: guid } }, { authored: false })`
4. Optional backup: delay, then `attachFeatures` one UID at a time with retries

```ts
async function publishToFolder(feat: Feature, sub: Subscription, folderUid: string): Promise<void> {
    const wire = JSON.parse(JSON.stringify(feat));
    wire.properties.dest = [{
        'mission-guid': sub.guid,
        path: folderUid,  // layer UID
        after: ''
    }];
    mapStore.worker.conn.sendCOT(wire);

    // Local only — authored:true would re-send dest without path
    await mapStore.worker.db.add({
        ...feat,
        origin: { mode: 'Mission', mode_id: sub.guid }
    }, { authored: false });
}
```

Do **not** leave Feature GeoJSON `path: '/'` alone as the folder mechanism — that is the profile path field.

## Pattern: attach backup (after ingest)

```ts
async function attachWithRetry(sub: Subscription, folderUid: string, uids: string[]): Promise<void> {
    await new Promise((r) => setTimeout(r, 800)); // let TAK ingest websocket CoTs

    for (const uid of uids) {
        let ok = false;
        for (let i = 0; i < 6 && !ok; i++) {
            try {
                await sub.layer.attachFeatures(folderUid, [uid]);
                ok = true;
            } catch {
                await new Promise((r) => setTimeout(r, 300 * (i + 1)));
            }
        }
        if (!ok) console.warn('attach failed', uid);
    }
}
```

Avoid `feature.list({ refresh: true })` in the wait loop right after local `db.add` — refresh replaces Dexie from the server and can briefly wipe features that are not ingested yet.

## Checklist for another plugin

1. Stable folder name (e.g. `"Containment"`).
2. Ensure UID layer before publish.
3. Publish with `dest.path = folder.uid` via `conn.sendCOT`.
4. Local store with `origin: { mode: 'Mission', mode_id }` and `authored: false`.
5. Optional: delayed per-UID `attachFeatures` backup.
6. Soft-ensure on mission active is fine; hard-fail only on user Post if create fails.

## Related CloudTAK sources

- `api/web/src/base/subscription-layer.ts` — list/create/attachFeatures
- `api/stateless/routes/connection-layer-cot.ts` — `cot.addDest({ mission, path: layerUid })`
- `api/stateful/lib/connection-web.ts` — `CoTParser.from_geojson` preserves dest
- Mission UI: Mission → Layers (drag feature onto folder = attachFeatures)
