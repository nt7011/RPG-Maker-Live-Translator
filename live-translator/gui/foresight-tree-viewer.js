// Foresight tree renderer public facade.
// Support files register model, DOM, route, and render modules before this file exposes the stable API.
(() => {
    'use strict';
    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const parts = globalScope.LiveTranslatorForesightTreeViewerParts || {};
    if (!parts.model || !parts.renderer) {
        throw new Error('[ForesightTreeViewer] support scripts must load before foresight-tree-viewer.js.');
    }
    globalScope.LiveTranslatorForesightTreeViewer = Object.freeze({
        createModel: parts.model.createModel,
        render: parts.renderer.render,
    });
})();
