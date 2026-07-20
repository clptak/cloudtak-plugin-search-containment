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
 * circumference (we only cover the ring line, not its interior).
 * When maxzoom would exceed this, we step zoom down until under the
 * cap (same geometry, coarser trail tiles) instead of failing outright.
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

    const mapped = data.items.map((item) => ({
        id: item.id,
        name: item.name,
        url: item.url,
        minzoom: item.minzoom ? Number(item.minzoom) : 0,
        maxzoom: item.maxzoom ? Number(item.maxzoom) : 22
    }));

    // #region agent log
    fetch('http://127.0.0.1:7577/ingest/ddb466b1-f655-482a-963b-be21a6e818b9',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ced233'},body:JSON.stringify({sessionId:'ced233',runId:'pre-fix',hypothesisId:'A',location:'trails.ts:listSnappingBasemaps',message:'snapping basemaps from API',data:{count:mapped.length,basemaps:mapped.map((b)=>({id:b.id,name:b.name,minzoom:b.minzoom,maxzoom:b.maxzoom,rawMaxzoom:data.items.find((i)=>i.id===b.id)?.maxzoom??null,urlHost:(()=>{try{return new URL(b.url).host}catch{return 'bad-url'}})()}))},timestamp:Date.now()})}).catch(()=>{});
    // #endregion

    return mapped;
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
 *
 * Starts at the basemap maxzoom (best trail fidelity). If that would
 * exceed MAX_TILES, zoom is stepped down until the cover fits — large
 * SAR rings stay usable even when the tileset reports a high maxzoom.
 */
export async function fetchTrailsAlongRings(
    basemap: SnappingBasemap,
    rings: Position[][]
): Promise<Array<GeoJSONFeature<LineString>>> {
    const requestedZoom = Math.min(basemap.maxzoom, 22);
    const floorZoom = Math.max(0, Math.min(basemap.minzoom || 0, requestedZoom));

    let zoom = requestedZoom;
    let tiles = coverRingsAtZoom(rings, zoom);

    while (tiles.size > MAX_TILES && zoom > floorZoom) {
        zoom -= 1;
        tiles = coverRingsAtZoom(rings, zoom);
    }

    // #region agent log
    const ringStats = rings.map((ring) => {
        let approxLenDeg = 0;
        for (let i = 1; i < ring.length; i++) {
            const dx = ring[i][0] - ring[i - 1][0];
            const dy = ring[i][1] - ring[i - 1][1];
            approxLenDeg += Math.sqrt(dx * dx + dy * dy);
        }
        const first = ring[0];
        const last = ring[ring.length - 1];
        return {
            points: ring.length,
            approxLenDeg,
            closed: !!(first && last && first[0] === last[0] && first[1] === last[1]),
            bbox: ring.reduce((acc, p) => ({
                minX: Math.min(acc.minX, p[0]), maxX: Math.max(acc.maxX, p[0]),
                minY: Math.min(acc.minY, p[1]), maxY: Math.max(acc.maxY, p[1]),
            }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }),
        };
    });
    const countsByZoom: Record<number, number> = {};
    for (let z = Math.max(floorZoom, requestedZoom - 6); z <= requestedZoom; z++) {
        countsByZoom[z] = coverRingsAtZoom(rings, z).size;
    }
    const debugPayload = {
        basemap: { name: basemap.name, minzoom: basemap.minzoom, maxzoom: basemap.maxzoom },
        requestedZoom,
        zoomUsed: zoom,
        zoomSteppedDown: zoom < requestedZoom,
        ringCount: rings.length,
        ringStats,
        tileCount: tiles.size,
        maxTiles: MAX_TILES,
        overCap: tiles.size > MAX_TILES,
        countsByZoom,
    };
    fetch('http://127.0.0.1:7577/ingest/ddb466b1-f655-482a-963b-be21a6e818b9',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ced233'},body:JSON.stringify({sessionId:'ced233',runId:'post-fix',hypothesisId:'A',location:'trails.ts:fetchTrailsAlongRings',message:'tile cover result after adaptive zoom',data:debugPayload,timestamp:Date.now()})}).catch(()=>{});
    try { console.warn('[search-containment debug]', JSON.stringify(debugPayload)); } catch { /* ignore */ }
    // #endregion

    if (tiles.size === 0) return [];

    if (tiles.size > MAX_TILES) {
        throw new Error(
            `Containment ring covers ${tiles.size} tiles (max ${MAX_TILES}) `
            + `even at zoom ${zoom}. `
            + 'Reduce the distance or use a smaller shape. '
            + `[debug requestedZoom=${requestedZoom} zoomUsed=${zoom} `
            + `basemapMaxzoom=${basemap.maxzoom} rings=${rings.length} `
            + `countsByZoom=${JSON.stringify(countsByZoom)}]`
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
