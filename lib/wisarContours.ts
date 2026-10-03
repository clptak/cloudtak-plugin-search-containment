/**
 * Search Containment's WiSAR Travel Time choices and contours (decision 17):
 * up to 3 of the web tool's intervals, and the contour list the user picks
 * one containment contour from.
 *
 * No CloudTAK or Vue imports, so node:test can run it.
 */
import type { Position } from 'geojson';
import type { ContourCollection, ContourFeature } from './wisar.ts';

/** SC runs at most this many intervals (Paul, 2026-10-02). */
export const SC_MAX_INTERVALS = 3;

/** Checked when the form opens. */
export const SC_DEFAULT_INTERVALS: readonly number[] = [2, 4, 6];

/** True when `h` can't be checked because the limit is already reached. */
export function intervalLocked(selected: readonly number[], h: number): boolean {
    return !selected.includes(h) && selected.length >= SC_MAX_INTERVALS;
}

/** Stable id for a contour within one job: its hours. */
export function contourKey(f: ContourFeature): string {
    return String(f.properties.hours ?? f.properties.threshold_m);
}

/** Contours sorted by time, inner first. */
export function sortedContours(fc: ContourCollection): ContourFeature[] {
    return [...fc.features].sort((a, b) => (a.properties.hours ?? a.properties.threshold_m)
        - (b.properties.hours ?? b.properties.threshold_m));
}

function trimNumber(n: number): string {
    return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2)));
}

/** "2h Travel Time", the same name Incident Manager uses. */
export function contourName(f: ContourFeature): string {
    const hours = f.properties.hours;
    return typeof hours === 'number' ? `${trimNumber(hours)}h Travel Time` : (f.properties.label || f.properties.callsign);
}

/** [west, south, east, north] of every contour, or null when empty. */
export function contourBounds(fc: ContourCollection): [number, number, number, number] | null {
    let w = Infinity;
    let s = Infinity;
    let e = -Infinity;
    let n = -Infinity;
    const visit = (c: unknown): void => {
        if (Array.isArray(c) && typeof c[0] === 'number' && typeof c[1] === 'number') {
            w = Math.min(w, c[0]); e = Math.max(e, c[0]);
            s = Math.min(s, c[1]); n = Math.max(n, c[1]);
        } else if (Array.isArray(c)) {
            c.forEach(visit);
        }
    };
    for (const f of fc.features) visit(f.geometry?.coordinates);
    return Number.isFinite(w) ? [w, s, e, n] : null;
}

type Ring = [number, number][];

function perpDist(p: [number, number], a: [number, number], b: [number, number]): number {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    if (dx === 0 && dy === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function dp(points: Ring, tol: number): Ring {
    if (points.length < 3) return points.slice();
    const keep = new Uint8Array(points.length);
    keep[0] = keep[points.length - 1] = 1;
    const stack: [number, number][] = [[0, points.length - 1]];
    while (stack.length) {
        const [s, e] = stack.pop() as [number, number];
        let idx = -1;
        let max = tol;
        for (let i = s + 1; i < e; i++) {
            const d = perpDist(points[i], points[s], points[e]);
            if (d > max) {
                max = d;
                idx = i;
            }
        }
        if (idx > 0) {
            keep[idx] = 1;
            stack.push([s, idx], [idx, e]);
        }
    }
    return points.filter((_, i) => keep[i]);
}

/**
 * Douglas-Peucker on a closed ring (tolerance in degrees, ~5 m by default),
 * as Incident Manager does before posting WiSAR rings: removes the raster
 * stair-steps without visibly moving the line. Splits the ring at its
 * farthest point so both halves keep their shape; always returns a closed
 * ring of at least 4 points.
 */
export function simplifyRing(ring: Ring, tolDeg = 0.00005): Ring {
    if (ring.length <= 4) return ring.slice();
    const open = ring.slice(0, -1);
    let far = 0;
    let best = -1;
    for (let i = 1; i < open.length; i++) {
        const d = Math.hypot(open[i][0] - open[0][0], open[i][1] - open[0][1]);
        if (d > best) {
            best = d;
            far = i;
        }
    }
    const a = dp(open.slice(0, far + 1), tolDeg);
    const b = dp([...open.slice(far), open[0]], tolDeg);
    const out = [...a, ...b.slice(1)];
    return out.length >= 4 ? out : ring.slice();
}

/**
 * The rings SC finds trail crossings on and posts for one contour (decision
 * 17, Paul #2): the outer boundary of every part, holes ignored, each
 * simplified ~5 m. Parts with fewer than 4 points are skipped.
 */
export function contourRings(f: ContourFeature): Position[][] {
    const g = f.geometry;
    const polys: unknown[] = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    const rings: Position[][] = [];
    for (const poly of polys) {
        if (!Array.isArray(poly) || !Array.isArray(poly[0])) continue;
        const outer = (poly[0] as unknown[])
            .filter((p): p is number[] => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]))
            .map((p) => [Number(p[0]), Number(p[1])] as [number, number]);
        if (outer.length < 4) continue;
        rings.push(simplifyRing(outer));
    }
    return rings;
}

/** Posted name for one ring: "ICP 2h Travel Time", "ICP 2h Travel Time 2" when there are several parts. */
export function contourRingName(source: string, f: ContourFeature, index: number, total: number): string {
    const base = (source ? `${source} ` : '') + contourName(f);
    return total > 1 ? `${base} ${index + 1}` : base;
}
