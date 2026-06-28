// Canonical adapter metadata.
//
// Keep identity, render-strategy, and priority facts in one registry so runtime
// policy does not grow separate hard-coded adapter taxonomies.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'runtime.adapterMetadata',
        factory() {
            const ADAPTERS = freezeObject({
                message: freezeObject({
                    id: 'message',
                    hook: 'message',
                    label: 'Game Message',
                    surfaceType: 'message',
                    renderStrategy: 'messageRedraw',
                    ownershipPriority: 5000,
                    visiblePriority: 1000,
                    backgroundPriority: 100,
                }),
                window: freezeObject({
                    id: 'window',
                    hook: 'window',
                    label: 'Window Text',
                    surfaceType: 'window',
                    renderStrategy: 'windowTextRedraw',
                    ownershipPriority: 4000,
                    visiblePriority: 650,
                    detachedPriority: 250,
                    hiddenPriority: 100,
                }),
                sprite: freezeObject({
                    id: 'sprite',
                    hook: 'sprite_text',
                    label: 'Sprite Text',
                    surfaceType: 'sprite',
                    renderStrategy: 'spriteTextOverlay',
                    ownershipPriority: 3000,
                    visiblePriority: 550,
                }),
                pixi: freezeObject({
                    id: 'pixi',
                    hook: 'pixi_text',
                    label: 'PIXI Text',
                    surfaceType: 'pixi',
                    renderStrategy: 'pixiTextSetter',
                    ownershipPriority: 2000,
                    visiblePriority: 750,
                    detachedPriority: 250,
                    hiddenPriority: 100,
                }),
                bitmap: freezeObject({
                    id: 'bitmap',
                    hook: 'bitmap_text',
                    label: 'Bitmap Text',
                    surfaceType: 'bitmap',
                    renderStrategy: 'bitmapTextReplay',
                    ownershipPriority: 1000,
                    visiblePriority: 450,
                }),
                text: freezeObject({
                    id: 'text',
                    hook: 'text',
                    label: 'Plain Text',
                    surfaceType: 'text',
                    renderStrategy: 'text',
                    ownershipPriority: 0,
                }),
            });

            function getAdapterMetadata(adapterId) {
                return ADAPTERS[String(adapterId || '')] || null;
            }

            function getAdapterIdList() {
                return Object.keys(ADAPTERS);
            }

            function getOwnershipPriorityMap() {
                const priorities = {};
                Object.keys(ADAPTERS).forEach((adapterId) => {
                    priorities[adapterId] = ADAPTERS[adapterId].ownershipPriority;
                });
                return freezeObject(priorities);
            }

            function getRenderStrategy(adapterId) {
                const metadata = getAdapterMetadata(adapterId);
                return metadata ? metadata.renderStrategy : '';
            }

            function freezeObject(value) {
                try { return Object.freeze(value); } catch (_) { return value; }
            }

            return {
                adapters: ADAPTERS,
                getAdapterMetadata,
                getAdapterIdList,
                getOwnershipPriorityMap,
                getRenderStrategy,
            };
        },
    });
})();
