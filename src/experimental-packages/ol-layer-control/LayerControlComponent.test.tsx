// SPDX-FileCopyrightText: con terra GmbH and contributors
// SPDX-License-Identifier: Apache-2.0
/**
 * @vitest-environment jsdom
 */
import { MapConfig, MapConfigProvider, MapRegistry } from "@open-pioneer/map";
import { MapRegistryImpl } from "@open-pioneer/map/MapRegistryImpl";
import {
    PackageContextProvider,
    PackageContextProviderProps
} from "@open-pioneer/test-utils/react";
import { createService } from "@open-pioneer/test-utils/services";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TileLayer from "ol/layer/Tile";
import OSM from "ol/source/OSM";
import ResizeObserver from "resize-observer-polyfill";
import { expect, it } from "vitest";
import { LayerControlComponent } from "./LayerControlComponent";
global.ResizeObserver = ResizeObserver;

it("should successfully create a layer control component", async () => {
    const { mapId, registry } = await setupMap();
    await registry.expectMapModel(mapId);

    const { container } = render(
        <PackageContextProvider {...createPackageContextProviderProps(registry)}>
            <LayerControlComponent mapId={mapId} />
        </PackageContextProvider>
    );

    const layerList = await waitFor(() => {
        const layerList = container.querySelector(".layer-list");
        if (!layerList) {
            throw new Error("layer list did not render!");
        }
        return layerList;
    });

    // snapshot test the list instead of the parent because of inline styles caused by transition
    expect(layerList).toMatchSnapshot();

    // Check if two layer controls for the configured layers are created
    const layerElems = layerList.querySelectorAll(".layer-entry");
    expect(layerElems.length).toBe(1);
    expect(layerElems[0]).toBeInstanceOf(HTMLDivElement);
});

it("layer control should have checkbox to toggle layer visibility", async () => {
    const { mapId, registry } = await setupMap();
    const user = userEvent.setup();

    const map = await registry.expectMapModel(mapId);

    const layers = map.layers.getAllLayers();
    expect(layers.length).toBe(1);
    const firstLayer = layers[0]!;
    firstLayer.setVisible(false);

    render(
        <PackageContextProvider {...createPackageContextProviderProps(registry)}>
            <LayerControlComponent mapId={mapId} showOpacitySlider={true} />
        </PackageContextProvider>
    );

    // initially invisible
    const checkbox = (await screen.findByRole("checkbox")) as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    expect(firstLayer.visible).toBe(false);

    await act(async () => {
        // adjust visibility by control
        await user.click(checkbox);
    });

    await waitFor(() => {
        if (!firstLayer.visible) {
            throw new Error("layer did not become visible");
        }
    });

    expect(firstLayer.visible).toBe(true);
});

it("layer control should have usable opacity slider", async () => {
    const { mapId, registry } = await setupMap();
    const user = userEvent.setup();
    render(
        <PackageContextProvider {...createPackageContextProviderProps(registry)}>
            <LayerControlComponent mapId={mapId} showOpacitySlider={true} />
        </PackageContextProvider>
    );

    // Wrap with act because map loading will trigger state changes
    const firstLayer = await act(async () => {
        // pre check opacity in layer
        const map = (await registry.expectMapModel(mapId)).olMap;
        const layers = map.getAllLayers();
        expect(layers.length).toBe(1);
        const firstLayer = layers[0]!;
        expect(firstLayer.getOpacity()).toBe(1);
        return firstLayer;
    });

    // adjust opacity by control
    const slider = await screen.findByRole("slider");
    await act(async () => {
        slider.focus();
        await user.keyboard("[ArrowLeft]");
        expect(firstLayer.getOpacity()).toBeCloseTo(0.99);
    });
});

class MapConfigProviderImpl implements MapConfigProvider {
    mapId: string;
    mapConfig: MapConfig;

    constructor(mapId: string, mapConfig?: MapConfig | undefined) {
        this.mapId = mapId;
        this.mapConfig = mapConfig ?? {};
    }

    getMapConfig(): Promise<MapConfig> {
        return Promise.resolve(this.mapConfig);
    }
}

async function setupMap() {
    const mapId = "test";
    const mapConfig: MapConfig = {
        layers: [
            {
                title: "OSM",
                layer: new TileLayer({
                    source: new OSM()
                })
            }
        ]
    };

    const registry = await createService(MapRegistryImpl, {
        references: {
            providers: [new MapConfigProviderImpl(mapId, mapConfig)]
        }
    });

    return { mapId, registry };
}

function createPackageContextProviderProps(service: MapRegistry): PackageContextProviderProps {
    return {
        services: {
            "map.MapRegistry": service
        }
    };
}
