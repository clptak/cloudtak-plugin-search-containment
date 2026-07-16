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
 * Hard cap on tile fetches per run. Tile count scales with ring
 * circumference (we only cover the ring line, not its interior), so
 * this is only hit with an unreasonably large ring / high maxzoom.
 */
const MAX_TILES = 400;

/** Parallel fetch batch size */
const BATCH_SIZE = 8;

export interface SnappingBasemap {
    id: number;
    name: string;
    url: string;
    minzoom: number;
    maxzoom: number;
}

/**
 * List basemaps flagged for snapping (vector, S3/MinIO hosted).
 * Mirrors `draw.ts populateSnappingLayers()`.
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

    return data.items.map((item) => ({
        id: item.id,
        name: item.name,
        url: item.url,
        minzoom: item.minzoom ? Number(item.minzoom) : 0,
        maxzoom: item.maxzoom ? Number(item.maxzoom) : 22
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

/**
 * Fetch every trail LineString in the tiles the containment ring(s)
 * pass through.
 *
 * Only tiles intersecting the ring lines are fetched — interior tiles
 * are skipped entirely, so cost scales with ring length, not area.
 */
export async function fetchTrailsAlongRings(
    basemap: SnappingBasemap,
    rings: Position[][]
): Promise<Array<GeoJSONFeature<LineString>>> {
    const zoom = Math.min(basemap.maxzoom, 22);

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

    if (tiles.size === 0) return [];

    if (tiles.size > MAX_TILES) {
        throw new Error(
            `Containment ring covers ${tiles.size} tiles (max ${MAX_TILES}). `
            + 'Reduce the distance or use a smaller shape.'
        );
    }

    const queue = Array.from(tiles.values());
    const features: Array<GeoJSONFeature<LineString>> = [];

    for (let i = 0; i < queue.length; i += BATCH_SIZE) {
        const batch = queue.slice(i, i + BATCH_SIZE);

        const results = await Promise.all(batch.map(async ([x, y, z]) => {
            const url = await tileFeaturesURL(basemap.url, x, y, z);

            try {
                return await std(url) as GeoJSONFeatureCollection<LineString>;
            } catch (err) {
                console.error(`Search Containment: failed to fetch tile ${z}/${x}/${y}`, err);
                return { type: 'FeatureCollection', features: [] } as GeoJSONFeatureCollection<LineString>;
            }
        }));

        for (const fc of results) {
            for (const feat of fc.features) {
                if (feat.geometry && feat.geometry.type === 'LineString') {
                    features.push(feat);
                }
            }
        }
    }

    return features;
}
