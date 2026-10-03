/**
 * Which point WiSAR Travel Time starts from for a Search Containment source
 * (decision 17).
 *
 * WiSAR needs one starting point: the Manual Point or a DataSync marker.
 * Shapes and lines have no single point, so they stay Distance-only.
 *
 * No CloudTAK or Vue imports, so node:test can run it.
 */
import type { Geometry, Position } from 'geojson';

export interface WisarSourceFeature {
    geometry: Geometry;
}

export type WisarStart =
    | { ok: true; point: [number, number] }
    | { ok: false; reason: string };

export const WISAR_SOURCE_HELP = 'WiSAR Travel Time starts from a single point: use the Manual Point or a DataSync marker.';

function validLonLat(value: unknown): [number, number] | null {
    if (!Array.isArray(value) || value.length < 2) return null;
    const lon = Number(value[0]);
    const lat = Number(value[1]);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
    if (lon < -180 || lon > 180 || lat < -90 || lat > 90) return null;
    return [lon, lat];
}

export function wisarStartFor(feature: WisarSourceFeature): WisarStart {
    const g = feature.geometry;

    if (g.type === 'Point') {
        const point = validLonLat(g.coordinates as Position);
        return point
            ? { ok: true, point }
            : { ok: false, reason: 'The point has no valid location.' };
    }

    if (g.type === 'LineString' || g.type === 'MultiLineString') {
        return { ok: false, reason: `A line has no single starting point. ${WISAR_SOURCE_HELP}` };
    }

    return { ok: false, reason: `A shape has no single starting point. ${WISAR_SOURCE_HELP}` };
}
