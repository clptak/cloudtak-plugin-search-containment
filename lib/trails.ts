/**
 * Trail (travel corridor) acquisition for the Search Containment plugin.
 *
 * Reuses CloudTAK's route-snapping infrastructure: the snapping basemap
 * (e.g. snapping.pmtiles hosted in MinIO) is discovered exactly the way
 * the draw tool does it (`draw.ts populateSnappingLayers()`), and trail
 * geometry is fetched as plain GeoJSON from the pmtiles tile server's
 * `/tiles/.../{z}/{x}/{y}/features` endpoint — the same endpoint the
 * route-snap graph uses — so no MVT decoding is required client-side.
 */
import * as tilecover from '@mapbox/tile-cover';
import { Preferences } from '@capacitor/preferences';
import { std, server } from '../../../src/std.ts';
import type { Feature as GeoJSONFeature, FeatureCollection as GeoJSONFeatureCollection, LineString, Position } from 'geojson';

/**
 * Soft cap on tile fetches per run. Prefer the highest zoom that actually
 * contains trail geometry; only step further down when a ring would exceed
 * this many tiles.
 */
const MAX_TILES = 3000;

/** Parallel fetch batch size */
const BATCH_SIZE = 16;

export interface SnappingBasemap {
    id: number;
    name: string;
    url: string;
    minzoom: number;
    maxzoom: number;
}

/**
 * Enumerate tiles covering ring LineStrings at a single zoom.
 */
function coverRingsAtZoom(
    rings: Position[][],
    zoom: number
): Map<string, [number, number, number]> {
    const tiles = new Map<string, [number, number, number]>();

    for (const ring of rings) {
        const covered = tilecover.tiles({
            type: 'LineString',
            coordinates: ring
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any, {
            min_zoom: zoom,
            max_zoom: zoom
        });

        for (const tile of covered) {
            tiles.set(tile.join('/'), tile as [number, number, number]);
        }
    }

    return tiles;
}

/**
 * List basemaps flagged for snapping (vector, S3/MinIO hosted).
 * Mirrors `draw.ts populateSnappingLayers()`, then corrects min/maxzoom
 * from each basemap's TileJSON — the DB row often reports maxzoom 22
 * while the hosted PMTiles archive tops out lower (e.g. 14).
 */
export async function listSnappingBasemaps(): Promise<SnappingBasemap[]> {
    const { data } = await server.GET('/api/basemap', {
        params: {
            query: {
                limit: 100,
                page: 0,
                order: 'asc',
                sort: 'name',
                filter: '',
                snapping: true,
                hidden: 'all',
                overlay: true
            }
        }
    });

    if (!data || !data.items.length) return [];

    return await Promise.all(data.items.map(async (item) => {
        let minzoom = item.minzoom != null ? Number(item.minzoom) : 0;
        let maxzoom = item.maxzoom != null ? Number(item.maxzoom) : 14;

        try {
            const tj = await server.GET('/api/basemap/{:basemapid}/tiles', {
                params: {
                    path: {
                        ':basemapid': item.id
                    }
                }
            });
            if (tj.data?.maxzoom != null) maxzoom = Number(tj.data.maxzoom);
            if (tj.data?.minzoom != null) minzoom = Number(tj.data.minzoom);
        } catch {
            // Fall back to DB zooms if TileJSON is unavailable
        }

        return {
            id: item.id,
            name: item.name,
            url: item.url,
            minzoom,
            maxzoom
        };
    }));
}

/**
 * Convert a tile template URL (`.../{z}/{x}/{y}.mvt`) into the tile
 * server's GeoJSON features endpoint for a specific tile.
 * Mirrors `draw.ts updateGraph()`.
 */
async function tileFeaturesURL(
    template: string,
    x: number,
    y: number,
    z: number
): Promise<URL> {
    let finalUrl = template
        .replace('{z}', String(z))
        .replace('{x}', String(x))
        .replace('{y}', String(y));

    // Remove extension (e.g. .pbf, .mvt) and append /features
    finalUrl = finalUrl.replace(/\.[a-z0-9]+$/i, '') + '/features';

    const url = new URL(finalUrl);

    const { value: token } = await Preferences.get({ key: 'token' });
    if (token) url.searchParams.set('token', token);

    url.searchParams.set('type', 'LineString');
    url.searchParams.set('multi', 'false');

    return url;
}

async function fetchTileFeatures(
    basemap: SnappingBasemap,
    x: number,
    y: number,
    z: number
): Promise<Array<GeoJSONFeature<LineString>>> {
    const url = await tileFeaturesURL(basemap.url, x, y, z);

    try {
        const fc = await std(url) as GeoJSONFeatureCollection<LineString>;

        return (fc.features || []).filter((feat) => {
            return feat.geometry && feat.geometry.type === 'LineString';
        });
    } catch (err) {
        console.error(`Search Containment: failed to fetch tile ${z}/${x}/${y}`, err);
        return [];
    }
}

/**
 * Find the highest zoom at/below `fromZoom` where a tile intersecting the
 * ring actually returns LineString features. Basemap.maxzoom is often set
 * higher than the PMTiles archive (e.g. 22 vs 14), which yields empty
 * feature responses for every tile.
 */
async function probeDataZoom(
    basemap: SnappingBasemap,
    rings: Position[][],
    fromZoom: number,
    floorZoom: number
): Promise<number | null> {
    for (let z = fromZoom; z >= floorZoom; z--) {
        const covered = coverRingsAtZoom(rings, z);
        const first = covered.values().next().value as [number, number, number] | undefined;
        if (!first) continue;

        const [x, y, tz] = first;
        const features = await fetchTileFeatures(basemap, x, y, tz);
        if (features.length > 0) return z;
    }

    return null;
}

/**
 * Fetch every trail LineString in the tiles the containment ring(s)
 * pass through.
 *
 * Only tiles intersecting the ring lines are fetched — interior tiles
 * are skipped entirely, so cost scales with ring length, not area.
 *
 * Resolves a working zoom by probing for real PMTiles data (basemap
 * maxzoom is often higher than the archive), then covers the ring at
 * that zoom, stepping down further only if tile count exceeds MAX_TILES.
 */
export async function fetchTrailsAlongRings(
    basemap: SnappingBasemap,
    rings: Position[][]
): Promise<Array<GeoJSONFeature<LineString>>> {
    const requestedZoom = Math.min(basemap.maxzoom, 22);
    const floorZoom = Math.max(0, Math.min(basemap.minzoom || 0, requestedZoom));

    if (!rings.length || !rings[0]?.length) return [];

    const dataZoom = await probeDataZoom(basemap, rings, requestedZoom, floorZoom);
    if (dataZoom == null) return [];

    let zoom = dataZoom;
    let tiles = coverRingsAtZoom(rings, zoom);

    while (tiles.size > MAX_TILES && zoom > floorZoom) {
        zoom -= 1;
        tiles = coverRingsAtZoom(rings, zoom);
    }

    if (tiles.size === 0) return [];

    if (tiles.size > MAX_TILES) {
        throw new Error(
            `Containment ring covers ${tiles.size} tiles (max ${MAX_TILES}) `
            + `even at zoom ${zoom}. Reduce the distance or use a smaller shape.`
        );
    }

    const list = Array.from(tiles.values());
    const features: Array<GeoJSONFeature<LineString>> = [];

    for (let i = 0; i < list.length; i += BATCH_SIZE) {
        const batch = list.slice(i, i + BATCH_SIZE);

        const results = await Promise.all(batch.map(async ([x, y, z]) => {
            return fetchTileFeatures(basemap, x, y, z);
        }));

        for (const result of results) {
            features.push(...result);
        }
    }

    return features;
}
