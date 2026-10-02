/**
 * Which point WiSAR Travel Time starts from for a Search Containment source
 * (decision 17, point sources "Option C").
 *
 * WiSAR needs one starting point. A Point (the Manual Point, or a DataSync
 * marker) is used as-is; a circle uses its centre. Polygons, ellipses and
 * lines have no single point, so they stay Distance-only.
 *
 * Circles are recognised the way CloudTAK stores them: a `center` property
 * plus `shape.ellipse` with equal major and minor axes, or a circle CoT type
 * (u-d-c-c, u-r-b-c-c) with a `center`.
 *
 * No CloudTAK or Vue imports, so node:test can run it.
 */
import type { Geometry, Position } from 'geojson';

export interface WisarSourceFeature {
    geometry: Geometry;
    properties?: Record<string, unknown> | null;
}

export type WisarStart =
    | { ok: true; kind: 'point' | 'circle'; point: [number, number] }
    | { ok: false; reason: string };

const CIRCLE_TYPES = ['u-d-c-c', 'u-r-b-c-c'];

/** Metres of difference between the axes still treated as a circle. */
const AXIS_TOLERANCE_M = 0.5;

export const WISAR_SOURCE_HELP = 'WiSAR Travel Time starts from a single point: use the Manual Point, or a circle (its centre is used).';

function validLonLat(value: unknown): [number, number] | null {
    if (!Array.isArray(value) || value.length < 2) return null;
    const lon = Number(value[0]);
    const lat = Number(value[1]);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
    if (lon < -180 || lon > 180 || lat < -90 || lat > 90) return null;
    return [lon, lat];
}

function ellipseAxes(props: Record<string, unknown>): { major: number; minor: number } | null {
    const shape = props.shape;
    if (!shape || typeof shape !== 'object') return null;
    const ellipse = (shape as Record<string, unknown>).ellipse;
    if (!ellipse || typeof ellipse !== 'object') return null;
    const major = Number((ellipse as Record<string, unknown>).major);
    const minor = Number((ellipse as Record<string, unknown>).minor);
    if (!Number.isFinite(major) || !Number.isFinite(minor)) return null;
    return { major, minor };
}

/** The circle's centre, or null when the feature is not a circle. */
export function circleCentre(feature: WisarSourceFeature): [number, number] | null {
    const props = feature.properties ?? {};
    const centre = validLonLat(props.center);
    if (!centre) return null;

    const axes = ellipseAxes(props);
    if (axes) return Math.abs(axes.major - axes.minor) <= AXIS_TOLERANCE_M ? centre : null;

    const type = typeof props.type === 'string' ? props.type : '';
    return CIRCLE_TYPES.some((t) => type.startsWith(t)) ? centre : null;
}

export function wisarStartFor(feature: WisarSourceFeature): WisarStart {
    const g = feature.geometry;

    if (g.type === 'Point') {
        const point = validLonLat(g.coordinates as Position);
        return point
            ? { ok: true, kind: 'point', point }
            : { ok: false, reason: 'The point has no valid location.' };
    }

    if (g.type === 'Polygon' || g.type === 'MultiPolygon') {
        const centre = circleCentre(feature);
        if (centre) return { ok: true, kind: 'circle', point: centre };
        return { ok: false, reason: `This shape has no single starting point. ${WISAR_SOURCE_HELP}` };
    }

    if (g.type === 'LineString' || g.type === 'MultiLineString') {
        return { ok: false, reason: `A line has no single starting point. ${WISAR_SOURCE_HELP}` };
    }

    return { ok: false, reason: WISAR_SOURCE_HELP };
}
