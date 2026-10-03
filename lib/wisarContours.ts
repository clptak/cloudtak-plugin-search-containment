/**
 * Search Containment's WiSAR Travel Time choices and contours (decision 17):
 * up to 3 of the web tool's intervals, and the contour list the user picks
 * one containment contour from.
 *
 * No CloudTAK or Vue imports, so node:test can run it.
 */
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
