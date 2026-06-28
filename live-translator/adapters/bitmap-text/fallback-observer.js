// Bitmap text adapter support: fallback text-run observation.
// This controller consumes unclaimed bitmap text runs and materializes local
// fallback run records that the fallback run-record controller groups into bitmap entries.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'adapters.bitmapText.fallbackObserver',
        factory() {

    function createController(scope = {}) {
        const { ADAPTER_ID, SURFACE_TYPE } = scope;
        const renderTransaction = scope.renderTransaction;
        const { flushFallbackRunRecords } = scope.controllerFacades.fallbackRunRecords;
        const { getBitmapState } = scope.controllerFacades.replay;
        const {
            estimateTextWidth,
            computeFontSignature,
            sanitizeVisibleText,
            isStandaloneGlyphText,
            normalizeCanvasTextAlign,
            stringify,
            finiteNumber,
            positiveNumber,
        } = scope.controllerFacades.textUtils;

        function handleBitmapTextRuns(runs, dispatch, metadata = {}) {
            if (!Array.isArray(runs) || !runs.length) return 0;
            const runRecords = [];
            let consumed = 0;
            runs.forEach((run) => {
                const result = createBitmapTextRunRecord(run, dispatch, metadata);
                if (!result || !result.runRecord) {
                    rejectBitmapTextRun(run, metadata, result && result.reason || 'bitmap-fallback-rejected');
                    return;
                }
                runRecords.push(result.runRecord);
                consumed += Number(result.consumed) || 0;
            });
            if (consumed && dispatch && dispatch.bitmap) {
                flushFallbackRunRecords(dispatch.bitmap, runRecords, dispatch.reason || 'text-run');
            }
            return consumed;
        }

        function createBitmapTextRunRecord(run, dispatch, metadata = {}) {
            if (!run || !Array.isArray(run.units) || !run.units.length) return rejectBitmapTextRunRecord('missing-run-units');
            if (!dispatch || !dispatch.bitmap) return rejectBitmapTextRunRecord('missing-dispatch-bitmap');
            if (typeof metadata.createSurfaceDrawPayload !== 'function') return rejectBitmapTextRunRecord('missing-surface-payload-factory');
            const bitmap = dispatch.bitmap;
            const backgroundPatches = typeof metadata.getBackgroundPatches === 'function'
                ? metadata.getBackgroundPatches(run).filter(isValidBackgroundPatch)
                : [];
            const payload = metadata.createSurfaceDrawPayload(run, {
                payload: {
                    ownershipStatus: '',
                    backgroundPatch: backgroundPatches[0] || null,
                    backgroundPatches,
                },
            });
            if (!payload) return rejectBitmapTextRunRecord('missing-surface-payload');
            if (!sanitizeVisibleText(payload.text)) return rejectBitmapTextRunRecord('empty-visible-text');
            const runRecord = createRunRecord(bitmap, Object.assign({}, payload, {
                ownerType: payload.ownerType || 'bitmap',
                backgroundPatches,
            }));
            if (!runRecord) return rejectBitmapTextRunRecord('missing-run-record');
            if (!sanitizeVisibleText(runRecord.visibleText)) return rejectBitmapTextRunRecord('empty-run-record-text');
            const ownership = recordBitmapSurfaceDraw(bitmap, runRecord, { candidateAdapters: [] });
            if (!ownership) return rejectBitmapTextRunRecord('missing-ownership-result');
            if (ownership.status === 'ignored') return rejectBitmapTextRunRecord(ownership.reason || 'surface-draw-ignored');
            if (ownership.status === 'claimed' && ownership.ownerAdapter && ownership.ownerAdapter !== ADAPTER_ID) {
                return rejectBitmapTextRunRecord('claimed-by-peer-adapter');
            }
            runRecord.ownershipToken = ownership.ownershipToken || ownership.token || null;
            if (!runRecord.ownershipToken) return rejectBitmapTextRunRecord('missing-ownership-token');
            runRecord.ownershipStatus = ownership.status;
            if (ownership.drawBoundary && typeof ownership.drawBoundary === 'object') {
                runRecord.drawBoundary = cloneDrawBoundary(ownership.drawBoundary);
            }
            const consumed = typeof metadata.consume === 'function'
                ? metadata.consume(run, ADAPTER_ID)
                : 0;
            return consumed ? { runRecord, consumed } : rejectBitmapTextRunRecord('consume-failed');
        }

        function rejectBitmapTextRun(run, metadata = {}, reason = 'bitmap-fallback-rejected') {
            if (typeof metadata.reject !== 'function') return 0;
            return metadata.reject(run, reason || 'bitmap-fallback-rejected', ADAPTER_ID);
        }

        function rejectBitmapTextRunRecord(reason = 'bitmap-fallback-rejected') {
            return {
                status: 'rejected',
                reason: reason || 'bitmap-fallback-rejected',
            };
        }

        function recordBitmapSurfaceDraw(bitmap, runRecord, options = {}) {
            if (!bitmap || !runRecord || !scope.adapterContract || typeof scope.adapterContract.recordSurfaceDraw !== 'function') {
                return { status: 'ignored', reason: 'surface-draw-unavailable' };
            }
            const candidateAdapters = Array.isArray(options.candidateAdapters)
                ? options.candidateAdapters
                : ['sprite'];
            const state = getBitmapState(bitmap);
            return scope.adapterContract.recordSurfaceDraw({
                target: bitmap,
                surfaceId: getBitmapSurfaceId(bitmap, state),
                slotKey: createBitmapDrawSlotKey(runRecord),
                surfaceType: SURFACE_TYPE,
                mode: 'bitmapFallback',
                role: 'bitmap-draw',
                generation: state && Number.isFinite(Number(state.revision)) ? Number(state.revision) : 0,
                methodName: runRecord.methodName,
                text: runRecord.rawText,
                x: runRecord.x,
                y: runRecord.y,
                maxWidth: runRecord.maxWidth,
                lineHeight: runRecord.lineHeight,
                align: runRecord.align,
                ownerType: runRecord.ownerType,
                drawState: runRecord.drawState,
                measuredWidth: runRecord.width,
                standaloneGlyph: isStandaloneGlyphText(sanitizeVisibleText(runRecord.visibleText || runRecord.rawText)),
                drawBoundary: runRecord.drawBoundary,
                drawRun: runRecord.drawRun,
                backgroundPatch: runRecord.backgroundPatch,
                sourceCommitted: runRecord.sourceCommitted === true,
                candidateAdapters,
            });
        }

        function getBitmapSurfaceId(bitmap, state = null) {
            const services = scope.bitmapServices || null;
            if (services && typeof services.getSurfaceLedgerIdentity === 'function') {
                const identity = services.getSurfaceLedgerIdentity(bitmap);
                if (identity && identity.surfaceId) return stringify(identity.surfaceId);
            }
            if (services && typeof services.ensureSurfaceLedgerRecord === 'function') {
                const surface = services.ensureSurfaceLedgerRecord(bitmap, {
                    surfaceType: 'bitmap',
                    ownerKind: 'bitmap-fallback',
                });
                if (surface && surface.surfaceId) return stringify(surface.surfaceId);
            }
            if (state && state.id) return stringify(state.id);
            return '';
        }

        function createRunRecord(bitmap, input) {
            if (!bitmap || !input) return null;
            const rawText = stringify(input.text);
            const align = normalizeCanvasTextAlign(input.align);
            const measuredWidth = positiveNumber(
                input.measuredWidth,
                estimateTextWidth(bitmap, rawText, 0)
            );
            const maxWidth = positiveNumber(input.maxWidth, measuredWidth);
            const width = Math.max(1, Math.min(Math.ceil(measuredWidth), maxWidth));
            const x = finiteNumber(input.x, 0);
            const backgroundPatches = Array.isArray(input.backgroundPatches)
                ? input.backgroundPatches.filter(isValidBackgroundPatch)
                : [];
            if (!backgroundPatches.length && isValidBackgroundPatch(input.backgroundPatch)) {
                backgroundPatches.push(input.backgroundPatch);
            }
            return {
                bitmap,
                methodName: input.methodName || 'drawText',
                rawText,
                visibleText: scope.stripControls(rawText),
                x,
                boundsX: resolveAlignedTextBoundsX(x, maxWidth, width, align),
                y: input.y,
                maxWidth,
                lineHeight: input.lineHeight,
                align,
                width,
                ownerType: input.ownerType || 'bitmap',
                drawState: input.drawState || scope.captureBitmapDrawState(bitmap),
                drawBoundary: cloneDrawBoundary(input.drawBoundary),
                sourceSurfaceId: readSourceSurfaceId(input),
                sourceRunId: readSourceRunId(input),
                sourceSlotKey: readSourceSlotKey(input),
                sourceUnitIds: normalizeSourceUnitIds(input.unitIds || input.units || input.drawBoundary && input.drawBoundary.unitIds),
                sourceSurfaceRevision: readSourceSurfaceRevision(input),
                backgroundPatch: input.backgroundPatch || null,
                backgroundPatches,
                drawRun: input.drawRun || null,
                sourceCommitted: input.sourceCommitted === true,
                fontSignature: computeFontSignature(input.drawState, bitmap),
                recordedAt: Date.now(),
            };
        }

        function createBitmapDrawSlotKey(runRecord) {
            if (!runRecord) return '';
            return [
                runRecord.methodName || 'drawText',
                runRecord.x,
                runRecord.y,
                runRecord.maxWidth,
                runRecord.lineHeight,
                runRecord.align || 'left',
            ].map((value) => stringify(value)).join(':');
        }

        function isValidBackgroundPatch(patch) {
            return !!(patch
                && patch.bitmap
                && Number(patch.width) > 0
                && Number(patch.height) > 0);
        }

        function readSourceSurfaceId(input) {
            const boundary = input && input.drawBoundary && typeof input.drawBoundary === 'object'
                ? input.drawBoundary
                : null;
            return stringify(input && (input.sourceSurfaceId || input.surfaceId) || boundary && boundary.surfaceId || '');
        }

        function readSourceRunId(input) {
            const boundary = input && input.drawBoundary && typeof input.drawBoundary === 'object'
                ? input.drawBoundary
                : null;
            return stringify(input && (input.sourceRunId || input.runId) || boundary && boundary.runId || '');
        }

        function readSourceSlotKey(input) {
            const boundary = input && input.drawBoundary && typeof input.drawBoundary === 'object'
                ? input.drawBoundary
                : null;
            return stringify(input && (input.sourceSlotKey || input.slotKey) || boundary && boundary.slotKey || '');
        }

        function readSourceSurfaceRevision(input) {
            const boundary = input && input.drawBoundary && typeof input.drawBoundary === 'object'
                ? input.drawBoundary
                : null;
            const explicit = Number(input && (input.sourceSurfaceRevision !== undefined ? input.sourceSurfaceRevision : input.surfaceRevision));
            if (Number.isFinite(explicit) && explicit >= 0) return Math.floor(explicit);
            const boundaryRevision = Number(boundary && boundary.surfaceRevision);
            if (Number.isFinite(boundaryRevision) && boundaryRevision >= 0) return Math.floor(boundaryRevision);
            return Math.max(0, Math.floor(finiteNumber(
                input && input.revision,
                0
            )));
        }

        function normalizeSourceUnitIds(value) {
            const source = Array.isArray(value) ? value : [];
            const ids = [];
            source.forEach((item) => {
                const text = stringify(item && typeof item === 'object'
                    ? (item.unitId || item.ledgerUnitId || item.id || '')
                    : (item || ''));
                if (text && ids.indexOf(text) < 0) ids.push(text);
            });
            return ids;
        }

        function resolveAlignedTextBoundsX(x, maxWidth, visibleWidth, align) {
            const originX = finiteNumber(x, 0);
            const boxWidth = positiveNumber(maxWidth, visibleWidth);
            const textWidth = positiveNumber(visibleWidth);
            if (align === 'right' || align === 'end') {
                return originX + Math.max(0, boxWidth - textWidth);
            }
            if (align === 'center') {
                return originX + Math.max(0, (boxWidth - textWidth) / 2);
            }
            return originX;
        }

        function cloneDrawBoundary(boundary) {
            if (!boundary || typeof boundary !== 'object') return null;
            return renderTransaction.createSourceDrawBoundary(boundary);
        }

        return {
            handleBitmapTextRuns,
        };
    }

            return { create: createController };
        },
    });
})();
