/**
 * CloudTAK Plugin: Search Containment
 *
 * ATAK Chokepoint-style containment for SAR: select a shape or marker
 * from the active DataSync mission, offset a containment ring by a
 * distance, and generate "Containment {n}" markers wherever the trail
 * network (snapping.pmtiles) crosses the ring — all posted back into
 * the active mission.
 */
import type { App } from 'vue';
import { defineAsyncComponent, markRaw } from 'vue';
import type { PluginAPI, PluginInstance, PluginStatic } from '@tak-ps/cloudtak';
import { IconBarrierBlock } from '@tabler/icons-vue';

const ContainmentPanel = defineAsyncComponent(
    () => import('./lib/ContainmentPanel.vue'),
);

const MENU_KEY = 'search-containment';
const ROUTE_NAME = 'home-menu-plugin-search-containment';
const ROUTE_PATH = 'plugin-search-containment';

export default class SearchContainmentPlugin implements PluginInstance {
    api: PluginAPI;

    constructor(api: PluginAPI) {
        this.api = api;
    }

    static async install(_app: App, api: PluginAPI): Promise<PluginInstance> {
        api.routes.add({
            path: ROUTE_PATH,
            name: ROUTE_NAME,
            component: ContainmentPanel,
        }, 'home-menu');

        return new SearchContainmentPlugin(api);
    }

    async enable(): Promise<void> {
        this.api.menu.add({
            key: MENU_KEY,
            label: 'Containment',
            route: ROUTE_NAME,
            tooltip: 'Search Containment',
            description: 'Generate containment points where trails cross a range ring',
            icon: markRaw(IconBarrierBlock) as unknown as MenuItemIconType,
        } as MenuItemConfig);
    }

    async disable(): Promise<void> {
        // Remove only the menu item — never the route (removing routes
        // breaks navigation for other plugins; see dispatcher plugin notes)
        this.api.menu.remove(MENU_KEY);
    }
}

type MenuItemIconType = NonNullable<Parameters<PluginAPI['menu']['add']>[0]['icon']>;
type MenuItemConfig = Parameters<PluginAPI['menu']['add']>[0];

export const _typecheck = SearchContainmentPlugin as unknown as PluginStatic;
