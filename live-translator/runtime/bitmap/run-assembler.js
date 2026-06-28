// Bitmap run assembler.
//
// This is the ledger-facing owner of bitmap draw-run grouping. It preserves
// stable ledger text-run ids on routed text-run payloads.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'runtime.bitmap.runAssembler',
        requires: {
            surfaceDrawDescriptor: 'runtime.surfaceDrawDescriptor',
        },
        factory({ surfaceDrawDescriptor }) {

            const DEFAULT_TEXT_METHODS = Object.freeze(['drawText', 'drawTextS', 'drawTextM']);

            function collectTextRuns(units, options = {}) {
                const normalized = normalizeUnits(units);
                const runs = collectRuns(normalized, options);
                return runs.map((run, index) => createTextRun(run, options, index)).filter(Boolean);
            }

            function collectTextRunsFromDrawUnitDispatch(dispatch, options = {}) {
                if (!dispatch || typeof dispatch.forEachUnconsumed !== 'function') return [];
                const units = [];
                dispatch.forEachUnconsumed((unit) => {
                    if (!unit) return;
                    if (typeof dispatch.isConsumed === 'function' && dispatch.isConsumed(unit)) return;
                    units.push(unit);
                });
                return collectTextRuns(units, Object.assign({}, options, {
                    bitmap: options.bitmap || dispatch.bitmap || null,
                    reason: options.reason || dispatch.reason || '',
                }));
            }

            function collectRuns(units, options = {}) {
                const source = Array.isArray(units) ? units : [];
                const runs = [];
                const explicitRunsByKey = new Map();
                let activeFallbackRun = null;
                source.forEach((unit) => {
                    if (!unit) return;
                    const explicitRunKey = createExplicitRunKey(unit, options);
                    if (explicitRunKey) {
                        activeFallbackRun = null;
                        const existingRun = explicitRunsByKey.get(explicitRunKey);
                        if (existingRun) {
                            existingRun.units.push(unit);
                            return;
                        }
                        const run = createRun('marked', createExplicitRunReason(unit), 'explicit', explicitRunKey, [unit]);
                        runs.push(run);
                        explicitRunsByKey.set(explicitRunKey, run);
                        return;
                    }

                    if (options.allowFallbackGlyphRuns !== false
                        && activeFallbackRun
                        && canMergeFallbackGlyphRun(activeFallbackRun.units[activeFallbackRun.units.length - 1], unit, options)) {
                        activeFallbackRun.units.push(unit);
                        return;
                    }

                    const startsFallbackRun = options.allowFallbackGlyphRuns !== false && canStartFallbackGlyphRun(unit, options);
                    const run = startsFallbackRun
                        ? createRun('fallbackGlyph', 'adjacent-glyph-run', 'inferred', createFallbackRunKey(unit, options), [unit])
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
                    runKey: stringify(runKey),
                    units,
                };
            }

            function createExplicitRunKey(unit, options = {}) {
                const context = getExplicitDrawRunContext(unit);
                if (!context) return '';
                return [
                    'explicit',
                    stringify(context.type),
                    stringify(context.runId),
                    getRunContextOwnerKey(context, unit),
                    getUnitSurfaceKey(unit, options),
                    stringify(unit.methodName || 'drawText'),
                    stringify(unit.styleId || ''),
                    stringify(unit.align || ''),
                    formatDrawNumber(unit.y),
                    formatDrawNumber(unit.lineHeight),
                ].join('|');
            }

            function getExplicitDrawRunContext(unit) {
                if (!unit || typeof unit !== 'object') return null;
                const context = unit.drawRunContext && typeof unit.drawRunContext === 'object'
                    ? unit.drawRunContext
                    : null;
                const contextType = stringify(context && context.type);
                const contextRunId = stringify(context && context.runId);
                if (contextType && contextRunId) {
                    return {
                        type: contextType,
                        runId: contextRunId,
                        ownerKey: stringify(context.ownerKey || ''),
                        runInfo: context.runInfo && typeof context.runInfo === 'object' ? context.runInfo : {},
                    };
                }
                if (unit.normalCharacterRunId) {
                    return {
                        type: 'normalCharacter',
                        runId: stringify(unit.normalCharacterRunId),
                        ownerKey: '',
                        runInfo: {},
                    };
                }
                return null;
            }

            function createExplicitRunReason(unit) {
                const context = getExplicitDrawRunContext(unit);
                return context && context.type === 'normalCharacter'
                    ? 'normal-character-run'
                    : 'explicit-draw-run';
            }

            function getRunContextOwnerKey(context, unit) {
                const runInfo = context && context.runInfo && typeof context.runInfo === 'object'
                    ? context.runInfo
                    : {};
                return stringify(
                    context && context.ownerKey
                    || runInfo.ownerKey
                    || runInfo.windowId
                    || runInfo.ownerId
                    || unit && unit.ownerType
                    || ''
                );
            }

            function createFallbackRunKey(unit, options = {}) {
                return [
                    'fallback',
                    getUnitSurfaceKey(unit, options),
                    stringify(unit && unit.ownerType || ''),
                    stringify(unit && unit.methodName || 'drawText'),
                    stringify(unit && unit.styleId || ''),
                    stringify(unit && unit.align || ''),
                    formatDrawNumber(unit && unit.y),
                    formatDrawNumber(unit && unit.lineHeight),
                    formatDrawNumber(unit && unit.order),
                ].join('|');
            }

            function getUnitSurfaceKey(unit, options = {}) {
                return stringify(
                    unit && (unit.surfaceId || unit.ledgerSurfaceId || unit.bitmapSurfaceId || unit.bitmapId)
                    || options.surfaceId
                    || ''
                );
            }

            function canStartFallbackGlyphRun(unit, options = {}) {
                return isFallbackGlyphUnit(unit, options) && hasVisibleGlyphText(unit);
            }

            function canMergeFallbackGlyphRun(left, right, options = {}) {
                if (!isFallbackGlyphUnit(left, options) || !isFallbackGlyphUnit(right, options)) return false;
                if (stringify(left.methodName || 'drawText') !== stringify(right.methodName || 'drawText')) return false;
                if (stringify(left.styleId || '') !== stringify(right.styleId || '')) return false;
                if (stringify(left.align || 'left') !== stringify(right.align || 'left')) return false;
                const align = stringify(left.align || 'left').toLowerCase();
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
                if (!unit || createExplicitRunKey(unit, options)) return false;
                const methodName = stringify(unit.methodName || 'drawText');
                if (!isAllowedTextMethod(methodName, options)) return false;
                const x = Number(unit.x);
                const y = Number(unit.y);
                if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
                const lineHeight = Number(unit.lineHeight);
                if (!Number.isFinite(lineHeight) || lineHeight <= 0) return false;
                return getGlyphTextLength(unit.text, true) <= 1;
            }

            function createSurfaceDrawPayloadFromDispatchRun(dispatch, textRun, overrides = {}) {
                if (!dispatch || !textRun || !Array.isArray(textRun.units)) return null;
                const units = getDrawUnitsForTextRun(dispatch, textRun);
                if (!units.length) return null;
                const drawRun = textRun.drawRun && typeof textRun.drawRun === 'object' ? textRun.drawRun : {};
                const payloadOverrides = Object.assign({}, overrides && typeof overrides.payload === 'object' ? overrides.payload : {});
                const unitIds = Array.isArray(textRun.units) ? textRun.units.slice() : [];
                const ledgerRunIds = Array.isArray(textRun.ledgerRunIds) ? textRun.ledgerRunIds.slice() : [];
                const surfaceId = stringify(textRun.surfaceId || '');
                const slotKey = stringify(textRun.slotKey || '');
                const surfaceRevision = Number(textRun.revision);
                if (Object.keys(drawRun).length && !payloadOverrides.drawRun) {
                    payloadOverrides.drawRun = drawRun;
                }
                if (surfaceId && !payloadOverrides.surfaceId) payloadOverrides.surfaceId = surfaceId;
                if (slotKey && !payloadOverrides.slotKey) payloadOverrides.slotKey = slotKey;
                if (textRun.runId && !payloadOverrides.runId) payloadOverrides.runId = textRun.runId;
                if (unitIds.length && !payloadOverrides.unitIds) payloadOverrides.unitIds = unitIds;
                if (ledgerRunIds.length && !payloadOverrides.ledgerRunIds) payloadOverrides.ledgerRunIds = ledgerRunIds;
                if (Number.isFinite(surfaceRevision) && payloadOverrides.surfaceRevision === undefined) {
                    payloadOverrides.surfaceRevision = surfaceRevision;
                }
                const drawBoundary = Object.assign(
                    {},
                    payloadOverrides.drawBoundary && typeof payloadOverrides.drawBoundary === 'object'
                        ? payloadOverrides.drawBoundary
                        : {}
                );
                if (surfaceId && !drawBoundary.surfaceId) drawBoundary.surfaceId = surfaceId;
                if (slotKey && !drawBoundary.slotKey) drawBoundary.slotKey = slotKey;
                if (textRun.runId && !drawBoundary.runId) drawBoundary.runId = textRun.runId;
                if (unitIds.length && !drawBoundary.unitIds) drawBoundary.unitIds = unitIds;
                if (ledgerRunIds.length && !drawBoundary.ledgerRunIds) drawBoundary.ledgerRunIds = ledgerRunIds;
                if (Number.isFinite(surfaceRevision) && drawBoundary.surfaceRevision === undefined) {
                    drawBoundary.surfaceRevision = surfaceRevision;
                }
                if (!drawBoundary.phase) drawBoundary.phase = 'source-draw-committed';
                if (drawBoundary.sourceCommitted === undefined) drawBoundary.sourceCommitted = true;
                if (drawBoundary.beforeNativePaint === undefined) drawBoundary.beforeNativePaint = false;
                if (!drawBoundary.reason) drawBoundary.reason = 'surface-draw-committed';
                if (Object.keys(drawBoundary).length) payloadOverrides.drawBoundary = drawBoundary;
                return createSurfaceDrawPayload(dispatch, {
                    type: stringify(drawRun.type || 'single'),
                    reason: stringify(drawRun.reason || ''),
                    confidence: stringify(drawRun.confidence || ''),
                    runKey: stringify(drawRun.runKey || ''),
                    units,
                }, Object.assign({}, overrides, { payload: payloadOverrides }));
            }

            function createSurfaceDrawDescriptor(dispatch, run, overrides = {}) {
                const ordered = getOrderedRunUnits(run);
                const first = ordered[0];
                if (!first) return null;
                const text = ordered.map((unit) => stringify(unit && unit.text)).join('');
                if (!text) return null;
                const bounds = measureUnits(ordered);
                const x = finiteNumber(first.x, 0);
                const y = finiteNumber(first.y, 0);
                const maxWidth = Math.max(0, bounds.x2 - x, finiteNumber(first.maxWidth, 0));
                const lineHeight = Math.max(1, ...ordered.map((unit) => finiteNumber(unit && unit.lineHeight, 0)));
                const bitmap = overrides.bitmap || (dispatch && dispatch.bitmap) || first.bitmap || null;
                const restoreMaterials = createRestoreMaterialsFromOrderedUnits(ordered);
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
                    restoreMaterials,
                    measuredWidth: Math.max(0, bounds.x2 - bounds.x1),
                    sourceAdapter: 'bitmap',
                    ownershipStatus: '',
                    sourceCommitted: true,
                    drawRun: surfaceDrawDescriptor.createDrawRunMetadata(run, ordered.length),
                }, overrides.payload && typeof overrides.payload === 'object' ? overrides.payload : {});
            }

            function createSurfaceDrawPayload(dispatch, run, overrides = {}) {
                const descriptor = createSurfaceDrawDescriptor(dispatch, run, overrides);
                if (!descriptor) return null;
                return surfaceDrawDescriptor.createSurfaceDrawPayload(descriptor, descriptor.ownershipStatus || '');
            }

            function getBackgroundPatchFromDispatchRun(dispatch, textRun) {
                const units = getOrderedDrawUnitsForTextRun(dispatch, textRun);
                const first = units[0];
                return first && (first.backgroundPatch || first.fallbackBackgroundPatch) || null;
            }

            function getBackgroundPatchesFromDispatchRun(dispatch, textRun) {
                return getOrderedDrawUnitsForTextRun(dispatch, textRun)
                    .map((unit) => unit && (unit.fallbackBackgroundPatch || unit.backgroundPatch))
                    .filter(Boolean);
            }

            function createRestoreMaterialsFromOrderedUnits(ordered) {
                const materials = [];
                const seen = [];
                const singleUnitRun = Array.isArray(ordered) && ordered.length === 1;
                ordered.forEach((unit) => {
                    if (!unit) return;
                    pushRestoreMaterial(materials, seen, unit.fallbackBackgroundPatch, {
                        kind: 'backdropPatch',
                        coverageTarget: unit.normalCharacterRunId ? 'run' : (singleUnitRun ? 'entry' : 'glyph'),
                    });
                    pushRestoreMaterial(materials, seen, unit.backgroundPatch, {
                        kind: 'inkPatch',
                        coverageTarget: singleUnitRun ? 'entry' : 'glyph',
                    });
                });
                return materials;
            }

            function pushRestoreMaterial(materials, seen, patch, metadata) {
                if (!patch || typeof patch !== 'object') return;
                if (seen.indexOf(patch) >= 0) return;
                seen.push(patch);
                materials.push(Object.assign({
                    patch,
                    trustedClean: patch.trusted === true,
                }, metadata || {}));
            }

            function getOrderedDrawUnitsForTextRun(dispatch, textRun) {
                return getDrawUnitsForTextRun(dispatch, textRun).slice().sort(compareUnits);
            }

            function getDrawUnitsForTextRun(dispatch, textRun) {
                const ids = new Set((Array.isArray(textRun && textRun.units) ? textRun.units : []).map(getTextRunUnitId).filter(Boolean));
                if (!ids.size) return [];
                return (Array.isArray(dispatch && dispatch.units) ? dispatch.units : []).filter((unit) => {
                    const unitIds = [
                        unit && unit.id,
                        unit && unit.unitId,
                        unit && unit.ledgerUnitId,
                    ].map(stringify).filter(Boolean);
                    return unitIds.some((id) => ids.has(id));
                });
            }

            function createTextRun(run, options = {}, index = 0) {
                const ordered = getOrderedRunUnits(run);
                const first = ordered[0];
                if (!first) return null;
                const text = ordered.map((unit) => stringify(unit && unit.text)).join('');
                if (!text) return null;
                const bounds = measureUnits(ordered);
                const surfaceId = stringify(options.surfaceId || first.surfaceId || first.ledgerSurfaceId || '');
                const revision = Math.max(0, ...ordered.map(readUnitRevision));
                const ledgerRunIds = getLedgerTextRunIds(ordered);
                return {
                    runId: createTextRunId(ledgerRunIds, options, index),
                    surfaceId,
                    revision,
                    slotKey: createSlotKey(first),
                    text,
                    visibleText: stringify(options.visibleText !== undefined ? options.visibleText : text).trim(),
                    units: ordered.map(getUnitId).filter(Boolean),
                    ledgerRunIds,
                    bounds,
                    drawState: copyPlainObject(first.drawState),
                    drawRun: {
                        type: stringify(run.type || ''),
                        reason: stringify(run.reason || ''),
                        confidence: stringify(run.confidence || ''),
                        runKey: stringify(run.runKey || ''),
                        unitCount: ordered.length,
                    },
                    sourceCommitted: ordered.every((unit) => unit && unit.sourceCommitted !== false),
                    ownershipStatus: stringify(options.ownershipStatus || ''),
                };
            }

            function normalizeUnits(units) {
                return (Array.isArray(units) ? units : []).map(normalizeUnit).filter(Boolean);
            }

            function normalizeUnit(unit) {
                if (!unit || typeof unit !== 'object') return null;
                const geometry = unit.geometry && typeof unit.geometry === 'object' ? unit.geometry : null;
                return Object.assign({}, unit, {
                    id: getUnitId(unit),
                    surfaceId: stringify(unit.surfaceId || unit.ledgerSurfaceId || ''),
                    revision: readUnitRevision(unit),
                    methodName: stringify(unit.methodName || 'drawText') || 'drawText',
                    text: stringify(unit.text),
                    x: finiteNumber(unit.x, geometry && geometry.x, 0),
                    y: finiteNumber(unit.y, geometry && geometry.y, 0),
                    maxWidth: nonNegativeNumber(unit.maxWidth, geometry && geometry.maxWidth, 0),
                    lineHeight: positiveNumber(unit.lineHeight, geometry && geometry.lineHeight, 24),
                    align: normalizeCanvasTextAlign(unit.align || geometry && geometry.align),
                    measuredWidth: nonNegativeNumber(unit.measuredWidth, geometry && geometry.width, 0),
                    sourceCommitted: unit.sourceCommitted !== false,
                });
            }

            function createSlotKey(unit) {
                return [
                    unit.methodName || 'drawText',
                    unit.x,
                    unit.y,
                    unit.maxWidth,
                    unit.lineHeight,
                    unit.align || 'left',
                ].map((value) => stringify(value)).join(':');
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
                return (Array.isArray(units) ? units : []).reduce((bounds, unit) => {
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
                const value = stringify(text);
                if (!value) return 0;
                const chars = Array.from(value).filter((char) => allowWhitespace || !/\s/u.test(char));
                return chars.length;
            }

            function isAllowedTextMethod(methodName, options = {}) {
                const methods = Array.isArray(options.methods) && options.methods.length
                    ? options.methods
                    : DEFAULT_TEXT_METHODS;
                return methods.map((method) => stringify(method)).indexOf(stringify(methodName)) >= 0;
            }

            function isAllowedFallbackAlign(align, options = {}) {
                const allowed = Array.isArray(options.aligns) && options.aligns.length
                    ? options.aligns
                    : ['left', 'start'];
                const value = stringify(align || 'left').toLowerCase();
                return !value || allowed.map((item) => stringify(item).toLowerCase()).indexOf(value) >= 0;
            }

            function formatDrawNumber(value) {
                const numeric = Number(value);
                return Number.isFinite(numeric) ? String(Math.round(numeric * 1000) / 1000) : '';
            }

            function getUnitId(unit) {
                return stringify(unit && (unit.unitId || unit.ledgerUnitId || unit.id || ''));
            }

            function createTextRunId(ledgerRunIds, options = {}, index = 0) {
                if (ledgerRunIds.length === 1) return ledgerRunIds[0];
                if (ledgerRunIds.length > 1) return ledgerRunIds.join('+');
                return stringify(options.runIdPrefix || 'btr') + '-' + (index + 1).toString(36);
            }

            function getLedgerTextRunIds(units) {
                const seen = new Set();
                const ids = [];
                (Array.isArray(units) ? units : []).forEach((unit) => {
                    const id = getUnitLedgerTextRunId(unit);
                    if (!id || seen.has(id)) return;
                    seen.add(id);
                    ids.push(id);
                });
                return ids;
            }

            function getUnitLedgerTextRunId(unit) {
                return stringify(unit && (unit.ledgerTextRunId || unit.textRunId || ''));
            }

            function getTextRunUnitId(unit) {
                if (unit && typeof unit === 'object') return getUnitId(unit);
                return stringify(unit);
            }

            function readUnitRevision(unit) {
                const revision = Number(unit && (unit.revision !== undefined ? unit.revision : unit.surfaceRevision));
                return Number.isFinite(revision) && revision >= 0 ? revision : 0;
            }

            function copyPlainObject(value) {
                if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
                const output = {};
                Object.keys(value).forEach((key) => {
                    const item = value[key];
                    if (item === null || ['string', 'number', 'boolean'].indexOf(typeof item) >= 0) {
                        output[key] = item;
                    }
                });
                return output;
            }

            function normalizeCanvasTextAlign(align) {
                const value = stringify(align).toLowerCase();
                return ['left', 'right', 'center', 'start', 'end'].indexOf(value) >= 0 ? value : 'left';
            }

            function finiteNumber(...values) {
                for (const value of values) {
                    const numeric = Number(value);
                    if (Number.isFinite(numeric)) return numeric;
                }
                return 0;
            }

            function nonNegativeNumber(...values) {
                for (const value of values) {
                    const numeric = Number(value);
                    if (Number.isFinite(numeric) && numeric >= 0) return numeric;
                }
                return 0;
            }

            function positiveNumber(...values) {
                for (const value of values) {
                    const numeric = Number(value);
                    if (Number.isFinite(numeric) && numeric > 0) return numeric;
                }
                return 1;
            }

            function stringify(value) {
                try { return String(value ?? ''); } catch (_) { return ''; }
            }

            return {
                collectTextRunsFromDrawUnitDispatch,
                createSurfaceDrawPayloadFromDispatchRun,
                getBackgroundPatchFromDispatchRun,
                getBackgroundPatchesFromDispatchRun,
                getDrawUnitsForTextRun,
            };
        },
    });
})();
