// Shared surface draw descriptor normalization.
//
// Bitmap draw hooks, batch assemblers, and ownership routing all describe the
// same physical event: text was drawn onto a bitmap-like surface. This module
// keeps the draw fields contractual without owning adapter identity or surface
// arbitration. The text orchestrator still decides ownership.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());

    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before runtime/surface-draw-descriptor.js.');
    }

    function normalizeDrawFacts(input = {}, defaults = {}) {
        const source = input && typeof input === 'object' ? input : {};
        const fallback = defaults && typeof defaults === 'object' ? defaults : {};
        const bitmap = source.bitmap || source.target || fallback.bitmap || fallback.target || null;
        const text = firstString(source.text, source.rawText, fallback.text, fallback.rawText);
        return {
            bitmap,
            target: source.target || bitmap,
            methodName: firstString(source.methodName, fallback.methodName, 'drawText'),
            text,
            rawText: firstString(source.rawText, text),
            x: finiteNumber(source.x, finiteNumber(fallback.x, 0)),
            y: finiteNumber(source.y, finiteNumber(fallback.y, 0)),
            maxWidth: finiteNumber(source.maxWidth, finiteNumber(fallback.maxWidth, 0)),
            lineHeight: finiteNumber(source.lineHeight, finiteNumber(fallback.lineHeight, 0)),
            align: firstString(source.align, fallback.align, 'left'),
            ownerType: firstString(source.ownerType, fallback.ownerType),
            drawState: cloneObject(source.drawState || fallback.drawState),
            measuredWidth: nonNegativeNumber(
                source.measuredWidth !== undefined ? source.measuredWidth : source.width,
                nonNegativeNumber(fallback.measuredWidth !== undefined ? fallback.measuredWidth : fallback.width, 0)
            ),
            standaloneGlyph: source.standaloneGlyph === true || fallback.standaloneGlyph === true,
            sourceAdapter: firstString(source.sourceAdapter, fallback.sourceAdapter),
            ownershipStatus: firstString(source.ownershipStatus, fallback.ownershipStatus),
            drawBoundary: cloneObject(source.drawBoundary || fallback.drawBoundary),
            drawRun: normalizeDrawRun(source.drawRun || fallback.drawRun),
            backgroundPatch: normalizeBackgroundPatch(source.backgroundPatch || fallback.backgroundPatch),
            sourceCommitted: source.sourceCommitted === true
                || source.afterNativePaint === true
                || source.postDraw === true
                || fallback.sourceCommitted === true,
        };
    }

    function createSurfaceDrawPayload(input = {}, status = '') {
        const facts = normalizeDrawFacts(input, {
            ownershipStatus: status,
        });
        return {
            target: facts.target,
            bitmap: facts.bitmap || facts.target,
            methodName: facts.methodName,
            text: facts.text,
            rawText: facts.rawText || facts.text,
            x: facts.x,
            y: facts.y,
            maxWidth: facts.maxWidth,
            lineHeight: facts.lineHeight,
            align: facts.align,
            drawState: facts.drawState,
            measuredWidth: facts.measuredWidth,
            ownerType: facts.ownerType,
            ownershipStatus: status || facts.ownershipStatus,
            sourceAdapter: facts.sourceAdapter,
            drawBoundary: facts.drawBoundary,
            drawRun: facts.drawRun,
            backgroundPatch: facts.backgroundPatch,
            sourceCommitted: facts.sourceCommitted,
        };
    }

    function normalizeDrawRun(drawRun) {
        if (!drawRun || typeof drawRun !== 'object') return null;
        return {
            type: firstString(drawRun.type),
            reason: firstString(drawRun.reason),
            confidence: firstString(drawRun.confidence),
            runKey: firstString(drawRun.runKey),
            unitCount: Math.max(0, Math.floor(finiteNumber(drawRun.unitCount, 0))),
        };
    }

    function createDrawRunMetadata(run, unitCount = 0) {
        const source = run && typeof run === 'object' ? run : {};
        return normalizeDrawRun({
            type: source.type || 'single',
            reason: source.reason || '',
            confidence: source.confidence || '',
            runKey: source.runKey || '',
            unitCount,
        });
    }

    function normalizeBackgroundPatch(patch) {
        if (!patch || typeof patch !== 'object') return null;
        const bitmap = patch.bitmap || null;
        const width = Math.max(0, Math.floor(Number(patch.width) || Number(bitmap && bitmap.width) || 0));
        const height = Math.max(0, Math.floor(Number(patch.height) || Number(bitmap && bitmap.height) || 0));
        if (!bitmap || width <= 0 || height <= 0) return null;
        return {
            bitmap,
            x: finiteNumber(patch.x, 0),
            y: finiteNumber(patch.y, 0),
            width,
            height,
            trusted: patch.trusted === true,
        };
    }

    function cloneObject(value) {
        return value && typeof value === 'object' ? Object.assign({}, value) : null;
    }

    function firstString(...values) {
        for (const value of values) {
            if (value === undefined || value === null) continue;
            const text = String(value);
            if (text) return text;
        }
        return '';
    }

    function finiteNumber(value, fallback) {
        const numeric = Number(value);
        return Number.isFinite(numeric) ? numeric : fallback;
    }

    function nonNegativeNumber(value, fallback) {
        return Math.max(0, finiteNumber(value, fallback));
    }

    defineRuntimeModule('runtime.surfaceDrawDescriptor', {
        normalizeDrawFacts,
        createSurfaceDrawPayload,
        normalizeDrawRun,
        createDrawRunMetadata,
        normalizeBackgroundPatch,
    });
})();
