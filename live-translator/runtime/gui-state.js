// Shared GUI state bootstrap.
//
// Runtime diagnostics treat a closed translator window as diagnostics level
// "none". This file loads before diagnostics producers so game startup begins
// in that closed state instead of capturing boot-time diagnostic snapshots.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'runtime.guiState',
        factory(_dependencies, { scope: globalScope }) {
            const existing = globalScope.LiveTranslatorGuiState && typeof globalScope.LiveTranslatorGuiState === 'object'
                ? globalScope.LiveTranslatorGuiState
                : null;
            const state = existing || {
                translatorOpen: false,
                updatedAt: Date.now(),
            };
            if (!Object.prototype.hasOwnProperty.call(state, 'translatorOpen')) {
                state.translatorOpen = false;
            }
            if (!Object.prototype.hasOwnProperty.call(state, 'updatedAt')) {
                state.updatedAt = Date.now();
            }

            try { globalScope.LiveTranslatorGuiState = state; } catch (_) {}

            return { state };
        },
    });
})();
