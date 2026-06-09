// Bitmap draw run assembler.
//
// Bitmap.drawText hooks observe physical draw calls. A single semantic text
// source can arrive as one draw, a marked processNormalCharacter run, or a
// sequence of adjacent glyph draws from custom renderers. This module owns that
// grouping policy so adapters consume text runs instead of duplicating local
// geometry guesses.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());

    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    const requireRuntimeModule = globalScope.LiveTranslatorRequire;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before runtime/bitmap-draw-runs.js.');
    }
    if (typeof requireRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module require is unavailable before runtime/bitmap-draw-runs.js.');
    }
    const surfaceDrawDescriptor = requireRuntimeModule('runtime.surfaceDrawDescriptor');
    if (!surfaceDrawDescriptor || typeof surfaceDrawDescriptor.createSurfaceDrawPayload !== 'function') {
        throw new Error('[LiveTranslator] runtime.surfaceDrawDescriptor is unavailable before runtime/bitmap-draw-runs.js.');
    }

    const DEFAULT_TEXT_METHODS = Object.freeze(['drawText', 'drawTextS', 'drawTextM']);

    function collectRunsFromBatch(batch, options = {}) {
        if (!batch || typeof batch.forEachUnconsumed !== 'function') return [];
        const units = [];
        batch.forEachUnconsumed((unit) => {
            if (!unit) return;
            if (typeof batch.isConsumed === 'function' && batch.isConsumed(unit)) return;
            units.push(unit);
        });
        return collectRuns(units, options);
    }

    function collectRuns(units, options = {}) {
        const source = Array.isArray(units) ? units : [];
        const runs = [];
        let activeMarkedRun = null;
        let activeFallbackRun = null;
        source.forEach((unit) => {
            if (!unit) return;
            const markedRunKey = createMarkedRunKey(unit);
            if (markedRunKey) {
                activeFallbackRun = null;
                if (activeMarkedRun && activeMarkedRun.runKey === markedRunKey) {
                    activeMarkedRun.units.push(unit);
                    return;
                }
                const run = createRun('marked', 'normal-character-run', 'explicit', markedRunKey, [unit]);
                runs.push(run);
                activeMarkedRun = run;
                return;
            }

            activeMarkedRun = null;
            if (options.allowFallbackGlyphRuns !== false
                && activeFallbackRun
                && canMergeFallbackGlyphRun(activeFallbackRun.units[activeFallbackRun.units.length - 1], unit, options)) {
                activeFallbackRun.units.push(unit);
                return;
            }

            const startsFallbackRun = options.allowFallbackGlyphRuns !== false && canStartFallbackGlyphRun(unit, options);
            const run = startsFallbackRun
                ? createRun('fallbackGlyph', 'adjacent-glyph-run', 'inferred', '', [unit])
                : createRun('single', 'single-unit', 'none', '', [unit]);
            runs.push(run);
            activeFallbackRun = startsFallbackRun ? run : null;
        });
        return runs;
    }

    function createRun(type, reason, confidence, runKey, units) {
        return {
            type,
            reason,
            confidence,
            runKey: String(runKey || ''),
            units,
        };
    }

    function createMarkedRunKey(unit) {
        if (!unit || unit.normalCharacter !== true || !unit.normalCharacterRunId) return '';
        return [
            String(unit.normalCharacterRunId || ''),
            String(unit.methodName || 'drawText'),
            String(unit.styleId || ''),
            String(unit.align || ''),
            formatDrawNumber(unit.y),
            formatDrawNumber(unit.lineHeight),
        ].join('|');
    }

    function canStartFallbackGlyphRun(unit, options = {}) {
        return isFallbackGlyphUnit(unit, options) && hasVisibleGlyphText(unit);
    }

    function canMergeFallbackGlyphRun(left, right, options = {}) {
        if (!isFallbackGlyphUnit(left, options) || !isFallbackGlyphUnit(right, options)) return false;
        if (String(left.methodName || 'drawText') !== String(right.methodName || 'drawText')) return false;
        if (String(left.styleId || '') !== String(right.styleId || '')) return false;
        if (String(left.align || 'left') !== String(right.align || 'left')) return false;
        const align = String(left.align || 'left').toLowerCase();
        if (!isAllowedFallbackAlign(align, options)) return false;
        if (formatDrawNumber(left.y) !== formatDrawNumber(right.y)) return false;
        if (formatDrawNumber(left.lineHeight) !== formatDrawNumber(right.lineHeight)) return false;
        const leftOrder = Number(left.order);
        const rightOrder = Number(right.order);
        if (Number.isFinite(leftOrder) && Number.isFinite(rightOrder) && rightOrder <= leftOrder) return false;
        const leftX = finiteNumber(left.x, NaN);
        const rightX = finiteNumber(right.x, NaN);
        if (!Number.isFinite(leftX) || !Number.isFinite(rightX) || rightX < leftX) return false;

        const lineHeight = Math.max(
            1,
            finiteNumber(left.lineHeight, 0),
            finiteNumber(right.lineHeight, 0)
        );
        const leftWidth = estimateUnitAdvance(left);
        const rightWidth = estimateUnitAdvance(right);
        const gap = rightX - (leftX + leftWidth);
        const backtrackLimit = Math.max(1, Math.min(lineHeight * 0.2, leftWidth * 0.5));
        const gapLimit = Math.max(3, Math.min(lineHeight * 0.45, Math.max(leftWidth, rightWidth) * 1.25));
        return gap >= -backtrackLimit && gap <= gapLimit;
    }

    function isFallbackGlyphUnit(unit, options = {}) {
        if (!unit || unit.normalCharacterRunId) return false;
        const methodName = String(unit.methodName || 'drawText');
        if (!isAllowedTextMethod(methodName, options)) return false;
        const x = Number(unit.x);
        const y = Number(unit.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
        const lineHeight = Number(unit.lineHeight);
        if (!Number.isFinite(lineHeight) || lineHeight <= 0) return false;
        return getGlyphTextLength(unit.text, true) <= 1;
    }

    function createSurfaceDrawDescriptor(batch, run, overrides = {}) {
        const ordered = getOrderedRunUnits(run);
        const first = ordered[0];
        if (!first) return null;
        const text = ordered.map((unit) => String(unit && unit.text !== undefined ? unit.text : '')).join('');
        if (!text) return null;
        const bounds = measureUnits(ordered);
        const x = finiteNumber(first.x, 0);
        const y = finiteNumber(first.y, 0);
        const maxWidth = Math.max(0, bounds.x2 - x, finiteNumber(first.maxWidth, 0));
        const lineHeight = Math.max(1, ...ordered.map((unit) => finiteNumber(unit && unit.lineHeight, 0)));
        const bitmap = overrides.bitmap || (batch && batch.bitmap) || first.bitmap || null;
        return Object.assign({
            bitmap,
            target: bitmap,
            methodName: first.methodName,
            text,
            rawText: text,
            x,
            y,
            maxWidth,
            lineHeight,
            align: first.align,
            ownerType: first.ownerType,
            drawState: first.drawState,
            backgroundPatch: first.backgroundPatch || null,
            measuredWidth: Math.max(0, bounds.x2 - bounds.x1),
            sourceAdapter: 'bitmap',
            ownershipStatus: '',
            sourceCommitted: true,
            drawRun: surfaceDrawDescriptor.createDrawRunMetadata(run, ordered.length),
        }, overrides.payload && typeof overrides.payload === 'object' ? overrides.payload : {});
    }

    function createSurfaceDrawPayload(batch, run, overrides = {}) {
        const descriptor = createSurfaceDrawDescriptor(batch, run, overrides);
        if (!descriptor) return null;
        return surfaceDrawDescriptor.createSurfaceDrawPayload(descriptor, descriptor.ownershipStatus || '');
    }

    function getOrderedRunUnits(run) {
        const units = run && Array.isArray(run.units) ? run.units : [];
        return units.slice().sort(compareUnits);
    }

    function compareUnits(left, right) {
        const leftOrder = Number(left && left.order);
        const rightOrder = Number(right && right.order);
        if (Number.isFinite(leftOrder) && Number.isFinite(rightOrder) && leftOrder !== rightOrder) {
            return leftOrder - rightOrder;
        }
        const leftX = finiteNumber(left && left.x, 0);
        const rightX = finiteNumber(right && right.x, 0);
        if (leftX !== rightX) return leftX - rightX;
        return finiteNumber(left && left.y, 0) - finiteNumber(right && right.y, 0);
    }

    function measureUnits(units) {
        return units.reduce((bounds, unit) => {
            const x = finiteNumber(unit && unit.x, 0);
            const y = finiteNumber(unit && unit.y, 0);
            const width = Math.max(0, getUnitBoundsWidth(unit));
            const height = Math.max(1, finiteNumber(unit && unit.lineHeight, 1));
            return {
                x1: Math.min(bounds.x1, x),
                y1: Math.min(bounds.y1, y),
                x2: Math.max(bounds.x2, x + width),
                y2: Math.max(bounds.y2, y + height),
            };
        }, { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity });
    }

    function getUnitBoundsWidth(unit) {
        const measured = finiteNumber(unit && unit.measuredWidth, 0);
        if (measured > 0) return measured;
        return finiteNumber(unit && unit.maxWidth, 0);
    }

    function estimateUnitAdvance(unit) {
        const measured = finiteNumber(unit && unit.measuredWidth, 0);
        if (measured > 0) return measured;
        const textLength = Math.max(1, getGlyphTextLength(unit && unit.text, true));
        const maxWidth = finiteNumber(unit && unit.maxWidth, 0);
        if (maxWidth > 0) return Math.max(1, maxWidth / Math.max(1, textLength + 1));
        const lineHeight = finiteNumber(unit && unit.lineHeight, 0);
        return Math.max(1, lineHeight * 0.5);
    }

    function hasVisibleGlyphText(unit) {
        return getGlyphTextLength(unit && unit.text, false) > 0;
    }

    function getGlyphTextLength(text, allowWhitespace) {
        const value = String(text ?? '');
        if (!value) return 0;
        const chars = Array.from(value).filter((char) => allowWhitespace || !/\s/u.test(char));
        return chars.length;
    }

    function isAllowedTextMethod(methodName, options = {}) {
        const methods = Array.isArray(options.methods) && options.methods.length
            ? options.methods
            : DEFAULT_TEXT_METHODS;
        return methods.map((method) => String(method || '')).indexOf(String(methodName || '')) >= 0;
    }

    function isAllowedFallbackAlign(align, options = {}) {
        const allowed = Array.isArray(options.aligns) && options.aligns.length
            ? options.aligns
            : ['left', 'start'];
        const value = String(align || 'left').toLowerCase();
        return !value || allowed.map((item) => String(item || '').toLowerCase()).indexOf(value) >= 0;
    }

    function formatDrawNumber(value) {
        const numeric = Number(value);
        return Number.isFinite(numeric) ? String(Math.round(numeric * 1000) / 1000) : '';
    }

    function finiteNumber(value, fallback) {
        const numeric = Number(value);
        return Number.isFinite(numeric) ? numeric : fallback;
    }

    defineRuntimeModule('runtime.bitmapDrawRuns', {
        collectRuns,
        collectRunsFromBatch,
        createMarkedRunKey,
        createSurfaceDrawDescriptor,
        createSurfaceDrawPayload,
        compareUnits,
        measureUnits,
        estimateUnitAdvance,
    });
})();
