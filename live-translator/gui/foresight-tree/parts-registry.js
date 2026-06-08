// Bootstrap registry for Foresight tree viewer support parts.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const registryName = 'LiveTranslatorForesightTreeViewerRegistry';
    const parts = Object.create(null);

    if (globalScope[registryName]) {
        throw new Error('[ForesightTreeViewer] parts registry was already initialized.');
    }

    function normalizePartName(name) {
        const value = String(name || '').trim();
        if (!value) throw new Error('[ForesightTreeViewer] part name is required.');
        return value;
    }

    function registerPart(name, value) {
        const key = normalizePartName(name);
        if (Object.prototype.hasOwnProperty.call(parts, key)) {
            throw new Error('[ForesightTreeViewer] duplicate part: ' + key);
        }
        parts[key] = value;
        return value;
    }

    function requirePart(name) {
        const key = normalizePartName(name);
        if (!Object.prototype.hasOwnProperty.call(parts, key)) {
            throw new Error('[ForesightTreeViewer] missing part: ' + key);
        }
        return parts[key];
    }

    function hasParts(names) {
        return Array.isArray(names) && names.every((name) => (
            Object.prototype.hasOwnProperty.call(parts, normalizePartName(name))
        ));
    }

    function dispose() {
        delete globalScope[registryName];
    }

    Object.defineProperty(globalScope, registryName, {
        configurable: true,
        value: Object.freeze({ dispose, hasParts, registerPart, requirePart }),
    });
})();
