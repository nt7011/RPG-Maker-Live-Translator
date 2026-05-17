// Shared GUI state bootstrap.
//
// Runtime diagnostics treat a closed translator window as diagnostics level
// "none". This file loads before diagnostics producers so game startup begins
// in that closed state instead of capturing boot-time diagnostic snapshots.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());

    if (!globalScope.LiveTranslatorModules) globalScope.LiveTranslatorModules = {};
    if (!globalScope.LiveTranslatorModules.runtime) globalScope.LiveTranslatorModules.runtime = {};

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

    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    if (typeof defineRuntimeModule === 'function') {
        defineRuntimeModule('runtime.guiState', { state });
    }
})();
