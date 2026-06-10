// Window text adapter support: bitmap replay.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    const requireRuntimeModule = globalScope.LiveTranslatorRequire;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before adapters/window-text/bitmap-replay.js.');
    }
    if (typeof requireRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module require is unavailable before adapters/window-text/bitmap-replay.js.');
    }
    const bitmapDiagnostics = requireRuntimeModule('adapters.windowTextBitmapDiagnostics');
    const drawGraph = requireRuntimeModule('runtime.drawGraph');
    const replayFilter = requireRuntimeModule('runtime.replayFilter');

    function createBitmapReplayController(context = {}) {
    const { entryLifecycleState } = context;
    const { replay: replayService, surface: surfaceService, draw: drawService } = context.services;
    const { entryRecords, renderDraw, textConversion } = context.facades;
    const { getEntryStatus, isEntryCompleted, firstNonEmptyString } = entryRecords;
    const { drawTranslatedEntry, drawTranslatedWindowText } = renderDraw;
    const { sanitizeDrawTextOutput } = textConversion;
    const bitmapTools = bitmapDiagnostics.create(context);
    const { mergeBounds, isValidRect, roundDiagnosticNumber, cloneDiagnosticRect, cloneDiagnosticArea, calculateBitmapSurfaceTextYOffset, estimateBitmapSurfaceTextBounds, createClearRectFromArea, getReplayItemRect, mergeReplayRect, expandReplayDirtyRect, replayRectsOverlap, getBitmapCanvasContext, supportsBitmapReplayClip, getReplayClipArea, getBitmapSnapshotContext, getEntryContentsRevision, getSnapshotContentsRevision, getWindowDataContentsRevision, getEntrySnapshotPadding, getSnapshotArea, getSnapshotDiagnostics, summarizeReplayItemsForDiagnostics, summarizeReplayStateForDiagnostics } = bitmapTools;
    const replayFilterService = replayFilter.create({
                getItemRect: getReplayItemRect,
                getEntryStatus,
                isEntryCompleted,
                firstNonEmptyString,
            });
    
    
    
    
    
    
    function withWindowRedrawClear(contents, callback) {
                if (!contents || typeof callback !== 'function') return undefined;
                contents._trWindowRedrawClearDepth = (contents._trWindowRedrawClearDepth || 0) + 1;
                try {
                    return callback();
                } finally {
                    contents._trWindowRedrawClearDepth = Math.max(0, (contents._trWindowRedrawClearDepth || 1) - 1);
                }
            }
    
    function withWindowContents(windowInstance, contents, callback) {
                if (!windowInstance || !contents || typeof callback !== 'function') return undefined;
                if (windowInstance.contents === contents) return callback();
                const previous = windowInstance.contents;
                const hasInstalledAccessor = windowInstance._trWindowContentsAccessorInstalled === true
                    && Object.prototype.hasOwnProperty.call(windowInstance, '_trWindowContentsValue');
                try {
                    if (hasInstalledAccessor) windowInstance._trWindowContentsValue = contents;
                    else windowInstance.contents = contents;
                    return callback();
                } finally {
                    if (hasInstalledAccessor) windowInstance._trWindowContentsValue = previous;
                    else windowInstance.contents = previous;
                }
            }
    
    function isUsableBitmap(bitmap) {
                return !!(bitmap
                    && Number.isFinite(Number(bitmap.width))
                    && Number(bitmap.width) > 0
                    && Number.isFinite(Number(bitmap.height))
                    && Number(bitmap.height) > 0);
            }
    
    function getRedrawContents(windowInstance, entry = null) {
                if (windowInstance && isUsableBitmap(windowInstance.contents)) return windowInstance.contents;
                return null;
            }
    
    function wasDrawnToDetachedContents(windowInstance, entry) {
                return !!(windowInstance
                    && entry
                    && isUsableBitmap(entry.contentsBitmap)
                    && isUsableBitmap(windowInstance.contents)
                    && entry.contentsBitmap !== windowInstance.contents);
            }
    
    function isTransientRefreshWindow(windowInstance, windowType) {
                const type = String(windowType || '');
                if (/Window_(?:BattleLog|ScrollText|MapName|NameBox)/.test(type)) return true;
                if (/Log/u.test(type)) return true;
                try {
                    const hasLogBuffers = Array.isArray(windowInstance && windowInstance._lines)
                        || Array.isArray(windowInstance && windowInstance._logs);
                    const hasLogMethods = typeof (windowInstance && windowInstance.drawLineText) === 'function'
                        || typeof (windowInstance && windowInstance.addText) === 'function'
                        || typeof (windowInstance && windowInstance.push) === 'function';
                    if (hasLogBuffers && hasLogMethods) return true;
                    if (Array.isArray(windowInstance && windowInstance._methods)
                        && typeof (windowInstance && windowInstance.callNextMethod) === 'function') {
                        return true;
                    }
                } catch (_) {}
                return false;
            }
    
    function isCoreRefreshWindowType(windowType) {
                return /^Window_(?:ActorCommand|BattleActor|BattleEnemy|BattleItem|BattleSkill|BattleStatus|ChoiceList|Command|DebugEdit|DebugRange|EquipCommand|EquipItem|EquipSlot|EquipStatus|EventItem|GameEnd|Gold|HorzCommand|ItemCategory|ItemList|MenuActor|MenuCommand|MenuStatus|NameEdit|NameInput|NumberInput|Options|PartyCommand|SavefileList|ShopBuy|ShopCommand|ShopNumber|ShopSell|ShopStatus|SkillList|SkillStatus|SkillType|Status|StatusBase|StatusEquip|StatusParams|TitleCommand)$/u.test(String(windowType || ''));
            }
    
    function getBitmapReplayApi() {
                try {
                    const api = replayService.bitmapReplay;
                    if (!api || typeof api !== 'object') return null;
                    if (typeof api.hasProvider !== 'function' || api.hasProvider() !== true) return null;
                    if (typeof api.ensureBitmapState !== 'function'
                        || typeof api.nextDrawOrder !== 'function'
                        || typeof api.collectReplayItems !== 'function'
                        || typeof api.replayBitmapItems !== 'function'
                        || typeof api.withBitmapReplay !== 'function'
                        || typeof api.rectFromDimensions !== 'function') {
                        return null;
                    }
                    return api;
                } catch (_) {
                    return null;
                }
            }
    
    function assignWindowTextDrawOrder(contents, entry) {
                if (!contents || !entry) return;
                const replayApi = getBitmapReplayApi();
                if (!replayApi) return;
                try {
                    const state = replayApi.ensureBitmapState(contents);
                    if (state) entry.drawOrder = replayApi.nextDrawOrder(state);
                } catch (_) {}
            }
    
    function captureWindowEntrySource(contents, entry) {
                return captureWindowEntryPixelSnapshot(contents, entry, 'sourceSnapshot');
            }

    function restoreWindowEntrySource(contents, entry, windowData = null) {
                return restoreWindowEntryPixelSnapshot(contents, entry, 'sourceSnapshot', windowData);
            }

    function restoreEntriesForBitmapMutation(bitmap, rect = null, reason = 'bitmap-mutation-source') {
                const match = resolveBitmapWindowData(bitmap);
                if (!match || !match.windowData || !match.windowData.texts || typeof match.windowData.texts.forEach !== 'function') return 0;
                const restored = [];
                try {
                    match.windowData.texts.forEach((entry) => {
                        if (!entry || entryLifecycleState.isStale(entry) || !windowEntryBelongsToContents(entry, bitmap)) return;
                        if (!isEntryCompleted(entry)) return;
                        const bounds = getWindowEntrySnapshotBounds(bitmap, entry) || entry.bounds;
                        if (rect && bounds && !replayRectsOverlap(rect, bounds)) return;
                        let didRestore = restoreWindowEntrySource(bitmap, entry, match.windowData);
                        let fallback = '';
                        if (!didRestore && restoreWindowEntryBackground(bitmap, entry, match.windowData)) {
                            didRestore = true;
                            fallback = 'background';
                        }
                        if (!didRestore) return;
                        entry._trSourceRestoredForMutation = {
                            reason: String(reason || 'bitmap-mutation-source'),
                            fallback,
                            at: Date.now(),
                        };
                        restored.push(entry);
                    });
                } catch (_) {}
                return restored.length;
            }

    function redrawRestoredEntriesForBitmapMutation(bitmap, reason = 'bitmap-mutation-source') {
                const match = resolveBitmapWindowData(bitmap);
                if (!match || !match.windowInstance || !match.windowData || !match.windowData.texts || typeof match.windowData.texts.forEach !== 'function') return 0;
                const entries = [];
                try {
                    match.windowData.texts.forEach((entry) => {
                        if (!entry || !entry._trSourceRestoredForMutation) return;
                        entries.push(entry);
                    });
                } catch (_) {}
                let redrawn = 0;
                entries.forEach((entry) => {
                    try { delete entry._trSourceRestoredForMutation; } catch (_) { entry._trSourceRestoredForMutation = null; }
                    if (!entry || entryLifecycleState.isStale(entry) || !windowEntryBelongsToContents(entry, bitmap)) return;
                    if (!isEntryCompleted(entry)) return;
                    if (drawTranslatedEntry(match.windowInstance, match.windowData, bitmap, entry)) {
                        redrawn += 1;
                    }
                });
                return redrawn;
            }

    function prepareCopiedTargetsForBitmapMutation(targetBitmap, methodName, mutation = {}) {
                if (!isCopiedWindowTextMutation(targetBitmap, methodName, mutation)) return [];
                const sourceBitmap = mutation.sourceBitmap || null;
                const sourceRect = cloneValidReplayRect(mutation.sourceRect);
                const targetRect = cloneValidReplayRect(mutation.rect);
                if (!sourceBitmap || sourceBitmap === targetBitmap || !sourceRect || !targetRect) return [];

                const match = resolveBitmapWindowData(sourceBitmap);
                if (!match || !match.windowData || !match.windowData.texts || typeof match.windowData.texts.forEach !== 'function') return [];

                const prepared = [];
                try {
                    match.windowData.texts.forEach((entry) => {
                        if (!entry || entryLifecycleState.isStale(entry) || !windowEntryBelongsToContents(entry, sourceBitmap)) return;
                        const sourceBounds = getWindowEntrySnapshotBounds(sourceBitmap, entry) || entry.bounds;
                        const copiedSourceBounds = clipRectToBitmap(sourceBounds, sourceBitmap);
                        if (!rectHasArea(copiedSourceBounds) || !rectContainsRect(sourceRect, copiedSourceBounds)) return;
                        const copiedTarget = createCopiedRenderTarget(entry, targetBitmap, sourceBitmap, sourceRect, targetRect, copiedSourceBounds, methodName);
                        if (copiedTarget) prepared.push({ entry, target: copiedTarget });
                    });
                } catch (_) {}
                return prepared;
            }

    function commitCopiedTargetsForBitmapMutation(targetBitmap, methodName, mutation = {}, prepared = []) {
                if (!Array.isArray(prepared) || !prepared.length) return { committed: 0, redrawn: 0 };
                let committed = 0;
                let redrawn = 0;
                prepared.forEach((item) => {
                    const entry = item && item.entry;
                    const target = item && item.target;
                    if (!entry || entryLifecycleState.isStale(entry) || !isCopiedRenderTargetCurrent(targetBitmap, methodName, mutation, target)) return;
                    const targets = Array.isArray(entry._trCopiedRenderTargets)
                        ? entry._trCopiedRenderTargets.filter((existing) => !sameCopiedTargetRegion(existing, target))
                        : [];
                    targets.push(target);
                    entry._trCopiedRenderTargets = targets.slice(-16);
                    committed += 1;
                    if (isEntryCompleted(entry) && entry.renderedText && redrawCopiedWindowTextTarget(entry, target, entry.renderedText)) {
                        redrawn += 1;
                    }
                });
                return { committed, redrawn };
            }

    function invalidateCopiedTargetsForBitmapMutation(targetBitmap, rect = null, reason = 'bitmap-mutation') {
                if (!targetBitmap) return 0;
                let removed = 0;
                surfaceService.forEachRegisteredWindow((windowInstance) => {
                    const windowData = surfaceService.getWindowData(windowInstance);
                    if (!windowData || !windowData.texts || typeof windowData.texts.forEach !== 'function') return;
                    try {
                        windowData.texts.forEach((entry) => {
                            if (!entry || !Array.isArray(entry._trCopiedRenderTargets) || !entry._trCopiedRenderTargets.length) return;
                            const kept = entry._trCopiedRenderTargets.filter((target) => {
                                if (!target || target.targetBitmap !== targetBitmap) return true;
                                if (!rect || !rectHasArea(rect) || !rectHasArea(target.bounds) || replayRectsOverlap(rect, target.bounds)) {
                                    return false;
                                }
                                return true;
                            });
                            removed += entry._trCopiedRenderTargets.length - kept.length;
                            if (kept.length) entry._trCopiedRenderTargets = kept;
                            else delete entry._trCopiedRenderTargets;
                        });
                    } catch (_) {}
                });
                return removed;
            }

    function hasCopiedTargetsForBitmap(targetBitmap) {
                if (!targetBitmap) return false;
                let found = false;
                surfaceService.forEachRegisteredWindow((windowInstance) => {
                    if (found) return;
                    const windowData = surfaceService.getWindowData(windowInstance);
                    if (!windowData || !windowData.texts || typeof windowData.texts.forEach !== 'function') return;
                    try {
                        windowData.texts.forEach((entry) => {
                            if (found || !entry || !Array.isArray(entry._trCopiedRenderTargets)) return;
                            found = entry._trCopiedRenderTargets.some((target) => target && target.targetBitmap === targetBitmap);
                        });
                    } catch (_) {}
                });
                return found;
            }

    function redrawCopiedWindowTextTargets(entry, translatedText = '', options = {}) {
                if (!entry || !Array.isArray(entry._trCopiedRenderTargets) || !entry._trCopiedRenderTargets.length) return 0;
                const rendered = sanitizeDrawTextOutput(translatedText || entry.renderedText || '', entry.type);
                if (!rendered) return 0;
                let redrawn = 0;
                const kept = [];
                entry._trCopiedRenderTargets.forEach((target) => {
                    if (!isUsableCopiedRenderTarget(target)) return;
                    kept.push(target);
                    if (redrawCopiedWindowTextTarget(entry, target, rendered, options)) redrawn += 1;
                });
                if (kept.length) entry._trCopiedRenderTargets = kept;
                else delete entry._trCopiedRenderTargets;
                return redrawn;
            }

    function isCopiedWindowTextMutation(targetBitmap, methodName, mutation) {
                const method = String(methodName || '');
                return !!(targetBitmap
                    && (method === 'blt' || method === 'bltImage')
                    && mutation
                    && mutation.sourceBitmap
                    && mutation.sourceRect
                    && mutation.rect);
            }

    function createCopiedRenderTarget(entry, targetBitmap, sourceBitmap, sourceRect, targetRect, sourceBounds, methodName) {
                if (!entry || !isUsableBitmap(targetBitmap) || !rectHasArea(sourceRect) || !rectHasArea(targetRect) || !rectHasArea(sourceBounds)) return null;
                const sourceWidth = Number(sourceRect.x2) - Number(sourceRect.x1);
                const sourceHeight = Number(sourceRect.y2) - Number(sourceRect.y1);
                const targetWidth = Number(targetRect.x2) - Number(targetRect.x1);
                const targetHeight = Number(targetRect.y2) - Number(targetRect.y1);
                const scaleX = targetWidth / sourceWidth;
                const scaleY = targetHeight / sourceHeight;
                if (!Number.isFinite(scaleX) || !Number.isFinite(scaleY) || scaleX <= 0 || scaleY <= 0) return null;

                const bounds = mapCopiedRect(sourceBounds, sourceRect, targetRect, scaleX, scaleY);
                if (!rectHasArea(bounds)) return null;
                const position = entry.position || {};
                const params = entry.originalParams || {};
                const drawState = entry.drawState && typeof entry.drawState === 'object'
                    ? Object.assign({}, entry.drawState)
                    : null;
                return {
                    targetBitmap,
                    sourceBitmap,
                    sourceRect: cloneValidReplayRect(sourceRect),
                    targetRect: cloneValidReplayRect(targetRect),
                    sourceBounds: cloneValidReplayRect(sourceBounds),
                    bounds,
                    position: {
                        x: mapCopiedNumber(position.x, sourceRect.x1, targetRect.x1, scaleX),
                        y: mapCopiedNumber(position.y, sourceRect.y1, targetRect.y1, scaleY),
                    },
                    params: {
                        maxWidth: scaleOptionalDimension(params.maxWidth, scaleX),
                        lineHeight: scaleOptionalDimension(params.lineHeight, scaleY),
                        align: params.align,
                    },
                    drawState,
                    scaleX,
                    scaleY,
                    methodName: String(methodName || 'blt'),
                    backgroundSnapshot: createCopiedTargetBackgroundSnapshot(entry, targetBitmap, sourceRect, targetRect, scaleX, scaleY),
                    createdAt: Date.now(),
                };
            }

    function redrawCopiedWindowTextTarget(entry, target, renderedText, options = {}) {
                if (!entry || !isUsableCopiedRenderTarget(target) || !renderedText) return false;
                const targetBitmap = target.targetBitmap;
                const position = target.position || {};
                const params = target.params || {};
                const drawX = normalizeCopiedCoordinate(position.x);
                const drawY = normalizeCopiedCoordinate(position.y);
                if (drawX === null || drawY === null) return false;
                restoreCopiedTargetBackground(targetBitmap, target);
                const previousDrawState = drawService.captureBitmapDrawState
                    ? drawService.captureBitmapDrawState(targetBitmap)
                    : null;
                const drawState = target.drawState || entry.drawState || null;
                try {
                    if (drawState && drawService.applyBitmapDrawState) drawService.applyBitmapDrawState(targetBitmap, drawState);
                    if (entry.type === 'drawTextEx' && redrawCopiedRichWindowTextTarget(entry, target, renderedText, options)) {
                        return true;
                    }
                    const sourceYOffset = calculateBitmapSurfaceTextYOffset(entry.contentsBitmap || target.sourceBitmap, entry, renderedText);
                    const yOffset = Number.isFinite(Number(sourceYOffset)) ? Number(sourceYOffset) * (Number(target.scaleY) || 1) : 0;
                    withCopiedTargetDrawGuard(targetBitmap, () => {
                        targetBitmap.drawText(
                            renderedText,
                            drawX,
                            drawY + yOffset,
                            params.maxWidth,
                            params.lineHeight,
                            params.align
                        );
                    });
                    markBitmapPixelsDirty(targetBitmap);
                    target.lastRenderedText = String(renderedText);
                    target.lastRenderedAt = Date.now();
                    return true;
                } catch (_) {
                    return false;
                } finally {
                    if (previousDrawState && drawService.applyBitmapDrawState) {
                        try { drawService.applyBitmapDrawState(targetBitmap, previousDrawState); } catch (_) {}
                    }
                }
            }

    function redrawCopiedRichWindowTextTarget(entry, target, renderedText, options = {}) {
                if (!entry || !target || !renderedText || typeof drawTranslatedWindowText !== 'function') return false;
                const targetWindow = entry.ownerWindow || null;
                const targetBitmap = target.targetBitmap || null;
                if (!targetWindow || !targetBitmap || typeof targetWindow.processCharacter !== 'function') return false;
                const copiedEntry = createCopiedRenderEntry(entry, target);
                if (!copiedEntry) return false;
                let result = false;
                withCopiedTargetDrawGuard(targetBitmap, () => {
                    result = drawTranslatedWindowText(targetWindow, targetBitmap, copiedEntry, renderedText, {
                        route: 'copiedTarget',
                        targetRole: 'copied-render-target',
                        textFit: mapCopiedTextFit(options && options.textFit, target),
                    });
                });
                if (!(result && result.accepted === true)) return false;
                markBitmapPixelsDirty(targetBitmap);
                target.lastRenderedText = String(renderedText);
                target.lastRenderedAt = Date.now();
                return true;
            }

    function createCopiedRenderEntry(entry, target) {
                if (!entry || !target || !isUsableBitmap(target.targetBitmap)) return null;
                const copiedEntry = Object.create(entry);
                copiedEntry.position = Object.assign({}, entry.position || {}, target.position || {});
                copiedEntry.originalParams = Object.assign({}, entry.originalParams || {}, target.params || {});
                copiedEntry.drawState = target.drawState || entry.drawState || null;
                copiedEntry.contentsBitmap = target.targetBitmap;
                copiedEntry.bounds = target.bounds || entry.bounds || null;
                copiedEntry.renderedBounds = target.bounds || entry.renderedBounds || null;
                copiedEntry.sourceContentsBitmap = target.targetBitmap;
                copiedEntry.sourceContentsRole = 'copied-render-target';
                return copiedEntry;
            }

    function mapCopiedTextFit(textFit, target) {
                if (!textFit || textFit.applied !== true || !target) return textFit || null;
                const sourceRect = target.sourceRect || null;
                const targetRect = target.targetRect || null;
                const scaleX = Number(target.scaleX);
                const originX = Number(textFit.originX);
                const mapped = Object.assign({}, textFit);
                if (Number.isFinite(originX)
                    && Number.isFinite(scaleX)
                    && sourceRect
                    && targetRect) {
                    mapped.originX = mapCopiedNumber(originX, sourceRect.x1, targetRect.x1, scaleX);
                }
                if (Number.isFinite(Number(mapped.safeMaxWidth)) && Number.isFinite(scaleX)) {
                    mapped.safeMaxWidth = Number(mapped.safeMaxWidth) * scaleX;
                }
                if (Number.isFinite(Number(mapped.naturalWidth)) && Number.isFinite(scaleX)) {
                    mapped.naturalWidth = Number(mapped.naturalWidth) * scaleX;
                }
                if (Number.isFinite(Number(mapped.gap)) && Number.isFinite(scaleX)) {
                    mapped.gap = Number(mapped.gap) * scaleX;
                }
                return mapped;
            }

    function withCopiedTargetDrawGuard(bitmap, callback) {
                const api = replayService && replayService.bitmapDraws;
                if (api && typeof api.withWindowPipelineGuard === 'function') {
                    return api.withWindowPipelineGuard(bitmap, callback, 'window-copy-target-redraw');
                }
                return typeof callback === 'function' ? callback() : undefined;
            }

    function restoreCopiedTargetBackground(targetBitmap, target) {
                const snapshot = target && target.backgroundSnapshot;
                if (!snapshot || snapshot.contentsBitmap !== targetBitmap || !snapshot.imageData) return false;
                const canvasContext = getBitmapSnapshotContext(targetBitmap);
                if (!canvasContext || typeof canvasContext.putImageData !== 'function') return false;
                try {
                    canvasContext.putImageData(snapshot.imageData, snapshot.x, snapshot.y);
                    markBitmapPixelsDirty(targetBitmap);
                    return true;
                } catch (_) {
                    return false;
                }
            }

    function createCopiedTargetBackgroundSnapshot(entry, targetBitmap, sourceRect, targetRect, scaleX, scaleY) {
                const sourceSnapshot = entry && entry.backgroundSnapshot;
                if (!sourceSnapshot || !sourceSnapshot.imageData || !isUsableBitmap(targetBitmap)) return null;
                if (!isUnitScale(scaleX) || !isUnitScale(scaleY)) return null;
                const sourceArea = {
                    x1: Number(sourceSnapshot.x),
                    y1: Number(sourceSnapshot.y),
                    x2: Number(sourceSnapshot.x) + Number(sourceSnapshot.w),
                    y2: Number(sourceSnapshot.y) + Number(sourceSnapshot.h),
                };
                if (!rectHasArea(sourceArea) || !rectContainsRect(sourceRect, sourceArea)) return null;
                const mappedArea = mapCopiedRect(sourceArea, sourceRect, targetRect, scaleX, scaleY);
                if (!rectHasArea(mappedArea)) return null;
                return {
                    contentsBitmap: targetBitmap,
                    x: mappedArea.x1,
                    y: mappedArea.y1,
                    w: mappedArea.x2 - mappedArea.x1,
                    h: mappedArea.y2 - mappedArea.y1,
                    bounds: cloneDiagnosticRect(mappedArea),
                    capturedAt: Date.now(),
                    imageData: sourceSnapshot.imageData,
                    fromCopiedSourceSnapshot: true,
                };
            }

    function isCopiedRenderTargetCurrent(targetBitmap, methodName, mutation, target) {
                if (!target || target.targetBitmap !== targetBitmap) return false;
                if (String(target.methodName || '') !== String(methodName || '')) return false;
                if (!sameReplayRect(target.targetRect, mutation && mutation.rect)) return false;
                if (!sameReplayRect(target.sourceRect, mutation && mutation.sourceRect)) return false;
                return isUsableCopiedRenderTarget(target);
            }

    function isUsableCopiedRenderTarget(target) {
                return !!(target && isUsableBitmap(target.targetBitmap) && rectHasArea(target.bounds));
            }

    function sameCopiedTargetRegion(a, b) {
                return !!(a && b && a.targetBitmap === b.targetBitmap && replayRectsOverlap(a.bounds, b.bounds));
            }

    function sameReplayRect(a, b) {
                const left = cloneValidReplayRect(a);
                const right = cloneValidReplayRect(b);
                if (!left || !right) return false;
                return left.x1 === right.x1 && left.y1 === right.y1 && left.x2 === right.x2 && left.y2 === right.y2;
            }

    function cloneValidReplayRect(rect) {
                if (!rect || !isValidRect(rect)) return null;
                return {
                    x1: Number(rect.x1),
                    y1: Number(rect.y1),
                    x2: Number(rect.x2),
                    y2: Number(rect.y2),
                };
            }

    function rectHasArea(rect) {
                return !!(rect && isValidRect(rect) && Number(rect.x2) > Number(rect.x1) && Number(rect.y2) > Number(rect.y1));
            }

    function rectContainsRect(outer, inner) {
                return !!(rectHasArea(outer)
                    && rectHasArea(inner)
                    && Number(inner.x1) >= Number(outer.x1)
                    && Number(inner.y1) >= Number(outer.y1)
                    && Number(inner.x2) <= Number(outer.x2)
                    && Number(inner.y2) <= Number(outer.y2));
            }

    function isUnitScale(value) {
                const number = Number(value);
                return Number.isFinite(number) && Math.abs(number - 1) < 0.000001;
            }

    function clipRectToBitmap(rect, bitmap) {
                if (!rectHasArea(rect) || !isUsableBitmap(bitmap)) return null;
                const clipped = {
                    x1: Math.max(Number(rect.x1), 0),
                    y1: Math.max(Number(rect.y1), 0),
                    x2: Math.min(Number(rect.x2), Number(bitmap.width)),
                    y2: Math.min(Number(rect.y2), Number(bitmap.height)),
                };
                return rectHasArea(clipped) ? clipped : null;
            }

    function mapCopiedRect(rect, sourceRect, targetRect, scaleX, scaleY) {
                return {
                    x1: mapCopiedNumber(rect.x1, sourceRect.x1, targetRect.x1, scaleX),
                    y1: mapCopiedNumber(rect.y1, sourceRect.y1, targetRect.y1, scaleY),
                    x2: mapCopiedNumber(rect.x2, sourceRect.x1, targetRect.x1, scaleX),
                    y2: mapCopiedNumber(rect.y2, sourceRect.y1, targetRect.y1, scaleY),
                };
            }

    function mapCopiedNumber(value, sourceStart, targetStart, scale) {
                const number = Number(value);
                const source = Number(sourceStart);
                const target = Number(targetStart);
                const ratio = Number(scale);
                if (![number, source, target, ratio].every(Number.isFinite)) return 0;
                return target + ((number - source) * ratio);
            }

    function scaleOptionalDimension(value, scale) {
                const number = Number(value);
                if (!Number.isFinite(number) || number <= 0 || value === Infinity) return value;
                const ratio = Number(scale);
                return Number.isFinite(ratio) && ratio > 0 ? number * ratio : number;
            }

    function normalizeCopiedCoordinate(value) {
                const number = Number(value);
                return Number.isFinite(number) ? number : null;
            }

    function resolveBitmapWindowData(bitmap) {
                if (!bitmap) return null;
                const match = surfaceService.resolveWindowSurfaceForContents(bitmap);
                if (match && match.windowData) {
                    return {
                        windowInstance: match.windowInstance || match.owner || null,
                        windowData: match.windowData,
                    };
                }
                return null;
            }
    
    
    
    
    
    function collectWindowTextReplayItems(windowData, currentEntry, contents, dirtyRect, currentOrder) {
                if (!windowData || !windowData.texts || typeof windowData.texts.forEach !== 'function') return [];
                if (!dirtyRect) return [];
                const items = [];
                try {
                    windowData.texts.forEach((entry) => {
                        if (!entry || entry === currentEntry || entryLifecycleState.isStale(entry)) return;
                        if (!windowEntryBelongsToContents(entry, contents)) return;
                        const replayBounds = getWindowTextReplayBounds(entry);
                        if (!replayBounds || !replayRectsOverlap(dirtyRect, replayBounds)) return;
                        const drawOrder = Number(entry.drawOrder) || (Number(currentOrder) + 0.5);
                        items.push({ type: 'windowText', drawOrder, entry });
                    });
                } catch (_) {}
                return items;
            }

    function getWindowTextReplayBounds(entry) {
                if (!entry) return null;
                if (isValidRect(entry.renderedBounds)) return entry.renderedBounds;
                return isValidRect(entry.bounds) ? entry.bounds : null;
            }
    
    function windowEntryBelongsToContents(entry, contents) {
                return surfaceService.windowEntryBelongsToContents(entry, contents);
            }
    
    function combineReplayItems(bitmapItems, windowItems) {
                return replayFilterService.combineReplayItems(bitmapItems, windowItems);
            }
    
    function filterReplayForEntry(items, entry) {
                return replayFilterService.filterReplayForEntry(items, entry, {
                    targetBitmap: entry && entry.contentsBitmap || null,
                });
            }
    
    function replayMixedItems(contents, targetWindow, items, replayApi, clipRect = null, options = {}) {
                if (!contents || !Array.isArray(items) || !items.length) return;
                const replayGraph = drawGraph.createDrawGraph(items, {
                    getItemRect: getReplayItemRect,
                    targetBitmap: contents,
                });
                const replay = () => {
                    replayGraph.nodes.forEach((node) => {
                        const item = node && node.item;
                        if (!item) return;
                        if (item.type === 'windowText') {
                            replayWindowTextEntry(targetWindow, contents, item.entry, options);
                        } else if (replayApi && typeof replayApi.replayBitmapItems === 'function') {
                            replayApi.replayBitmapItems(contents, [item]);
                        }
                    });
                };
                return withBitmapReplayClip(contents, clipRect, replay);
            }
    
    function replayWindowTextEntry(targetWindow, contents, entry, options = {}) {
                if (!targetWindow || !contents || !entry || entryLifecycleState.isStale(entry)) return;
                const text = getWindowReplayText(entry);
                if (!text) return;
                try {
                    if (entry.drawState) drawService.applyBitmapDrawState(contents, entry.drawState);
                } catch (_) {}
                const textFit = options && typeof options.resolveTextFit === 'function'
                    ? options.resolveTextFit(entry, text)
                    : null;
                drawTranslatedWindowText(targetWindow, contents, entry, text, {
                    route: 'replay',
                    textFit,
                });
            }
    
    function getWindowReplayText(entry) {
                if (!entry) return '';
                if (isEntryCompleted(entry)) {
                    return sanitizeDrawTextOutput(entry.renderedText, entry.type);
                }
                return sanitizeDrawTextOutput(entry.convertedText || entry.visibleText || entry.rawText || '', entry.type);
            }
    
    
    
    function withBitmapReplayClip(contents, rect, callback) {
                if (typeof callback !== 'function') return undefined;
                const canvasContext = getBitmapCanvasContext(contents);
                const area = getReplayClipArea(contents, rect);
                if (!canvasContext || !area) return callback();
                canvasContext.save();
                try {
                    if (typeof canvasContext.beginPath === 'function') canvasContext.beginPath();
                    canvasContext.rect(area.x, area.y, area.w, area.h);
                    canvasContext.clip();
                    return callback();
                } finally {
                    canvasContext.restore();
                }
            }
    
    
    
    function captureWindowEntryPixelSnapshot(contents, entry, propertyName) {
                if (!contents || !entry || !entry.bounds) return false;
                const canvasContext = getBitmapSnapshotContext(contents);
                if (!canvasContext) return false;
                const nativeSourceArea = propertyName === 'sourceSnapshot'
                    ? getNativeBackdropSnapshotArea(contents, entry)
                    : null;
                const snapshotBounds = nativeSourceArea
                    ? nativeSourceArea.bounds
                    : getWindowEntrySnapshotBounds(contents, entry);
                const area = nativeSourceArea
                    ? nativeSourceArea.area
                    : getSnapshotArea(contents, snapshotBounds, getEntrySnapshotPadding(contents, entry));
                if (!area) return false;
                try {
                    const imageData = canvasContext.getImageData(area.x, area.y, area.w, area.h);
                    if (!imageData) return false;
                    entry[propertyName] = {
                        contentsBitmap: contents,
                        x: area.x,
                        y: area.y,
                        w: area.w,
                        h: area.h,
                        bounds: cloneDiagnosticRect(snapshotBounds),
                        contentsRevision: getEntryContentsRevision(entry),
                        capturedAt: Date.now(),
                        imageData,
                    };
                    return true;
                } catch (_) {
                    entry[propertyName] = null;
                    return false;
                }
            }

    function captureWindowEntryBackgroundPatch(contents, entry, patch) {
                if (!contents || !entry || !patch || !patch.bitmap) return false;
                const sourceContext = getBitmapSnapshotContext(patch.bitmap);
                if (!sourceContext) return false;
                const area = normalizeBackgroundPatchArea(contents, patch);
                if (!area) return false;
                try {
                    // Window-owned bitmap batches are delivered after native draw.
                    // The bitmap hook already captured this patch before that draw,
                    // so it is the only clean background for async redraw.
                    const imageData = sourceContext.getImageData(0, 0, area.w, area.h);
                    if (!imageData) return false;
                    const bounds = {
                        x1: area.x,
                        y1: area.y,
                        x2: area.x + area.w,
                        y2: area.y + area.h,
                    };
                    entry.backgroundSnapshot = {
                        contentsBitmap: contents,
                        bitmapSnapshot: patch.bitmap,
                        x: area.x,
                        y: area.y,
                        w: area.w,
                        h: area.h,
                        bounds: cloneDiagnosticRect(bounds),
                        contentsRevision: getEntryContentsRevision(entry),
                        capturedAt: Date.now(),
                        imageData,
                        fromNativeTextBackdrop: true,
                        allowAreaDrift: true,
                        trusted: patch.trusted === true,
                    };
                    return true;
                } catch (_) {
                    return false;
                }
            }

    function normalizeBackgroundPatchArea(contents, patch) {
                const sourceWidth = Math.max(0, Math.floor(Number(contents && contents.width) || 0));
                const sourceHeight = Math.max(0, Math.floor(Number(contents && contents.height) || 0));
                if (!sourceWidth || !sourceHeight) return null;
                const x = Math.max(0, Math.floor(Number(patch.x) || 0));
                const y = Math.max(0, Math.floor(Number(patch.y) || 0));
                const w = Math.max(0, Math.floor(Number(patch.width) || Number(patch.bitmap && patch.bitmap.width) || 0));
                const h = Math.max(0, Math.floor(Number(patch.height) || Number(patch.bitmap && patch.bitmap.height) || 0));
                const right = Math.min(sourceWidth, x + w);
                const bottom = Math.min(sourceHeight, y + h);
                const width = right - x;
                const height = bottom - y;
                if (width <= 0 || height <= 0) return null;
                return { x, y, w: width, h: height };
            }

    function getNativeBackdropSnapshotArea(contents, entry) {
                const snapshot = entry && entry.backgroundSnapshot;
                if (!snapshot || snapshot.fromNativeTextBackdrop !== true) return null;
                if (snapshot.contentsBitmap && contents && snapshot.contentsBitmap !== contents) return null;
                const area = normalizeBackgroundPatchArea(contents, {
                    x: snapshot.x,
                    y: snapshot.y,
                    width: snapshot.w,
                    height: snapshot.h,
                    bitmap: contents,
                });
                if (!area) return null;
                return {
                    area,
                    bounds: {
                        x1: area.x,
                        y1: area.y,
                        x2: area.x + area.w,
                        y2: area.y + area.h,
                    },
                };
            }

    function captureWindowEntryBackground(contents, entry) {
                return captureWindowEntryPixelSnapshot(contents, entry, 'backgroundSnapshot');
            }
    
    function ensureWindowEntryBackground(contents, entry) {
                if (!contents || !entry) return false;
                const snapshot = getWindowEntryBackgroundSnapshotStatus(contents, entry, entry.windowData);
                if (snapshot.usable) return true;
                return captureWindowEntryBackground(contents, entry);
            }

    function getWindowEntrySnapshotBounds(contents, entry) {
                if (!entry) return null;
                const bitmapSurfaceBounds = estimateBitmapSurfaceTextBounds(
                    contents,
                    entry,
                    entry.visibleText || entry.convertedText || entry.rawText || ''
                );
                return mergeBounds(entry.bounds, bitmapSurfaceBounds) || entry.bounds || bitmapSurfaceBounds;
            }
    
    function getWindowEntryBackgroundSnapshotStatus(contents, entry, windowData = null) {
                return getWindowEntryPixelSnapshotStatus(contents, entry, 'backgroundSnapshot', windowData);
            }

    function getWindowEntrySourceSnapshotStatus(contents, entry, windowData = null) {
                return getWindowEntryPixelSnapshotStatus(contents, entry, 'sourceSnapshot', windowData);
            }

    function getWindowEntryPixelSnapshotStatus(contents, entry, propertyName, windowData = null, options = null) {
                if (!entry) return { usable: false, reason: 'missingEntry' };
                const snapshot = entry[propertyName];
                if (!snapshot || !snapshot.imageData) return { usable: false, reason: 'missingSnapshot' };
                if (!contents || (snapshot.contentsBitmap && snapshot.contentsBitmap !== contents)) {
                    return { usable: false, reason: 'bitmapChanged' };
                }
                const area = getSnapshotArea(contents, getWindowEntrySnapshotBounds(contents, entry), getEntrySnapshotPadding(contents, entry));
                if (!area) return { usable: false, reason: 'missingArea' };
                if (area.x !== snapshot.x || area.y !== snapshot.y || area.w !== snapshot.w || area.h !== snapshot.h) {
                    // Native backdrop patches use engine text regions, while redraw
                    // bounds may use measured font ink. Allow only those marked
                    // patches to drift, and only when they still overlap this entry.
                    if (!(options && options.allowStaleArea === true && snapshot.allowAreaDrift === true && snapshotAreaOverlaps(snapshot, area))) {
                        return { usable: false, reason: 'staleArea' };
                    }
                }
                const staleArea = area.x !== snapshot.x || area.y !== snapshot.y || area.w !== snapshot.w || area.h !== snapshot.h;
                if (staleArea && !(options && options.allowStaleArea === true)) {
                    return { usable: false, reason: 'staleArea' };
                }
                const staleRevision = getSnapshotContentsRevision(snapshot) !== getWindowDataContentsRevision(windowData || entry.windowData);
                if (staleRevision && !(options && options.allowStaleRevision === true)) {
                    return { usable: false, reason: 'staleRevision' };
                }
                return {
                    usable: true,
                    reason: staleRevision ? 'staleRevisionAllowed' : (staleArea ? 'staleAreaAllowed' : ''),
                    staleRevision,
                    staleArea,
                };
            }

    function snapshotAreaOverlaps(snapshot, area) {
                if (!snapshot || !area) return false;
                const left = Math.max(Number(snapshot.x), Number(area.x));
                const top = Math.max(Number(snapshot.y), Number(area.y));
                const right = Math.min(Number(snapshot.x) + Number(snapshot.w), Number(area.x) + Number(area.w));
                const bottom = Math.min(Number(snapshot.y) + Number(snapshot.h), Number(area.y) + Number(area.h));
                return [left, top, right, bottom].every(Number.isFinite) && right > left && bottom > top;
            }
    
    function restoreWindowEntryPixelSnapshot(contents, entry, propertyName, windowData = null, options = null) {
                if (!contents || !entry || !entry[propertyName]) return false;
                const snapshot = entry[propertyName];
                if (!getWindowEntryPixelSnapshotStatus(contents, entry, propertyName, windowData, options).usable) return false;
                const canvasContext = getBitmapSnapshotContext(contents);
                if (!canvasContext || !snapshot.imageData) return false;
                try {
                    if (restoreWindowEntryBitmapSnapshot(contents, snapshot)) return true;
                    canvasContext.putImageData(snapshot.imageData, snapshot.x, snapshot.y);
                    markBitmapPixelsDirty(contents);
                    return true;
                } catch (_) {
                    return false;
                }
            }

    function restoreWindowEntryBackground(contents, entry, windowData = null, options = null) {
                return restoreWindowEntryPixelSnapshot(contents, entry, 'backgroundSnapshot', windowData, options);
            }

    function markBitmapPixelsDirty(bitmap) {
                if (!bitmap) return;
                try {
                    // putImageData writes behind RPG Maker's Bitmap API; mark the
                    // texture dirty so the restored backdrop reaches the screen.
                    if (typeof bitmap._setDirty === 'function') {
                        bitmap._setDirty();
                    }
                } catch (_) {}
                try {
                    bitmap._dirty = true;
                } catch (_) {}
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
                    try {
                        baseTexture.update();
                    } catch (_) {}
                });
            }

    function restoreWindowEntryBitmapSnapshot(contents, snapshot) {
                if (!contents || !snapshot || !snapshot.bitmapSnapshot) return false;
                const source = snapshot.bitmapSnapshot;
                if (!isUsableBitmap(source) || typeof contents.blt !== 'function') return false;
                const width = Math.floor(Number(snapshot.w) || 0);
                const height = Math.floor(Number(snapshot.h) || 0);
                if (width <= 0 || height <= 0) return false;
                if (Number(source.width) < width || Number(source.height) < height) return false;
                try {
                    contents.blt(source, 0, 0, width, height, snapshot.x, snapshot.y, width, height);
                    markBitmapPixelsDirty(contents);
                    return true;
                } catch (_) {
                    return false;
                }
            }
    
    
    
    
    
    
    
    
    
        return { mergeBounds, isValidRect, roundDiagnosticNumber, cloneDiagnosticRect, cloneDiagnosticArea, calculateBitmapSurfaceTextYOffset, estimateBitmapSurfaceTextBounds, withWindowRedrawClear, withWindowContents, isUsableBitmap, getRedrawContents, wasDrawnToDetachedContents, isTransientRefreshWindow, isCoreRefreshWindowType, getBitmapReplayApi, assignWindowTextDrawOrder, captureWindowEntrySource, restoreWindowEntrySource, restoreEntriesForBitmapMutation, redrawRestoredEntriesForBitmapMutation, prepareCopiedTargetsForBitmapMutation, commitCopiedTargetsForBitmapMutation, invalidateCopiedTargetsForBitmapMutation, hasCopiedTargetsForBitmap, redrawCopiedWindowTextTargets, createClearRectFromArea, getReplayItemRect, mergeReplayRect, expandReplayDirtyRect, replayRectsOverlap, collectWindowTextReplayItems, windowEntryBelongsToContents, combineReplayItems, filterReplayForEntry, replayMixedItems, replayWindowTextEntry, getWindowReplayText, getBitmapCanvasContext, supportsBitmapReplayClip, withBitmapReplayClip, getReplayClipArea, getBitmapSnapshotContext, captureWindowEntryBackground, captureWindowEntryBackgroundPatch, ensureWindowEntryBackground, getWindowEntryBackgroundSnapshotStatus, getWindowEntrySourceSnapshotStatus, restoreWindowEntryBackground, getEntryContentsRevision, getSnapshotContentsRevision, getWindowDataContentsRevision, getEntrySnapshotPadding, getSnapshotArea, getSnapshotDiagnostics, summarizeReplayItemsForDiagnostics, summarizeReplayStateForDiagnostics };
    }
    
    defineRuntimeModule('adapters.windowTextBitmapReplay', { create: createBitmapReplayController });

})();
