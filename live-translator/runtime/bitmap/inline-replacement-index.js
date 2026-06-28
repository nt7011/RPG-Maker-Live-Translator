// Bitmap inline replacement index.
//
// Stores completed native-draw substitutions by exact surface, slot, and
// generation. This keeps the bitmap hook's synchronous path to a constrained
// lookup instead of adapter observation or translation request work.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'runtime.bitmap.inlineReplacementIndex',
        factory() {
            function createInlineReplacementIndex() {
                const surfaces = new WeakMap();
                let nextReplacementId = 0;

                function remember(input = {}) {
                    const surface = input.surface || input.bitmap || input.target || null;
                    const slotKey = normalizeSlotKey(input);
                    const generation = finiteNumber(input.generation, input.revision, 0);
                    const action = normalizeAction(input.action || 'replace-native-draw');
                    const text = stringify(input.text !== undefined ? input.text : input.replacementText);
                    if (!surface || !slotKey || !action) return null;
                    if (action === 'replace-native-draw' && !text) return null;

                    const record = {
                        replacementId: `bitmap-inline-${(++nextReplacementId).toString(36)}`,
                        surface,
                        slotKey,
                        generation,
                        action,
                        text,
                        nativeArgs: normalizeNativeArgs(input, text),
                        methodName: stringify(input.methodName || 'drawText') || 'drawText',
                        ownerAdapter: stringify(input.ownerAdapter || ''),
                        recordId: stringify(input.recordId || input.itemId || ''),
                        reason: stringify(input.reason || 'inline-replacement-index'),
                    };
                    getGenerationMap(surface, slotKey, true).set(String(generation), record);
                    return cloneRecord(record);
                }

                function lookup(input = {}) {
                    const surface = input.surface || input.bitmap || input.target || null;
                    const slotKey = normalizeSlotKey(input);
                    const generation = finiteNumber(input.generation, input.revision, 0);
                    if (!surface || !slotKey) return null;
                    const generationMap = getGenerationMap(surface, slotKey, false);
                    if (!generationMap) return null;
                    const record = generationMap.get(String(generation));
                    return record ? cloneRecord(record) : null;
                }

                function forget(input = {}) {
                    const surface = input.surface || input.bitmap || input.target || null;
                    if (!surface) return 0;
                    if (input.slotKey === undefined && input.generation === undefined && input.revision === undefined) {
                        return surfaces.delete(surface) ? 1 : 0;
                    }
                    const surfaceMap = surfaces.get(surface);
                    if (!surfaceMap) return 0;
                    const slotKey = normalizeSlotKey(input);
                    if (!slotKey) return 0;
                    if (input.generation === undefined && input.revision === undefined) {
                        return surfaceMap.delete(slotKey) ? 1 : 0;
                    }
                    const generationMap = surfaceMap.get(slotKey);
                    if (!generationMap) return 0;
                    return generationMap.delete(String(finiteNumber(input.generation, input.revision, 0))) ? 1 : 0;
                }

                function getGenerationMap(surface, slotKey, create) {
                    let surfaceMap = surfaces.get(surface);
                    if (!surfaceMap) {
                        if (!create) return null;
                        surfaceMap = new Map();
                        surfaces.set(surface, surfaceMap);
                    }
                    let generationMap = surfaceMap.get(slotKey);
                    if (!generationMap) {
                        if (!create) return null;
                        generationMap = new Map();
                        surfaceMap.set(slotKey, generationMap);
                    }
                    return generationMap;
                }

                return freezeApi({ remember, lookup, forget });
            }

            function normalizeNativeArgs(input, text) {
                if (Array.isArray(input.nativeArgs)) return input.nativeArgs.slice();
                return [
                    text,
                    finiteNumber(input.x, 0),
                    finiteNumber(input.y, 0),
                    finiteNumber(input.maxWidth, 0),
                    finiteNumber(input.lineHeight, 0),
                    stringify(input.align || 'left') || 'left',
                ];
            }

            function normalizeSlotKey(input = {}) {
                const explicit = stringify(input.slotKey || '');
                if (explicit) return explicit;
                return [
                    stringify(input.methodName || 'drawText') || 'drawText',
                    finiteNumber(input.x, 0),
                    finiteNumber(input.y, 0),
                    finiteNumber(input.maxWidth, 0),
                    finiteNumber(input.lineHeight, 0),
                    stringify(input.align || 'left') || 'left',
                ].map((value) => stringify(value)).join(':');
            }

            function normalizeAction(action) {
                const value = stringify(action).replace(/_/g, '-').toLowerCase();
                if (value === 'replace-native-draw' || value === 'replace-native' || value === 'replace') {
                    return 'replace-native-draw';
                }
                if (value === 'suppress-native-draw' || value === 'skip-native' || value === 'suppress') {
                    return 'suppress-native-draw';
                }
                return '';
            }

            function cloneRecord(record) {
                if (!record) return null;
                return {
                    replacementId: record.replacementId,
                    surface: record.surface,
                    slotKey: record.slotKey,
                    generation: record.generation,
                    action: record.action,
                    text: record.text,
                    nativeArgs: Array.isArray(record.nativeArgs) ? record.nativeArgs.slice() : [],
                    methodName: record.methodName,
                    ownerAdapter: record.ownerAdapter,
                    recordId: record.recordId,
                    reason: record.reason,
                };
            }

            function finiteNumber(...values) {
                for (const value of values) {
                    const numeric = Number(value);
                    if (Number.isFinite(numeric)) return numeric;
                }
                return 0;
            }

            function stringify(value) {
                try { return String(value ?? ''); } catch (_) { return ''; }
            }

            function freezeApi(api) {
                try { return Object.freeze(api); } catch (_) { return api; }
            }

            return {
                createInlineReplacementIndex,
            };
        },
    });
})();
