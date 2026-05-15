// PIXI adapter display-object state controller.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());

    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before adapters/pixi-text/state-controller.js.');
    }

    // WeakMap-backed local state for PIXI display objects.
    function createPixiStateController(context = {}) {
        const { pixiStates, inferLabel } = context;
        let nextObjectId = 0;
    
        function ensureState(displayObject, label = '') {
                    if (!displayObject) return null;
                    let state = pixiStates.get(displayObject);
                    if (!state) {
                        state = {
                            objectId: readExistingObjectId(displayObject) || createObjectId(),
                            label: label || inferLabel(displayObject),
                            surfaceRevision: 0,
                            itemId: '',
                            payload: null,
                            codecState: null,
                            originalText: '',
                            translationSource: '',
                            normalizedSource: '',
                            renderedText: '',
                            priority: null,
                            visible: false,
                            screenState: 'inactive',
                            applyingNativeText: false,
                        };
                        pixiStates.set(displayObject, state);
                    }
                    if (label) state.label = label;
                    exposeDebugState(displayObject, state);
                    return state;
                }
        
        function getState(displayObject) {
                    if (!displayObject) return null;
                    try {
                        return pixiStates.get(displayObject) || null;
                    } catch (_) {
                        return null;
                    }
                }
        
        function createObjectId() {
                    nextObjectId += 1;
                    return String(nextObjectId);
                }
        
        function readExistingObjectId(displayObject) {
                    try {
                        return displayObject._trPixiTextObjectId || '';
                    } catch (_) {
                        return '';
                    }
                }
        
        function exposeDebugState(displayObject, state) {
                    if (!displayObject || !state) return;
                    try {
                        displayObject._trPixiTextObjectId = state.objectId;
                        displayObject._trPixiTextRecordId = state.itemId || null;
                        displayObject._trPixiTextPayload = state.payload || null;
                        displayObject._trPixiTextVisible = state.visible === true;
                    } catch (_) {}
                }
    
        return {
            ensureState,
            exposeDebugState,
            getState,
        };
    }
    
    defineRuntimeModule('adapters.pixiTextStateController', {
        create: createPixiStateController,
    });

})();
