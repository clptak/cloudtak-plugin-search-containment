/**
 * Pure geometry helpers for the Search Containment plugin.
 *
 * All functions are side-effect free so they can be unit tested without
 * a map, a store, or a network connection.
 */
import Ellipse from '@turf/ellipse';
import { buffer } from '@turf/buffer';
import { distance } from '@turf/distance';
import type {
    Feature as GeoJSONFeature,
    Geometry,
    LineString,
    MultiPolygon,
    Polygon,
    Position
} from 'geojson';

export type DistanceUnit = 'miles' | 'meters';

const KM_PER_MILE = 1.609344;

/**
 * Convert a user-entered distance to kilometers
 */
export function toKilometers(value: number, unit: DistanceUnit): number {
    if (unit === 'miles') return value * KM_PER_MILE;
    return value / 1000;
}

/**
 * Build the containment ring(s) for a source feature.
 *
 * - Point   → geodesic circle of radius `distanceKm`
 * - Polygon → boundary buffered OUTWARD by `distanceKm`
 *
 * Returns one or more closed rings (each an array of positions where
 * first === last) — a buffered MultiPolygon yields multiple rings.
 */
export function buildRings(
    geometry: Geometry,
    distanceKm: number
): Position[][] {
    if (geometry.type === 'Point') {
        if (distanceKm <= 0) throw new Error('Distance must be greater than zero for a marker');

        const circle = Ellipse(geometry.coordinates, distanceKm, distanceKm, {
            angle: 360
        });

        return [circle.geometry.coordinates[0]];
    } else if (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon') {
        if (distanceKm <= 0) {
            return outerRings(geometry);
        }

        const buffered = buffer(
            { type: 'Feature', properties: {}, geometry } as GeoJSONFeature<Polygon | MultiPolygon>,
            distanceKm,
            { units: 'kilometers' }
        );

        if (!buffered) throw new Error('Failed to buffer the selected shape');

        return outerRings(buffered.geometry);
    }

    throw new Error(`Unsupported geometry type: ${geometry.type}`);
}

/**
 * Extract the outer ring(s) of a Polygon or MultiPolygon
 */
export function outerRings(geometry: Polygon | MultiPolygon): Position[][] {
    if (geometry.type === 'Polygon') {
        return [geometry.coordinates[0]];
    }

    return geometry.coordinates.map((poly) => poly[0]);
}

/**
 * 2D line-segment intersection in lon/lat space.
 *
 * A planar approximation is fine here: both the ring and the trail
 * geometry are densely segmented, so each segment is short enough that
 * spherical effects are negligible at SAR working distances.
 */
export function segmentIntersection(
    a1: Position, a2: Position,
    b1: Position, b2: Position
): Position | null {
    const d1x = a2[0] - a1[0];
    const d1y = a2[1] - a1[1];
    const d2x = b2[0] - b1[0];
    const d2y = b2[1] - b1[1];

    const denom = d1x * d2y - d1y * d2x;
    if (denom === 0) return null; // parallel or collinear

    const dx = b1[0] - a1[0];
    const dy = b1[1] - a1[1];

    const t = (dx * d2y - dy * d2x) / denom;
    const u = (dx * d1y - dy * d1x) / denom;

    if (t < 0 || t > 1 || u < 0 || u > 1) return null;

    return [
        a1[0] + t * d1x,
        a1[1] + t * d1y
    ];
}

/**
 * Compute every point where a trail LineString crosses one of the rings
 */
export function ringTrailIntersections(
    rings: Position[][],
    trails: Array<GeoJSONFeature<LineString>>
): Position[] {
    const points: Position[] = [];

    for (const ring of rings) {
        for (let i = 0; i < ring.length - 1; i++) {
            const r1 = ring[i];
            const r2 = ring[i + 1];

            for (const trail of trails) {
                const coords = trail.geometry.coordinates;

                for (let j = 0; j < coords.length - 1; j++) {
                    const hit = segmentIntersection(r1, r2, coords[j], coords[j + 1]);
                    if (hit) points.push(hit);
                }
            }
        }
    }

    return points;
}

/**
 * Cluster intersection points that are closer together than
 * `minSpacingMeters`, returning one representative point (the cluster
 * centroid) per cluster.
 *
 * Greedy single-linkage: good enough for deduplicating switchback
 * crossings and tile-seam duplicates without pulling in a clustering
 * dependency.
 */
export function clusterPoints(
    points: Position[],
    minSpacingMeters: number
): Position[] {
    const clusters: Position[][] = [];

    for (const point of points) {
        let placed = false;

        for (const cluster of clusters) {
            for (const member of cluster) {
                const km = distance(member, point, { units: 'kilometers' });
                if (km * 1000 <= minSpacingMeters) {
                    cluster.push(point);
                    placed = true;
                    break;
                }
            }
            if (placed) break;
        }

        if (!placed) clusters.push([point]);
    }

    return clusters.map((cluster) => {
        let lon = 0;
        let lat = 0;
        for (const p of cluster) {
            lon += p[0];
            lat += p[1];
        }
        return [lon / cluster.length, lat / cluster.length];
    });
}

/**
 * Sort points clockwise (starting from due north) around their common
 * centroid so "Containment 1..n" reads sensibly around the ring.
 */
export function sortClockwise(points: Position[]): Position[] {
    if (points.length < 2) return points.slice();

    let lon = 0;
    let lat = 0;
    for (const p of points) {
        lon += p[0];
        lat += p[1];
    }
    const cx = lon / points.length;
    const cy = lat / points.length;

    return points.slice().sort((a, b) => {
        const angleA = Math.atan2(a[0] - cx, a[1] - cy);
        const angleB = Math.atan2(b[0] - cx, b[1] - cy);
        const normA = angleA < 0 ? angleA + Math.PI * 2 : angleA;
        const normB = angleB < 0 ? angleB + Math.PI * 2 : angleB;
        return normA - normB;
    });
}
