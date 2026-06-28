// Foresight tree renderer public facade.
// Support files register model, DOM, route, and render modules before this file exposes the stable API.
(() => {
    'use strict';
    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const registry = globalScope.LiveTranslatorForesightTreeViewerRegistry;
    if (!registry || typeof registry.hasParts !== 'function' || typeof registry.requirePart !== 'function') {
        throw new Error('[ForesightTreeViewer] parts registry must load before foresight-tree/viewer.js.');
    }
    if (!registry.hasParts(['model', 'layout', 'renderer'])) {
        throw new Error('[ForesightTreeViewer] support scripts must load before foresight-tree/viewer.js.');
    }
    const layout = registry.requirePart('layout');
    const model = registry.requirePart('model');
    const renderer = registry.requirePart('renderer');
    globalScope.LiveTranslatorForesightTreeViewer = Object.freeze({
        createLayout: layout.createTimelineLayout,
        createModel: model.createModel,
        render: renderer.render,
    });
    if (typeof registry.dispose === 'function') registry.dispose();
})();
