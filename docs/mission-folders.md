# DataSync Mission Folders (CloudTAK Plugins)

How to create a folder in an active DataSync mission and file CoTs into it from a CloudTAK web plugin.

Reference implementation: [`lib/folder.ts`](../lib/folder.ts) and `confirm()` in [`lib/ContainmentPanel.vue`](../lib/ContainmentPanel.vue).

## Concepts

| Term | Meaning |
|------|---------|
| **Mission folder** | A **UID** mission layer (`Subscription.layer`) — what Mission → Layers shows as a folder |
| **Feature `path`** | Profile / My Features path (often `'/'`) — **not** the mission folder |
| **Filing** | Moving mission CoT UIDs under a layer via `attachFeatures` |

Use `type: 'UID'` for folders that hold map CoTs. TAK only returns filed UIDs for UID layers, not `GROUP`.

Folders are created at the mission **root** unless you pass `parentUid`.

## Prerequisites

- User has an active DataSync: `useMapStore().mission` is a `Subscription`
- User has `MISSION_WRITE` (or create/attach will fail)
- Features must already be **in the mission** before you can file them into a folder

## Client API

Host paths (from a plugin under `api/web/plugins/<name>/`):

```ts
import type Subscription from '../../../src/base/subscription.ts';
import type { MissionLayer } from '../../../src/types.ts';

const sub = useMapStore().mission; // Subscription | undefined
```

| Method | Purpose |
|--------|---------|
| `sub.layer.list({ refresh?: boolean })` | List root layers (Dexie; refresh hits TAK) |
| `sub.layer.create({ name, type: 'UID', uid?, parentUid? })` | Create folder |
| `sub.layer.attachFeatures(layerUid, uids: string[])` | File existing mission CoTs into the folder |
| `sub.layer.detachFeature(layerUid, cotUid)` | Move a CoT back to mission root |

Underlying routes (CloudTAK → Marti):

- `GET/POST /api/marti/missions/:name/layer`
- `PUT /api/marti/missions/:name/layer/:uid/cot` body `{ uids: string[] }`

## Pattern: ensure folder by name

```ts
import type Subscription from '../../../src/base/subscription.ts';
import type { MissionLayer } from '../../../src/types.ts';

const FOLDER_NAME = 'MyPlugin'; // change per plugin

function findLayerByName(
    layers: MissionLayer[],
    name: string
): MissionLayer | undefined {
    return layers.find((l) => l.name === name);
}

/**
 * Ensure a root-level UID folder exists. Re-list after create —
 * do not trust create()'s return value (TAKItem-wrapped).
 */
export async function ensureMissionFolder(
    sub: Subscription,
    name = FOLDER_NAME
): Promise<MissionLayer> {
    let layers = await sub.layer.list({ refresh: true });
    const existing = findLayerByName(layers, name);
    if (existing) return existing;

    await sub.layer.create({
        name,
        type: 'UID'
    });

    layers = await sub.layer.list(); // create() already refreshed Dexie
    const created = findLayerByName(layers, name);
    if (!created) {
        throw new Error(`Failed to create "${name}" mission folder`);
    }
    return created;
}
```

**Soft ensure** (panel open — don't block UI if the user lacks write):

```ts
async function softEnsureFolder(sub: Subscription | undefined): Promise<void> {
    if (!sub) return;
    try {
        await ensureMissionFolder(sub);
    } catch (err) {
        console.warn('Failed to ensure mission folder', err);
    }
}

watch(() => mapStore.mission, (m) => { void softEnsureFolder(m); }, { immediate: true });
```

## Pattern: post CoTs then file into folder

Two steps — never skip step 1:

1. **Add to mission** — `mapStore.worker.db.add(feat, { authored: true })` (uses active mission + `dest: mission-guid`)
2. **File into folder** — `sub.layer.attachFeatures(folder.uid, postedUids)`

```ts
async function postIntoFolder(
    feats: Feature[] // each must have a stable id / uid
): Promise<void> {
    const sub = mapStore.mission;
    if (!sub) throw new Error('No active DataSync');

    const postedUids: string[] = [];

    for (const feat of feats) {
        await mapStore.worker.db.add(feat, { authored: true });
        postedUids.push(String(feat.id));
    }

    if (!postedUids.length) return;

    const folder = await ensureMissionFolder(sub, 'MyPlugin');
    await sub.layer.attachFeatures(folder.uid, postedUids);

    await mapStore.refresh();
}
```

Build features with a known `id` (e.g. `randomUUID()`) **before** `db.add` so you can pass the same UIDs to `attachFeatures`.

### Feature `path` vs folder

Leave `path: '/'` on the GeoJSON Feature unless you are dealing with profile folders. Mission filing uses the **layer UID**, not `feature.path`.

## Nested folders (optional)

```ts
await sub.layer.create({
    name: 'Rings',
    type: 'UID',
    parentUid: parentFolder.uid
});
```

`list()` returns top-level layers; children live on `layer.mission_layers`. Walk recursively if you need to find nested names.

## Checklist for another plugin

1. Pick a stable folder display name (e.g. `"Containment"`, `"Caltopo: <mapId>"`).
2. Copy `ensureMissionFolder` (or call a shared helper) with that name.
3. Soft-ensure when the active mission appears if you want the empty folder visible in Layers.
4. On write: `db.add(..., { authored: true })` → collect UIDs → `ensure` → `attachFeatures`.
5. On hard failure of ensure/attach after a successful add, tell the user features may already be on the mission **root**.

## Related CloudTAK sources

- [`api/web/src/base/subscription-layer.ts`](file:///Users/paulclifton/CloudTAK/api/web/src/base/subscription-layer.ts)
- [`api/web/src/components/CloudTAK/Menu/Mission/MissionLayerCreate.vue`](file:///Users/paulclifton/CloudTAK/api/web/src/components/CloudTAK/Menu/Mission/MissionLayerCreate.vue)
- [`api/web/plugins/caltopo-sync`](file:///Users/paulclifton/CloudTAK/api/web/plugins/caltopo-sync) — `ensureMissionLayer` (create only; attach separately if needed)
