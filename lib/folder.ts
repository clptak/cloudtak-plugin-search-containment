/**
 * DataSync mission-folder helpers for the Search Containment plugin.
 *
 * Mission "folders" are UID-typed MissionLayers (see CloudTAK Mission → Layers).
 *
 * Filing into a folder has two complementary approaches:
 * 1. CoT dest `path` = layer UID at send time (atomic; same as CloudTAK ETL)
 * 2. `attachFeatures` after the CoT is in the mission (races if called too soon)
 */
import type Subscription from '../../../src/base/subscription.ts';
import type { Feature, MissionLayer } from '../../../src/types.ts';

export const CONTAINMENT_FOLDER = 'Containment';

export function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

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
 * Build a mission dest that files the CoT into a UID layer on ingest.
 * `path` here is the **layer UID**, not a filesystem path.
 */
export function missionFolderDest(
    missionGuid: string,
    folderUid: string
): Array<{ 'mission-guid': string; path: string; after: string }> {
    return [{
        'mission-guid': missionGuid,
        path: folderUid,
        after: ''
    }];
}

/**
 * Clone a feature with dest set so TAK files it under the folder on ingest.
 */
export function withMissionFolderDest(
    feat: Feature,
    missionGuid: string,
    folderUid: string
): Feature {
    const wire = JSON.parse(JSON.stringify(feat)) as Feature;
    wire.properties.dest = missionFolderDest(missionGuid, folderUid);
    return wire;
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

/**
 * File existing mission CoT UIDs under a folder.
 *
 * Must run only after TAK has ingested the CoTs (websocket publish is async).
 * Attaches one UID at a time (matches CloudTAK Layers UI) with retries.
 */
export async function attachFeaturesToFolder(
    sub: Subscription,
    folderUid: string,
    uids: string[],
    opts?: {
        initialDelayMs?: number;
        attempts?: number;
    }
): Promise<void> {
    if (!uids.length) return;

    const initialDelayMs = opts?.initialDelayMs ?? 800;
    const attempts = opts?.attempts ?? 6;

    // #region agent log
    fetch('http://127.0.0.1:7577/ingest/ddb466b1-f655-482a-963b-be21a6e818b9',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'753dc7'},body:JSON.stringify({sessionId:'753dc7',runId:'pre-fix',hypothesisId:'A,B,E',location:'folder.ts:attachFeaturesToFolder:start',message:'attach batch start',data:{folderUid,uidCount:uids.length,initialDelayMs,attempts,firstUids:uids.slice(0,3),lastUids:uids.slice(-3)},timestamp:Date.now()})}).catch(()=>{});
    console.warn('[containment-debug] attach start', { folderUid, uidCount: uids.length, initialDelayMs, attempts });
    // #endregion

    await sleep(initialDelayMs);

    const failed: string[] = [];
    const succeeded: string[] = [];
    const failDetails: Array<{ uid: string; attemptsUsed: number; error: string }> = [];

    for (let index = 0; index < uids.length; index++) {
        const uid = uids[index];
        let ok = false;
        let lastErr: unknown;
        let attemptsUsed = 0;

        for (let i = 0; i < attempts; i++) {
            attemptsUsed = i + 1;
            try {
                await sub.layer.attachFeatures(folderUid, [uid]);
                ok = true;
                break;
            } catch (err) {
                lastErr = err;
                // #region agent log
                if (i === attempts - 1 || i === 0) {
                    fetch('http://127.0.0.1:7577/ingest/ddb466b1-f655-482a-963b-be21a6e818b9',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'753dc7'},body:JSON.stringify({sessionId:'753dc7',runId:'pre-fix',hypothesisId:'A,B',location:'folder.ts:attachFeaturesToFolder:attempt',message:'attach attempt failed',data:{uid,index,attempt:i+1,attempts,error:err instanceof Error?err.message:String(err)},timestamp:Date.now()})}).catch(()=>{});
                }
                // #endregion
                await sleep(300 * (i + 1));
            }
        }

        if (!ok) {
            failed.push(uid);
            const error = lastErr instanceof Error ? lastErr.message : String(lastErr);
            failDetails.push({ uid, attemptsUsed, error });
            console.warn('Failed to attach feature to mission folder', uid, lastErr);
            // #region agent log
            fetch('http://127.0.0.1:7577/ingest/ddb466b1-f655-482a-963b-be21a6e818b9',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'753dc7'},body:JSON.stringify({sessionId:'753dc7',runId:'pre-fix',hypothesisId:'A,B,E',location:'folder.ts:attachFeaturesToFolder:uid-failed',message:'attach uid exhausted retries',data:{uid,index,attemptsUsed,error,total:uids.length},timestamp:Date.now()})}).catch(()=>{});
            console.warn('[containment-debug] attach FAILED', { uid, index, attemptsUsed, error });
            // #endregion
        } else {
            succeeded.push(uid);
            // #region agent log
            if (attemptsUsed > 1 || index < 2 || index >= uids.length - 2) {
                fetch('http://127.0.0.1:7577/ingest/ddb466b1-f655-482a-963b-be21a6e818b9',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'753dc7'},body:JSON.stringify({sessionId:'753dc7',runId:'pre-fix',hypothesisId:'A,B',location:'folder.ts:attachFeaturesToFolder:uid-ok',message:'attach uid ok',data:{uid,index,attemptsUsed,total:uids.length},timestamp:Date.now()})}).catch(()=>{});
            }
            // #endregion
        }
    }

    // #region agent log
    fetch('http://127.0.0.1:7577/ingest/ddb466b1-f655-482a-963b-be21a6e818b9',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'753dc7'},body:JSON.stringify({sessionId:'753dc7',runId:'pre-fix',hypothesisId:'A,B,D,E',location:'folder.ts:attachFeaturesToFolder:summary',message:'attach batch summary',data:{ok:succeeded.length,failed:failed.length,total:uids.length,failDetails,failedIndexes:failed.map((u)=>uids.indexOf(u))},timestamp:Date.now()})}).catch(()=>{});
    console.warn('[containment-debug] attach summary', { ok: succeeded.length, failed: failed.length, failDetails, failedIndexes: failed.map((u) => uids.indexOf(u)) });
    // #endregion

    if (failed.length) {
        throw new Error(
            `Posted to mission but could not file ${failed.length}/${uids.length} `
            + `into "${CONTAINMENT_FOLDER}" (they may still be at mission root)`
            + ` [debug indexes: ${failed.map((u) => uids.indexOf(u)).join(',')}]`
        );
    }
}
