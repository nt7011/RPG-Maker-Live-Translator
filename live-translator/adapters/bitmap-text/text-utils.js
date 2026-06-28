// Bitmap text adapter support: text utils.
// Each controller receives one adapter instance scope from bitmap-text.js.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'adapters.bitmapText.textUtils',
        factory() {

    function createController(scope = {}) {
        const { ADAPTER_ID, ADAPTER_LABEL, SURFACE_TYPE, RENDER_STRATEGY, BITMAP_PRIORITY, DRAW_WRAPPER_TOKEN, MUTATION_WRAPPER_TOKEN, FRAME_FLUSH_TOKEN, SMALL_TEXT_TOKEN, NORMAL_CHAR_TOKEN, GAP_MIN, GAP_RATIO } = scope;
        const { getEntryStatus, retireEntry } = scope.controllerFacades.records;
        const { getBitmapState } = scope.controllerFacades.replay;

        function estimateTextWidth(bitmap, text, maxWidth) {
            const cleaned = sanitizePerChar(text);
            const measured = scope.measuredBounds.measureBitmapTextWidth(bitmap, cleaned);
            const limit = Number(maxWidth);
            if (Number.isFinite(limit) && limit > 0 && limit !== Infinity) return Math.max(1, Math.max(measured, Math.ceil(limit)));
            return Math.max(1, measured);
        }
        
        function computeFontSignature(drawState, bitmap) {
            const source = drawState || bitmap || {};
            return [
                source.fontFace,
                source.fontSize,
                source.fontBold,
                source.fontItalic,
                source.textColor,
                source.outlineColor,
                source.outlineWidth,
            ].join('|');
        }
        
        function sanitizeVisibleText(text) {
            return scope.textCodec.sanitizeVisibleText(text, { perCharPattern: scope.perCharPattern });
        }
        
        function sanitizePerChar(text) {
            const value = String(text ?? '');
            return scope.perCharPattern ? value.replace(scope.perCharPattern, '') : value;
        }
        
        function isStandaloneGlyphText(text) {
            const value = String(text ?? '').trim();
            if (!value) return false;
            return Array.from(value).filter((char) => !/\s/u.test(char)).length <= 2;
        }
        
        function sanitizeBitmapDrawText(text, methodName) {
            if (typeof text !== 'string') return text;
            return scope.textCodec.sanitizeDrawTextOutput(text, { methodName: methodName || 'drawText' });
        }
        
        function safePrepareText(rawText) {
            try {
                return scope.createTextSource(rawText, { surfaceType: SURFACE_TYPE });
            } catch (error) {
                warn('[BitmapText] Failed to prepare text for translation.', error);
                return createPlainTextSource(rawText);
            }
        }

        function createPlainTextSource(rawText) {
            return scope.textCodec.createPlainTextSource(rawText, { surfaceType: SURFACE_TYPE });
        }
        
        function describeEntryEligibility(entry) {
            if (!entry) {
                return { eligible: true, skip: false, category: 'eligible', reason: '' };
            }
            return scope.adapterContract.describeTextEligibility({
                sourceAdapter: ADAPTER_ID,
                hook: ADAPTER_ID,
                rawText: entry.rawText,
                visibleText: entry.visibleText,
                original: entry.visibleText,
                translationSource: entry.translationSource,
                normalizedSource: entry.normalizedSource,
                status: getEntryStatus(entry),
                skipReason: entry.skipReason,
            });
        }

        function normalizeBitmapDrawCallArgs(args) {
            return [
                stringify(args && args[0]),
                args && args[1],
                args && args[2],
                args && args[3],
                args && args[4],
                normalizeCanvasTextAlign(args && args[5]),
            ];
        }

        function createBitmapDrawContext(bitmap, methodName, args) {
            const sourceArgs = Array.isArray(args) ? args : [];
            const callArgs = normalizeBitmapDrawCallArgs(sourceArgs);
            const text = callArgs[0];
            const rawX = sourceArgs[1];
            const rawY = sourceArgs[2];
            const rawMaxWidth = sourceArgs[3];
            const rawLineHeight = sourceArgs[4];
            const align = callArgs[5];
            const x = finiteNumber(rawX, 0);
            const y = finiteNumber(rawY, 0);
            const lineHeight = positiveNumber(rawLineHeight, bitmap && bitmap.fontSize, 24);
            const maxWidth = finiteNumber(rawMaxWidth, 0);
            const normalizedMethodName = stringify(methodName || 'drawText') || 'drawText';
            return {
                methodName: normalizedMethodName,
                text,
                callArgs,
                x,
                y,
                maxWidth,
                lineHeight,
                align,
                traceInput: {
                    methodName: normalizedMethodName,
                    text,
                    x,
                    y,
                    ownerType: '',
                    maxWidth,
                    lineHeight,
                    align,
                },
            };
        }
        
        function isDrawCaptureTraceEnabled() {
            if (!scope.drawCaptureTrace || typeof scope.drawCaptureTrace.record !== 'function') return false;
            try {
                return typeof scope.drawCaptureTrace.isEnabled !== 'function'
                    || scope.drawCaptureTrace.isEnabled() !== false;
            } catch (_) {
                return false;
            }
        }

        function recordDrawTrace(stage, rawText, details = {}) {
            if (!isDrawCaptureTraceEnabled()) return null;
            try {
                return scope.drawCaptureTrace.record(stage, Object.assign({
                    adapter: ADAPTER_ID,
                    rawText: stringify(rawText),
                }, details || {}));
            } catch (_) {
                return null;
            }
        }
        
        function bitmapTraceDetails(bitmap, methodName, rawText, x, y, extra = {}) {
            if (!isDrawCaptureTraceEnabled()) return null;
            const owner = readBitmapOwner(bitmap);
            const guardState = scope.bitmapServices.getRenderGuardState(bitmap);
            const contentsOwnership = describeBitmapContentsOwnership(bitmap);
            const ownerType = extra && extra.ownerType ? String(extra.ownerType) : describeOwnerType(owner, bitmap, contentsOwnership);
            const visibleText = sanitizeVisibleText(rawText);
            const state = getBitmapState(bitmap);
            return Object.assign({
                adapter: ADAPTER_ID,
                surfaceType: SURFACE_TYPE,
                methodName: methodName || 'drawText',
                rawText: stringify(rawText),
                visibleText,
                normalizedText: visibleText.trim(),
                x: roundTraceNumber(x),
                y: roundTraceNumber(y),
                ownerType,
                windowType: describeWindowType(contentsOwnership),
                bitmapStateId: state && state.id ? state.id : '',
                bitmap: bitmap ? {
                    width: roundTraceNumber(bitmap.width),
                    height: roundTraceNumber(bitmap.height),
                    fontSize: roundTraceNumber(bitmap.fontSize),
                    preferWindowPipeline: guardState ? Number(guardState.windowPipelineDepth) > 0 : false,
                    windowPipelineDepth: guardState ? Number(guardState.windowPipelineDepth) || 0 : 0,
                    windowPipelineSource: guardState ? String(guardState.windowPipelineSource || '') : '',
                    bitmapSkipDepth: guardState ? Number(guardState.bitmapSkipDepth) || 0 : 0,
                    bitmapReplayDepth: guardState ? Number(guardState.bitmapReplayDepth) || 0 : 0,
                    spriteTextReplayDepth: guardState ? Number(guardState.spriteTextReplayDepth) || 0 : 0,
                    messageContents: contentsOwnership ? contentsOwnership.surfaceType === 'message' || contentsOwnership.role === 'message-contents' : false,
                    dedicatedTextHook: contentsOwnership ? contentsOwnership.dedicatedTextHook === true : false,
                } : null,
            }, extra || {});
        }
        
        function cloneTraceRect(rect) {
            if (!rect) return null;
            const x1 = roundTraceNumber(rect.x1);
            const y1 = roundTraceNumber(rect.y1);
            const x2 = roundTraceNumber(rect.x2);
            const y2 = roundTraceNumber(rect.y2);
            if ([x1, y1, x2, y2].some((value) => value === null)) return null;
            return { x1, y1, x2, y2 };
        }
        
        function roundTraceNumber(value) {
            const numeric = Number(value);
            if (!Number.isFinite(numeric)) return null;
            return Math.round(numeric * 1000) / 1000;
        }
        
        function readBitmapOwner(bitmap) {
            const ownership = scope.surfaceOwnership;
            if (bitmap && ownership && typeof ownership.readContentsOwner === 'function') {
                return safeCall(() => ownership.readContentsOwner(bitmap));
            }
            return null;
        }

        function resolveBitmapWindowSurface(bitmap) {
            const ownership = scope.surfaceOwnership;
            if (bitmap && ownership && typeof ownership.resolveWindowSurfaceForContents === 'function') {
                return safeCall(() => ownership.resolveWindowSurfaceForContents(bitmap));
            }
            return null;
        }
        
        function hasDedicatedOwnerHook(owner) {
            if (!owner) return false;
            const ownership = scope.surfaceOwnership;
            if (ownership && typeof ownership.isDedicatedTextOwner === 'function') {
                return safeCall(() => ownership.isDedicatedTextOwner(owner) === true) === true;
            }
            return false;
        }

        function describeBitmapContentsOwnership(bitmap) {
            const ownership = scope.surfaceOwnership;
            if (bitmap && ownership && typeof ownership.describeContentsOwnership === 'function') {
                return safeCall(() => ownership.describeContentsOwnership(bitmap));
            }
            return null;
        }
        
        function deriveEntryRect(entry) {
            if (!entry) return null;
            if (entry.bounds && isValidRect(entry.bounds)) return entry.bounds;
            return rectFromDimensions(
                entry.drawParams && entry.drawParams.x,
                entry.drawParams && entry.drawParams.y,
                entry.drawParams && entry.drawParams.maxWidth,
                entry.drawParams && entry.drawParams.lineHeight
            );
        }
        
        function rectFromDimensions(x, y, width, height) {
            const x1 = finiteNumber(x, 0);
            const y1 = finiteNumber(y, 0);
            const x2 = x1 + finiteNumber(width, 0);
            const y2 = y1 + finiteNumber(height, 0);
            return {
                x1: Math.min(x1, x2),
                y1: Math.min(y1, y2),
                x2: Math.max(x1, x2),
                y2: Math.max(y1, y2),
            };
        }
        
        function isValidRect(rect) {
            return !!(rect
                && Number.isFinite(Number(rect.x1))
                && Number.isFinite(Number(rect.y1))
                && Number.isFinite(Number(rect.x2))
                && Number.isFinite(Number(rect.y2))
                && Number(rect.x2) >= Number(rect.x1)
                && Number(rect.y2) >= Number(rect.y1));
        }
        
        function rectHasArea(rect) {
            return isValidRect(rect) && Number(rect.x2) > Number(rect.x1) && Number(rect.y2) > Number(rect.y1);
        }
        
        function rectOrNull(rect) {
            return rectHasArea(rect) ? rect : null;
        }
        
        function rectanglesOverlap(a, b) {
            if (!isValidRect(a) || !isValidRect(b)) return false;
            return Number(a.x1) < Number(b.x2)
                && Number(a.x2) > Number(b.x1)
                && Number(a.y1) < Number(b.y2)
                && Number(a.y2) > Number(b.y1);
        }
        
        function normalizeCanvasTextAlign(align) {
            const value = String(align || '').toLowerCase();
            return ['left', 'right', 'center', 'start', 'end'].indexOf(value) >= 0 ? value : 'left';
        }
        
        function describeOwnerType(owner, bitmap, ownership = null) {
            const descriptor = ownership || describeBitmapContentsOwnership(bitmap);
            const windowType = describeWindowType(descriptor);
            if (windowType) return windowType;
            if (descriptor && descriptor.surfaceType) return descriptor.surfaceType;
            if (descriptor && descriptor.role) return descriptor.role;
            if (owner) return 'owned-bitmap';
            return 'bitmap';
        }

        function describeWindowType(ownership) {
            const windowData = ownership && ownership.windowData;
            return windowData && windowData.windowType ? String(windowData.windowType) : '';
        }
        
        function logTextDetected(entry) {
            if (!scope.telemetry || typeof scope.telemetry.logTextDetected !== 'function' || !entry) return;
            safeCall(() => scope.telemetry.logTextDetected(ADAPTER_ID, entry.visibleText, entry.drawParams.x, entry.drawParams.y, {
                ownerType: entry.ownerType,
                sourceRunRecords: Array.isArray(entry.sourceRunRecords) ? entry.sourceRunRecords.length : 0,
            }));
        }
        
        function updateItem(entry, patch, eventType, details) {
            return scope.adapterContract.updateItem(entry, patch || {}, {
                eventType,
                details,
            });
        }
        
        function safeCall(callback) {
            try { return typeof callback === 'function' ? callback() : null; } catch (_) { return null; }
        }
        
        function isAdapterContractFailure(error) {
            return !!(scope.adapterContract
                && typeof scope.adapterContract.isContractError === 'function'
                && scope.adapterContract.isContractError(error));
        }
        
        function warn(message, error) {
            if (scope.logger && typeof scope.logger.warn === 'function') {
                try { scope.logger.warn(message, error); } catch (_) {}
            }
        }
        
        function stringify(value) {
            try { return String(value ?? ''); } catch (_) { return ''; }
        }
        
        function finiteNumber(value, fallback) {
            const numeric = Number(value);
            return Number.isFinite(numeric) ? numeric : fallback;
        }
        
        function positiveNumber(...values) {
            for (const value of values) {
                const numeric = Number(value);
                if (Number.isFinite(numeric) && numeric > 0) return numeric;
            }
            return 1;
        }
        
        function pruneArray(values, limit) {
            if (!Array.isArray(values) || values.length <= limit) return;
            values.splice(0, values.length - limit);
        }
        
        function errorMessage(error) {
            return error && error.message ? error.message : String(error || 'translation error');
        }

        return { estimateTextWidth, computeFontSignature, sanitizeVisibleText, sanitizePerChar, isStandaloneGlyphText, sanitizeBitmapDrawText, safePrepareText, describeEntryEligibility, normalizeBitmapDrawCallArgs, createBitmapDrawContext, isDrawCaptureTraceEnabled, recordDrawTrace, bitmapTraceDetails, cloneTraceRect, roundTraceNumber, readBitmapOwner, resolveBitmapWindowSurface, hasDedicatedOwnerHook, describeBitmapContentsOwnership, deriveEntryRect, rectFromDimensions, isValidRect, rectHasArea, rectOrNull, rectanglesOverlap, normalizeCanvasTextAlign, describeOwnerType, logTextDetected, updateItem, safeCall, isAdapterContractFailure, warn, stringify, finiteNumber, positiveNumber, pruneArray, errorMessage };
    }

            return { create: createController };
        },
    });
})();
