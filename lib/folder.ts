/**
 * DataSync mission-folder helpers for the Search Containment plugin.
 *
 * Mission "folders" are UID-typed MissionLayers (see CloudTAK Mission → Layers).
 * Features must already be in the mission before attachFeatures can file them.
 */
import type Subscription from '../../../src/base/subscription.ts';
import type { MissionLayer } from '../../../src/types.ts';

export const CONTAINMENT_FOLDER = 'Containment';

/**
 * Find a top-level mission layer by exact name.
 */
export function findLayerByName(
    layers: MissionLayer[],
    name: string
): MissionLayer | undefined {
    return layers.find((l) => l.name === name);
}

/**
 * Ensure a root-level UID layer named "Containment" exists on the mission.
 * Reuses an existing layer with that name; creates one if missing.
 * Re-lists after create so we always return a fully hydrated layer uid
 * (create response is TAKItem-wrapped and not relied upon).
 */
export async function ensureContainmentFolder(
    sub: Subscription
): Promise<MissionLayer> {
    let layers = await sub.layer.list({ refresh: true });
    const existing = findLayerByName(layers, CONTAINMENT_FOLDER);
    if (existing) return existing;

    await sub.layer.create({
        name: CONTAINMENT_FOLDER,
        type: 'UID'
    });

    // create() already refreshes; list from local store
    layers = await sub.layer.list();
    const created = findLayerByName(layers, CONTAINMENT_FOLDER);
    if (!created) {
        throw new Error(`Failed to create "${CONTAINMENT_FOLDER}" mission folder`);
    }

    return created;
}
