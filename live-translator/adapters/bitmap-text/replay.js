// Bitmap text adapter support: replay.
// Each controller receives one adapter instance scope from bitmap-text.js.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'adapters.bitmapText.replay',
        requires: {
            bitmapRenderOps: 'runtime.bitmapRenderOps',
            drawGraph: 'runtime.drawGraph',
        },
        factory({ bitmapRenderOps, drawGraph }) {

    function createController(scope = {}) {
        const { MAX_REPLAY_OPS } = scope;
        const { isEntryCompleted } = scope.controllerFacades.records;
        const { sanitizeBitmapDrawText, deriveEntryRect, isValidRect, rectanglesOverlap, positiveNumber, pruneArray } = scope.controllerFacades.textUtils;

        function ensureBitmapState(bitmap) {
            if (!bitmap) return null;
            let state = scope.bitmapStates.get(bitmap);
            if (!state) {
                const surfaceRecord = ensureBitmapReplaySurface(bitmap);
                state = {
                    id: surfaceRecord && surfaceRecord.surfaceId ? surfaceRecord.surfaceId : `btm-${(++scope.nextBitmapId).toString(36)}`,
                    bitmap,
                    revision: 1,
                    entries: new Map(),
                    renderOps: [],
                    nativeTextOps: new Map(),
                    drawOrderCounter: 0,
                    destroyed: false,
                };
                scope.bitmapStates.set(bitmap, state);
            }
            if (!Array.isArray(state.renderOps)) state.renderOps = [];
            if (!state.entries || typeof state.entries.set !== 'function') state.entries = new Map();
            if (!state.nativeTextOps || typeof state.nativeTextOps.set !== 'function') state.nativeTextOps = new Map();
            return state;
        }

        function ensureBitmapReplaySurface(bitmap) {
            if (!bitmap || !scope.bitmapServices || typeof scope.bitmapServices.getSurfaceLedgerIdentity !== 'function') return null;
            return scope.bitmapServices.getSurfaceLedgerIdentity(bitmap);
        }
        
        function getBitmapState(bitmap) {
            if (!bitmap) return null;
            try { return scope.bitmapStates.get(bitmap) || null; } catch (error) { reportReplayError('state.getBitmapState', error); return null; }
        }
        
        function nextDrawOrder(state) {
            if (!state) return 0;
            state.drawOrderCounter = (state.drawOrderCounter || 0) + 1;
            return state.drawOrderCounter;
        }
        
        function recordBitmapRenderOp(bitmap, op) {
            if (!bitmap || !op || !op.methodName) return null;
            const state = ensureBitmapState(bitmap);
            if (!state) return null;
            const rect = op.rect && isValidRect(op.rect) ? op.rect : null;
            if (!rect) return null;
            const traits = bitmapRenderOps.classifyRenderOp(op.methodName, {
                args: Array.isArray(op.args) ? op.args : [],
                sourceBitmap: op.sourceBitmap,
                targetBitmap: bitmap,
                traits: op.traits || null,
            });
            const record = {
                methodName: op.methodName,
                args: Array.isArray(op.args) ? op.args.slice() : [],
                rect,
                traits,
                sourceBitmap: traits.sourceBitmap || op.sourceBitmap || null,
                drawOrder: nextDrawOrder(state),
                recordedAt: Date.now(),
                drawState: op.drawState || null,
                nativeTextKey: op.nativeTextKey || '',
                textPreview: op.textPreview || '',
                ownerType: op.ownerType || '',
                windowDrawTextExReplay: !!(op.windowDrawTextExReplay || isWindowDrawTextExReplayActive(bitmap)),
            };
            state.renderOps.push(record);
            pruneArray(state.renderOps, MAX_REPLAY_OPS);
            return record;
        }
        
        function recordNativeTextForReplay(entry) {
            if (!entry || !entry.state || !entry.key) return null;
            const rect = deriveEntryRect(entry);
            if (!rect) return null;
            const existing = entry.state.nativeTextOps.get(entry.key);
            const methodName = entry.methodName || 'drawText';
            const op = existing || {};
            Object.assign(op, {
                methodName,
                args: [
                    entry.rawText,
                    entry.drawParams.x,
                    entry.drawParams.y,
                    entry.drawParams.maxWidth,
                    entry.drawParams.lineHeight,
                    entry.drawParams.align,
                ],
                rect,
                drawState: entry.drawState,
                drawOrder: entry.drawOrder,
                recordedAt: Date.now(),
                nativeTextKey: entry.key,
                textPreview: entry.visibleText,
                ownerType: entry.ownerType,
                traits: bitmapRenderOps.classifyRenderOp(methodName),
            });
            if (!existing) {
                entry.state.renderOps.push(op);
                entry.state.nativeTextOps.set(entry.key, op);
                pruneArray(entry.state.renderOps, MAX_REPLAY_OPS);
            }
            return op;
        }
        
        function discardRenderOpsInRect(state, rect) {
            if (!state || !Array.isArray(state.renderOps)) return;
            if (!rect || !isValidRect(rect)) {
                state.renderOps.length = 0;
                if (state.nativeTextOps) state.nativeTextOps.clear();
                return;
            }
            state.renderOps = state.renderOps.filter((op) => {
                const keep = !op || !op.rect || !rectanglesOverlap(op.rect, rect);
                if (!keep && op.nativeTextKey && state.nativeTextOps && state.nativeTextOps.get(op.nativeTextKey) === op) {
                    state.nativeTextOps.delete(op.nativeTextKey);
                }
                return keep;
            });
        }
        
        function withBitmapReplay(bitmap, callback, source = 'bitmap-replay') {
            if (!bitmap || typeof callback !== 'function') return undefined;
            return scope.bitmapServices.withBitmapReplayGuard(bitmap, callback, source || 'bitmap-replay');
        }

        function isWindowDrawTextExReplayActive(bitmap) {
            if (!bitmap || !scope.bitmapServices || typeof scope.bitmapServices.getRenderGuardState !== 'function') return false;
            const state = scope.bitmapServices.getRenderGuardState(bitmap);
            return Number(state && state.windowDrawTextExReplayDepth) > 0;
        }

        function collectReplayItems(state, rect, currentEntry, relation) {
            if (!state || !rect || !isValidRect(rect) || typeof relation !== 'function') return [];
            const items = [];
            state.renderOps.forEach((op) => {
                if (!op || !op.rect || !rectanglesOverlap(rect, op.rect)) return;
                if (!relation(op.drawOrder || 0)) return;
                if (op.nativeTextKey && state.entries && state.entries.has(op.nativeTextKey)) return;
                items.push({ type: 'renderOp', drawOrder: op.drawOrder || 0, op });
            });
            state.entries.forEach((entry) => {
                if (!entry || entry === currentEntry || entry.stale) return;
                const entryRect = deriveEntryRect(entry);
                if (!entryRect || !rectanglesOverlap(rect, entryRect)) return;
                if (!relation(entry.drawOrder || 0)) return;
                items.push({ type: 'text', drawOrder: entry.drawOrder || 0, entry });
            });
            return drawGraph.toReplayItems(drawGraph.createDrawGraph(items));
        }
        
        function replayBitmapItems(bitmap, items) {
            if (!bitmap || !Array.isArray(items) || !items.length) return;
            items.forEach((item) => {
                if (!item) return;
                if (item.type === 'renderOp') replayBitmapRenderOp(bitmap, item.op);
                else if (item.type === 'text') replayBitmapEntry(bitmap, item.entry);
            });
        }
        
        function replayBitmapRenderOp(bitmap, op) {
            if (!bitmap || !op || !op.methodName) return;
            try {
                const traits = bitmapRenderOps.classifyRenderOp(op.methodName, {
                    args: op.args,
                    sourceBitmap: op.sourceBitmap,
                    targetBitmap: bitmap,
                    traits: op.traits || null,
                });
                if (traits.replayable !== true) return;
                if (op.drawState) scope.applyBitmapDrawState(bitmap, op.drawState);
                if (traits.nativeText) {
                    drawBitmapTextArgs(bitmap, op.methodName, op.args, op.drawState);
                    return;
                }
                if (traits.paintsArea) {
                    if (typeof bitmap[op.methodName] === 'function') bitmap[op.methodName](...op.args);
                }
            } catch (error) {
                reportReplayError(`replay.renderOp.${op.methodName}`, error);
            }
        }
        
        function replayBitmapEntry(bitmap, entry) {
            if (!bitmap || !entry || entry.stale) return;
            const text = isEntryCompleted(entry) && entry.renderedText
                ? entry.renderedText
                : entry.rawText;
            drawBitmapTextValue(bitmap, entry, text);
        }
        
        function drawBitmapTextValue(bitmap, entry, text) {
            if (!bitmap || !entry || typeof text !== 'string' || !text) return;
            try { scope.applyBitmapDrawState(bitmap, entry.drawState); } catch (error) { reportReplayError('drawText.applyState', error); }
            const methodName = entry.methodName && typeof bitmap[entry.methodName] === 'function'
                ? entry.methodName
                : 'drawText';
            const args = [
                sanitizeBitmapDrawText(text, methodName),
                entry.drawParams.x,
                entry.drawParams.y,
                entry.drawParams.maxWidth,
                entry.drawParams.lineHeight,
                entry.drawParams.align,
            ];
            drawBitmapTextArgs(bitmap, methodName, args, entry.drawState);
        }
        
        function drawBitmapTextArgs(bitmap, methodName, args) {
            const drawMethodName = typeof bitmap[methodName] === 'function' ? methodName : 'drawText';
            const drawFn = bitmap[drawMethodName] || bitmap.drawText;
            if (typeof drawFn !== 'function') return;
            drawFn.call(bitmap, ...args);
        }
        
        function calculateClearRect(bitmap, entry) {
            const bounds = entry && entry.bounds;
            if (!bitmap || !bounds) return null;
            const outline = entry.drawState && Number.isFinite(Number(entry.drawState.outlineWidth))
                ? Math.max(1, Number(entry.drawState.outlineWidth) + 1)
                : 2;
            const fontSize = positiveNumber(entry.drawState && entry.drawState.fontSize, entry.drawParams && entry.drawParams.lineHeight, 24);
            const topPad = Math.min(outline, Math.ceil(fontSize * 0.08));
            const bottomPad = Math.max(outline, Math.ceil(fontSize * 0.25));
            const x = Math.max(0, Math.floor(bounds.x1 - outline));
            const y = Math.max(0, Math.floor(bounds.y1 - topPad));
            const width = Math.ceil(bounds.x2 - bounds.x1 + outline * 2);
            const height = Math.ceil(bounds.y2 - bounds.y1 + topPad + bottomPad);
            return {
                x,
                y,
                width: Math.min(Math.max(0, Number(bitmap.width) || width), width, Math.max(0, (Number(bitmap.width) || x + width) - x)),
                height: Math.min(Math.max(0, Number(bitmap.height) || height), height, Math.max(0, (Number(bitmap.height) || y + height) - y)),
            };
        }

        function reportReplayError(operation, error) {
            if (typeof scope.reportAdapterError === 'function') {
                scope.reportAdapterError(operation, error);
            }
        }

        return { ensureBitmapState, getBitmapState, nextDrawOrder, recordBitmapRenderOp, recordNativeTextForReplay, discardRenderOpsInRect, withBitmapReplay, collectReplayItems, replayBitmapItems, replayBitmapRenderOp, replayBitmapEntry, drawBitmapTextValue, drawBitmapTextArgs, calculateClearRect };
    }

            return { create: createController };
        },
    });
})();
