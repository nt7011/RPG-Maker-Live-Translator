// Text orchestrator support: base-utils.
// Owns primitive parsing, ids, bounds, and serializable diagnostic copies; the facade composes these helpers into each orchestrator instance.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    const requireRuntimeModule = globalScope.LiveTranslatorRequire;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before runtime/text-orchestrator/base-utils.js.');
    }

    const SERIALIZABLE_ROOT_KEY_LIMIT = 64;
    const SERIALIZABLE_OBJECT_KEY_LIMIT = 32;
    const SERIALIZABLE_ARRAY_LIMIT = 12;
    const SERIALIZABLE_VALUE_DEPTH = 3;

    function settingBoolean(value, fallback) {
        if (value === undefined || value === null || value === '') return fallback === true;
        if (typeof value === 'boolean') return value;
        const normalized = String(value).trim().toLowerCase();
        if (['true', '1', 'yes', 'on', 'enabled'].includes(normalized)) return true;
        if (['false', '0', 'no', 'off', 'disabled'].includes(normalized)) return false;
        return fallback === true;
    }

    function firstDefined(...values) {
        for (const value of values) {
            if (value !== undefined) return value;
        }
        return undefined;
    }

    /**
     * Return the first string-like value while preserving empty strings.
     */
    function firstString(...values) {
        for (const value of values) {
            if (typeof value === 'string') return value;
            if (value !== undefined && value !== null && typeof value !== 'object') return String(value);
        }
        return '';
    }

    /**
     * Return the first non-empty string-like value.
     */
    function firstNonEmptyString(...values) {
        for (const value of values) {
            if (typeof value === 'string' && value) return value;
            if (value !== undefined && value !== null && typeof value !== 'object') {
                const text = String(value);
                if (text) return text;
            }
        }
        return '';
    }

    /**
     * Parse a finite number or return null for absent/invalid numeric input.
     */
    function finiteNumber(value) {
        const numeric = Number(value);
        return Number.isFinite(numeric) ? numeric : null;
    }

    /**
     * Normalize scheduler priority to the translation service range.
     */
    function clampPriority(value) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) return 500;
        return Math.max(0, Math.min(1000, Math.round(numeric)));
    }

    /**
     * Parse optional boolean-like input used by hook payloads.
     */
    function optionalBoolean(value) {
        if (value === undefined || value === null || value === '') return null;
        if (typeof value === 'boolean') return value;
        if (typeof value === 'number') return value !== 0;
        const normalized = String(value).trim().toLowerCase();
        if (['true', '1', 'yes', 'visible', 'on'].includes(normalized)) return true;
        if (['false', '0', 'no', 'hidden', 'off'].includes(normalized)) return false;
        return null;
    }

    /**
     * Sanitize a human-readable id segment for generated item ids.
     */
    function safeIdPart(value) {
        const text = String(value || '').trim().replace(/[^A-Za-z0-9_.-]+/g, '_');
        return text || 'unknown';
    }

    function hashStringForId(value) {
        const text = String(value || '');
        let hash = 0;
        for (let index = 0; index < text.length; index += 1) {
            hash = ((hash << 5) - hash) + text.charCodeAt(index);
            hash |= 0;
        }
        return Math.abs(hash).toString(36) || '0';
    }

    /**
     * Read positive integer settings with a safe fallback.
     */
    function positiveInteger(value, fallback) {
        const numeric = Number(value);
        return Number.isInteger(numeric) && numeric > 0 ? numeric : fallback;
    }

    /**
     * Normalize rectangle-like bounds into { x1, y1, x2, y2 }.
     *
     * Hooks may report either corner coordinates or x/y/width/height.
     */
    function normalizeBounds(bounds) {
        if (!bounds || typeof bounds !== 'object') return null;
        const x1 = Number(bounds.x1);
        const y1 = Number(bounds.y1);
        const x2 = Number(bounds.x2);
        const y2 = Number(bounds.y2);
        if ([x1, y1, x2, y2].every(Number.isFinite)) return { x1, y1, x2, y2 };
        const x = Number(bounds.x);
        const y = Number(bounds.y);
        const w = Number(bounds.w !== undefined ? bounds.w : bounds.width);
        const h = Number(bounds.h !== undefined ? bounds.h : bounds.height);
        if ([x, y, w, h].every(Number.isFinite)) return { x1: x, y1: y, x2: x + w, y2: y + h };
        return null;
    }

    /**
     * Copy a small object tree suitable for events and snapshots.
     *
     * This prevents game engine objects, circular references, or huge payloads
     * from leaking into the published global snapshot.
     */
    function pickSerializableObject(value) {
        if (!value || typeof value !== 'object') return {};
        const output = {};
        /*
         * Redraw diagnostics legitimately use a few dozen top-level keys and a
         * three-level object shape, for example details.diagnostics.sourceInk.
         * Keep those intact while still bounding payload size.
         */
        Object.keys(value).slice(0, SERIALIZABLE_ROOT_KEY_LIMIT).forEach((key) => {
            const picked = pickSerializableValue(value[key], SERIALIZABLE_VALUE_DEPTH);
            if (picked !== undefined) output[key] = picked;
        });
        return output;
    }

    /**
     * Recursively trim one value to primitives, arrays, or plain objects.
     */
    function pickSerializableValue(value, depth) {
        if (value == null || ['string', 'number', 'boolean'].includes(typeof value)) return value;
        if (depth <= 0) return String(value);
        if (Array.isArray(value)) return value.slice(0, SERIALIZABLE_ARRAY_LIMIT).map((item) => pickSerializableValue(item, depth - 1));
        if (typeof value === 'object') {
            const output = {};
            Object.keys(value).slice(0, SERIALIZABLE_OBJECT_KEY_LIMIT).forEach((key) => {
                const picked = pickSerializableValue(value[key], depth - 1);
                if (picked !== undefined) output[key] = picked;
            });
            return output;
        }
        return undefined;
    }

    /**
     * Compact text for diagnostics without exposing large strings in logs.
     */
    function defaultPreview(text, max = 48) {
        const value = String(text ?? '').replace(/\s+/g, ' ').trim();
        return value.length <= max ? value : `${value.slice(0, Math.max(0, max - 3))}...`;
    }

    defineRuntimeModule('runtime.textOrchestratorBaseUtils', {
        settingBoolean,
        firstDefined,
        firstString,
        firstNonEmptyString,
        finiteNumber,
        clampPriority,
        optionalBoolean,
        safeIdPart,
        hashStringForId,
        positiveInteger,
        normalizeBounds,
        pickSerializableObject,
        pickSerializableValue,
        defaultPreview,
    });
})();
