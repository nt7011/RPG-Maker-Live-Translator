// Bitmap text adapter support: replay.
// Each controller receives one adapter instance scope from bitmap-text-adapter.js.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    const requireRuntimeModule = globalScope.LiveTranslatorRequire;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before adapters/bitmap-text/replay.js.');
    }
    if (typeof requireRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module require is unavailable before adapters/bitmap-text/replay.js.');
    }
    const bitmapRenderOps = requireRuntimeModule('runtime.bitmapRenderOps');
    const drawGraph = requireRuntimeModule('runtime.drawGraph');

    function createController(scope = {}) {
        const { ADAPTER_ID, ADAPTER_LABEL, SURFACE_TYPE, RENDER_STRATEGY, BITMAP_PRIORITY, DRAW_WRAPPER_TOKEN, MUTATION_WRAPPER_TOKEN, FRAME_FLUSH_TOKEN, SMALL_TEXT_TOKEN, NORMAL_CHAR_TOKEN, MAX_FRAGMENTS, MAX_REPLAY_OPS, GAP_MIN, GAP_RATIO } = scope;
        const { isEntryCompleted, retireEntry } = scope.controllerFacades.records;
        const { sanitizeBitmapDrawText, deriveEntryRect, isValidRect, rectHasArea, rectanglesOverlap, positiveNumber, pruneArray, finiteNumber, stringify } = scope.controllerFacades.textUtils;
        const copiedTargetEntries = new WeakMap();

        function ensureBitmapState(bitmap) {
            if (!bitmap) return null;
            let state = scope.bitmapStates.get(bitmap);
            if (!state) {
                state = {
                    id: bitmap._trBitmapTextId || `btm-${(++scope.nextBitmapId).toString(36)}`,
                    bitmap,
                    revision: 1,
                    fragments: [],
                    entries: new Map(),
                    renderOps: [],
                    nativeTextOps: new Map(),
                    drawOrderCounter: 0,
                    flushQueued: false,
                    destroyed: false,
                };
                scope.bitmapStates.set(bitmap, state);
                try { bitmap._trBitmapTextId = state.id; } catch (_) {}
            }
            if (!Array.isArray(state.fragments)) state.fragments = [];
            if (!Array.isArray(state.renderOps)) state.renderOps = [];
            if (!state.entries || typeof state.entries.set !== 'function') state.entries = new Map();
            if (!state.nativeTextOps || typeof state.nativeTextOps.set !== 'function') state.nativeTextOps = new Map();
            return state;
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
                windowDrawTextExReplay: !!(op.windowDrawTextExReplay || (bitmap && bitmap._trWindowDrawTextExReplayDepth > 0)),
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

        function isUsableBitmap(bitmap) {
            return !!(bitmap
                && Number.isFinite(Number(bitmap.width))
                && Number(bitmap.width) > 0
                && Number.isFinite(Number(bitmap.height))
                && Number(bitmap.height) > 0);
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

        function prepareCopiedBitmapTargetsForMutation(targetBitmap, methodName, mutation = {}) {
            if (!isCopiedBitmapTextMutation(targetBitmap, methodName, mutation)) return [];
            const sourceBitmap = mutation.sourceBitmap || null;
            const sourceRect = cloneValidRect(mutation.sourceRect);
            const targetRect = cloneValidRect(mutation.rect);
            if (!sourceBitmap || sourceBitmap === targetBitmap || !sourceRect || !targetRect) return [];

            const state = getBitmapState(sourceBitmap);
            if (!state || !state.entries || typeof state.entries.forEach !== 'function') return [];

            const prepared = [];
            try {
                state.entries.forEach((entry) => {
                    if (!entry || entry.stale || entry.bitmap !== sourceBitmap) return;
                    if (!isBitmapFallbackEntry(entry)) return;
                    const sourceBounds = cloneValidRect(deriveEntryRect(entry));
                    if (!rectHasArea(sourceBounds) || !rectContainsRect(sourceRect, sourceBounds)) return;
                    const copiedTarget = createCopiedBitmapTarget(entry, targetBitmap, sourceBitmap, sourceRect, targetRect, sourceBounds, methodName);
                    if (copiedTarget) prepared.push({ entry, target: copiedTarget });
                });
            } catch (error) {
                reportReplayError('copiedTargets.prepare', error);
            }
            return prepared;
        }

        function commitCopiedBitmapTargetsForMutation(targetBitmap, methodName, mutation = {}, prepared = []) {
            if (!Array.isArray(prepared) || !prepared.length) return { committed: 0, redrawn: 0 };
            let committed = 0;
            let redrawn = 0;
            prepared.forEach((item) => {
                const entry = item && item.entry;
                const target = item && item.target;
                if (!entry || entry.stale || !isPreparedCopiedBitmapTarget(targetBitmap, target)) return;
                const targets = Array.isArray(entry._trCopiedBitmapTargets)
                    ? entry._trCopiedBitmapTargets.filter((existing) => !sameCopiedBitmapTarget(existing, target))
                    : [];
                targets.push(target);
                entry._trCopiedBitmapTargets = targets.slice(-16);
                registerCopiedTargetEntry(targetBitmap, entry);
                committed += 1;
                if (isEntryCompleted(entry) && entry.renderedText && redrawCopiedBitmapTarget(entry, target, entry.renderedText)) {
                    redrawn += 1;
                }
            });
            return { committed, redrawn };
        }

        function invalidateCopiedBitmapTargetsForMutation(targetBitmap, rect = null, reason = 'bitmap-mutation') {
            if (!targetBitmap) return 0;
            const entries = copiedTargetEntries.get(targetBitmap);
            if (!entries || !entries.size) return 0;
            const targetRect = cloneValidRect(rect);
            let removed = 0;
            Array.from(entries).forEach((entry) => {
                if (!entry || !Array.isArray(entry._trCopiedBitmapTargets)) {
                    entries.delete(entry);
                    return;
                }
                const kept = entry._trCopiedBitmapTargets.filter((target) => {
                    if (!target || target.targetBitmap !== targetBitmap) return true;
                    if (!targetRect || !rectHasArea(targetRect) || !rectHasArea(target.bounds) || rectanglesOverlap(targetRect, target.bounds)) {
                        return false;
                    }
                    return true;
                });
                removed += entry._trCopiedBitmapTargets.length - kept.length;
                if (kept.length) entry._trCopiedBitmapTargets = kept;
                else {
                    delete entry._trCopiedBitmapTargets;
                    entries.delete(entry);
                    retireDetachedCopiedBitmapEntry(entry, reason);
                }
            });
            if (!entries.size) copiedTargetEntries.delete(targetBitmap);
            return removed;
        }

        function hasCopiedBitmapTargetsForBitmap(targetBitmap) {
            const entries = targetBitmap ? copiedTargetEntries.get(targetBitmap) : null;
            return !!(entries && entries.size);
        }

        function redrawCopiedBitmapTargets(entry, translatedText = '') {
            if (!entry || !Array.isArray(entry._trCopiedBitmapTargets) || !entry._trCopiedBitmapTargets.length) return 0;
            const rendered = stringify(translatedText || entry.renderedText || '');
            if (!rendered) return 0;
            let redrawn = 0;
            const kept = [];
            entry._trCopiedBitmapTargets.forEach((target) => {
                if (!isUsableCopiedBitmapTarget(target)) return;
                kept.push(target);
                if (redrawCopiedBitmapTarget(entry, target, rendered)) redrawn += 1;
            });
            if (kept.length) entry._trCopiedBitmapTargets = kept;
            else forgetCopiedBitmapTargets(entry);
            return redrawn;
        }

        function forgetCopiedBitmapTargets(entry) {
            if (!entry || !Array.isArray(entry._trCopiedBitmapTargets)) return 0;
            let removed = 0;
            entry._trCopiedBitmapTargets.forEach((target) => {
                if (!target || !target.targetBitmap) return;
                const entries = copiedTargetEntries.get(target.targetBitmap);
                if (entries) {
                    entries.delete(entry);
                    if (!entries.size) copiedTargetEntries.delete(target.targetBitmap);
                }
                removed += 1;
            });
            delete entry._trCopiedBitmapTargets;
            return removed;
        }

        function retireDetachedCopiedBitmapEntry(entry, reason = 'bitmap-mutation') {
            if (!entry || entry.stale || entry._trSourceDetachedForCopiedTargets !== true) return false;
            if (Array.isArray(entry._trCopiedBitmapTargets)
                && entry._trCopiedBitmapTargets.some((target) => target && target.targetBitmap)) {
                return false;
            }
            try {
                return retireEntry(entry, `${reason || 'bitmap-mutation'}-copied-target-invalidated`, 'stale') === true;
            } catch (error) {
                reportReplayError('copiedTargets.retireDetached', error);
                return false;
            }
        }

        function isCopiedBitmapTextMutation(targetBitmap, methodName, mutation) {
            const method = String(methodName || '');
            return !!(targetBitmap
                && (method === 'blt' || method === 'bltImage')
                && mutation
                && mutation.sourceBitmap
                && mutation.sourceRect
                && mutation.rect);
        }

        function isBitmapFallbackEntry(entry) {
            // Bitmap fallback owns entries by adapter state, not by the game
            // object's constructor name. Window-owned contents can still reach
            // this adapter when no more-specific text path claimed the draw.
            return !!(entry && !entry.ownerWindow);
        }

        function createCopiedBitmapTarget(entry, targetBitmap, sourceBitmap, sourceRect, targetRect, sourceBounds, methodName) {
            if (!entry || !isUsableBitmap(targetBitmap) || !rectHasArea(sourceRect) || !rectHasArea(targetRect) || !rectHasArea(sourceBounds)) return null;
            const sourceWidth = Number(sourceRect.x2) - Number(sourceRect.x1);
            const sourceHeight = Number(sourceRect.y2) - Number(sourceRect.y1);
            const targetWidth = Number(targetRect.x2) - Number(targetRect.x1);
            const targetHeight = Number(targetRect.y2) - Number(targetRect.y1);
            const scaleX = targetWidth / sourceWidth;
            const scaleY = targetHeight / sourceHeight;
            if (!isUnitScale(scaleX) || !isUnitScale(scaleY)) return null;

            const bounds = mapCopiedRect(sourceBounds, sourceRect, targetRect, scaleX, scaleY);
            if (!rectHasArea(bounds)) return null;
            const drawParams = entry.drawParams || {};
            return {
                targetBitmap,
                sourceBitmap,
                sourceRect: cloneValidRect(sourceRect),
                targetRect: cloneValidRect(targetRect),
                sourceBounds: cloneValidRect(sourceBounds),
                bounds,
                drawParams: {
                    x: mapCopiedNumber(drawParams.x, sourceRect.x1, targetRect.x1, scaleX),
                    y: mapCopiedNumber(drawParams.y, sourceRect.y1, targetRect.y1, scaleY),
                    maxWidth: scaleOptionalDimension(drawParams.maxWidth, scaleX),
                    lineHeight: scaleOptionalDimension(drawParams.lineHeight, scaleY),
                    align: drawParams.align,
                },
                drawState: entry.drawState && typeof entry.drawState === 'object'
                    ? Object.assign({}, entry.drawState)
                    : null,
                backgroundPatches: mapCopiedBackgroundPatches(entry.backgroundPatches, sourceRect, targetRect, scaleX, scaleY),
                methodName: String(methodName || 'blt'),
                createdAt: Date.now(),
            };
        }

        function redrawCopiedBitmapTarget(entry, target, renderedText) {
            if (!entry || !isUsableCopiedBitmapTarget(target) || !renderedText) return false;
            const targetBitmap = target.targetBitmap;
            const copiedEntry = createCopiedBitmapEntry(entry, target);
            if (!copiedEntry) return false;
            try {
                withBitmapReplay(targetBitmap, () => {
                    if (target.bounds && typeof targetBitmap.clearRect === 'function') {
                        targetBitmap.clearRect(
                            target.bounds.x1,
                            target.bounds.y1,
                            target.bounds.x2 - target.bounds.x1,
                            target.bounds.y2 - target.bounds.y1
                        );
                    }
                    const restored = restoreCopiedBitmapTargetBackground(targetBitmap, target);
                    drawBitmapTextValue(targetBitmap, copiedEntry, renderedText);
                }, 'bitmap-copy-target-redraw');
                markBitmapPixelsDirty(targetBitmap);
                target.lastRenderedText = String(renderedText);
                target.lastRenderedAt = Date.now();
                return true;
            } catch (error) {
                reportReplayError('copiedTargets.redraw', error);
                return false;
            }
        }

        function createCopiedBitmapEntry(entry, target) {
            if (!entry || !target || !isUsableBitmap(target.targetBitmap)) return null;
            return Object.assign(Object.create(entry), {
                bitmap: target.targetBitmap,
                state: null,
                drawParams: Object.assign({}, entry.drawParams || {}, target.drawParams || {}),
                drawState: target.drawState || entry.drawState || null,
                bounds: target.bounds || entry.bounds || null,
                methodName: entry.methodName || 'drawText',
                ownerType: 'Bitmap',
            });
        }

        function restoreCopiedBitmapTargetBackground(targetBitmap, target) {
            if (!targetBitmap || !target || !Array.isArray(target.backgroundPatches) || !target.backgroundPatches.length) return 0;
            let restored = 0;
            target.backgroundPatches.forEach((patch) => {
                if (!patch || !patch.bitmap || typeof targetBitmap.blt !== 'function') return;
                try {
                    targetBitmap.blt(
                        patch.bitmap,
                        0,
                        0,
                        patch.sourceWidth,
                        patch.sourceHeight,
                        patch.x,
                        patch.y,
                        patch.width,
                        patch.height
                    );
                    restored += 1;
                } catch (_) {}
            });
            return restored;
        }

        function isPreparedCopiedBitmapTarget(targetBitmap, target) {
            return !!(target
                && target.targetBitmap === targetBitmap
                && isUsableCopiedBitmapTarget(target));
        }

        function sameCopiedBitmapTarget(left, right) {
            return !!(left && right
                && left.targetBitmap === right.targetBitmap
                && sameRect(left.bounds, right.bounds));
        }

        function isUsableCopiedBitmapTarget(target) {
            return !!(target
                && isUsableBitmap(target.targetBitmap)
                && rectHasArea(target.bounds)
                && target.drawParams
                && Number.isFinite(Number(target.drawParams.x))
                && Number.isFinite(Number(target.drawParams.y)));
        }

        function registerCopiedTargetEntry(targetBitmap, entry) {
            if (!targetBitmap || !entry) return;
            let entries = copiedTargetEntries.get(targetBitmap);
            if (!entries) {
                entries = new Set();
                copiedTargetEntries.set(targetBitmap, entries);
            }
            entries.add(entry);
        }

        function mapCopiedBackgroundPatches(patches, sourceRect, targetRect, scaleX, scaleY) {
            const list = Array.isArray(patches) ? patches : [];
            return list.map((patch) => {
                if (!patch || !patch.bitmap) return null;
                if (patch.trusted === false) return null;
                const width = positiveNumber(patch.width, patch.bitmap && patch.bitmap.width, 0);
                const height = positiveNumber(patch.height, patch.bitmap && patch.bitmap.height, 0);
                const patchRect = {
                    x1: finiteNumber(patch.x, 0),
                    y1: finiteNumber(patch.y, 0),
                    x2: finiteNumber(patch.x, 0) + width,
                    y2: finiteNumber(patch.y, 0) + height,
                };
                if (!rectHasArea(patchRect) || !rectContainsRect(sourceRect, patchRect)) return null;
                return {
                    bitmap: patch.bitmap,
                    sourceWidth: width,
                    sourceHeight: height,
                    x: mapCopiedNumber(patchRect.x1, sourceRect.x1, targetRect.x1, scaleX),
                    y: mapCopiedNumber(patchRect.y1, sourceRect.y1, targetRect.y1, scaleY),
                    width: width * scaleX,
                    height: height * scaleY,
                    trusted: patch.trusted === true,
                };
            }).filter(Boolean);
        }

        function mapCopiedRect(rect, sourceRect, targetRect, scaleX, scaleY) {
            if (!rectHasArea(rect)) return null;
            return {
                x1: mapCopiedNumber(rect.x1, sourceRect.x1, targetRect.x1, scaleX),
                y1: mapCopiedNumber(rect.y1, sourceRect.y1, targetRect.y1, scaleY),
                x2: mapCopiedNumber(rect.x2, sourceRect.x1, targetRect.x1, scaleX),
                y2: mapCopiedNumber(rect.y2, sourceRect.y1, targetRect.y1, scaleY),
            };
        }

        function mapCopiedNumber(value, sourceOrigin, targetOrigin, scale) {
            const number = Number(value);
            const source = Number(sourceOrigin);
            const target = Number(targetOrigin);
            const ratio = Number(scale);
            if (![number, source, target, ratio].every(Number.isFinite)) return number;
            return target + ((number - source) * ratio);
        }

        function scaleOptionalDimension(value, scale) {
            const number = Number(value);
            if (!Number.isFinite(number) || number <= 0 || value === Infinity) return value;
            const ratio = Number(scale);
            return Number.isFinite(ratio) && ratio > 0 ? number * ratio : number;
        }

        function rectContainsRect(outer, inner) {
            if (!rectHasArea(outer) || !rectHasArea(inner)) return false;
            return Number(inner.x1) >= Number(outer.x1)
                && Number(inner.y1) >= Number(outer.y1)
                && Number(inner.x2) <= Number(outer.x2)
                && Number(inner.y2) <= Number(outer.y2);
        }

        function cloneValidRect(rect) {
            if (!isValidRect(rect)) return null;
            return {
                x1: Number(rect.x1),
                y1: Number(rect.y1),
                x2: Number(rect.x2),
                y2: Number(rect.y2),
            };
        }

        function sameRect(left, right) {
            const a = cloneValidRect(left);
            const b = cloneValidRect(right);
            if (!a || !b) return false;
            return a.x1 === b.x1 && a.y1 === b.y1 && a.x2 === b.x2 && a.y2 === b.y2;
        }

        function isUnitScale(value) {
            const number = Number(value);
            return Number.isFinite(number) && Math.abs(number - 1) < 0.000001;
        }

        function markBitmapPixelsDirty(bitmap) {
            if (!bitmap) return;
            try {
                if (typeof bitmap._setDirty === 'function') {
                    bitmap._setDirty();
                }
            } catch (_) {}
            try { bitmap._dirty = true; } catch (_) {}
            markBitmapBaseTextureDirty(bitmap);
        }

        function markBitmapBaseTextureDirty(bitmap) {
            const candidates = [
                bitmap && bitmap._baseTexture,
                bitmap && bitmap.baseTexture,
                bitmap && bitmap._texture && bitmap._texture.baseTexture,
            ];
            candidates.forEach((baseTexture) => {
                if (!baseTexture || typeof baseTexture.update !== 'function') return;
                try { baseTexture.update(); } catch (_) {}
            });
        }

        function reportReplayError(operation, error) {
            if (typeof scope.reportAdapterError === 'function') {
                scope.reportAdapterError(operation, error);
            }
        }

        return { ensureBitmapState, getBitmapState, nextDrawOrder, recordBitmapRenderOp, recordNativeTextForReplay, discardRenderOpsInRect, withBitmapReplay, collectReplayItems, replayBitmapItems, replayBitmapRenderOp, replayBitmapEntry, drawBitmapTextValue, drawBitmapTextArgs, calculateClearRect, prepareCopiedBitmapTargetsForMutation, commitCopiedBitmapTargetsForMutation, invalidateCopiedBitmapTargetsForMutation, hasCopiedBitmapTargetsForBitmap, redrawCopiedBitmapTargets, forgetCopiedBitmapTargets, markBitmapPixelsDirty };
    }

    defineRuntimeModule('adapters.bitmapTextReplay', { create: createController });
})();
