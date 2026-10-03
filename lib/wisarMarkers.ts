/**
 * Point markers in the active DataSync that WiSAR Travel Time can start
 * from (decision 17, Paul 2026-10-02): every point, with ICP / LKP / IPP /
 * PLS callsigns first, the rest alphabetically.
 *
 * No CloudTAK or Vue imports, so node:test can run it.
 */
import type { Geometry } from 'geojson';

export interface MarkerLike {
    id: string | number;
    geometry: Geometry;
    properties: { callsign?: unknown };
}

export interface MarkerOption {
    id: string;
    label: string;
}

/** ICP, LKP, IPP or PLS at the start of the callsign, not followed by a letter. */
const PRIORITY = /^(ICP|LKP|IPP|PLS)(?![a-z])/i;

function callsignOf(feat: MarkerLike): string {
    const c = typeof feat.properties.callsign === 'string' ? feat.properties.callsign.trim() : '';
    return c || 'Unnamed';
}

function pointOf(feat: MarkerLike): [number, number] | null {
    if (feat.geometry.type !== 'Point') return null;
    const [lon, lat] = feat.geometry.coordinates;
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
    if (lon < -180 || lon > 180 || lat < -90 || lat > 90) return null;
    return [lon, lat];
}

export function pointMarkerOptions(features: MarkerLike[]): MarkerOption[] {
    const points = features
        .map((feat) => ({ feat, point: pointOf(feat), callsign: callsignOf(feat) }))
        .filter((p): p is { feat: MarkerLike; point: [number, number]; callsign: string } => p.point !== null);

    points.sort((a, b) => {
        const pa = PRIORITY.test(a.callsign) ? 0 : 1;
        const pb = PRIORITY.test(b.callsign) ? 0 : 1;
        if (pa !== pb) return pa - pb;
        return a.callsign.localeCompare(b.callsign, undefined, { numeric: true, sensitivity: 'base' });
    });

    // Repeated callsigns get their location so they can be told apart
    const counts = new Map<string, number>();
    for (const p of points) counts.set(p.callsign.toLowerCase(), (counts.get(p.callsign.toLowerCase()) ?? 0) + 1);

    return points.map((p) => {
        const repeated = (counts.get(p.callsign.toLowerCase()) ?? 0) > 1;
        const [lon, lat] = p.point;
        return {
            id: String(p.feat.id),
            label: repeated ? `${p.callsign} (${lat.toFixed(5)}, ${lon.toFixed(5)})` : p.callsign
        };
    });
}
