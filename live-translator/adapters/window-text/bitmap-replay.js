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

    function createBitmapReplayController(context = {}) {
    const callContext = (name) => (...args) => context[name](...args);
    const { logger, telemetry, adapterContract, windowRegistry, registeredWindows, windowLifecycle, ensureWindowRegistered, pruneDetachedRegisteredWindows, generateKey, captureBitmapDrawState, applyBitmapDrawState, createWindowTextScaleScope, preview, diag, dbg, drawCaptureTrace, bitmapReplay, settings, stripControls, encodeText, restoreText, entriesByRecordId, redrawSettings, textScaleOthers, ADAPTER_ID, ADAPTER_LABEL, RENDER_STRATEGY, WINDOW_PRIORITY_VISIBLE, WINDOW_WRAPPER_TOKEN, REDRAW_DIAGNOSTIC_ITEM_LIMIT, MAX_BACKGROUND_SNAPSHOT_PIXELS } = context;
    const { install, installOrchestratorSubscription, getRenderGeneration, isRenderTargetCurrent, handleRenderRejected, installWindowBaseWrappers, hasHookInChain, handleDrawText, handleDrawTextEx, createObservedEntry, recordSkippedEntry, createEntry, refreshEntry, requestEntryTranslation, observeEntry, syncEntryFromObservedItem, getEntryStatus, isEntryActive, isEntryRequestActive, isEntryCompleted, firstNonEmptyString, recordDrawTrace, windowTraceDetails, getRegisteredWindowData, markEntryObservedInRefresh, safeStripRpgmEscapes, describeWindowScreenState, buildOrchestratorPayload, applyRenderCommand, markRequestSkipped, markRequestFailed, updateOrchestratorItem, beginPendingRenderCommand, markPendingRenderDeferred, completePendingRenderCommand, rejectPendingRender, clearPendingRenderCommand, getPendingRenderDetails, redrawTranslatedText, drawTranslatedEntry, calculateRedrawBounds, drawTranslatedWindowText, invokeCompletedEntry, invokeOriginalDrawText, invokeOriginalDrawTextEx, withTranslatedWindowTextScale, withWindowTranslatedDrawScope, isWindowTranslatedDrawActive, withWindowDrawTextExReplayScope, findExistingEntry, retireEntriesInSameSlot, markEntryStale, cancelEntryTranslation, markRecordDisappeared, recordDecision, queuePendingRedraw, clearPendingInvalidation, getCurrentEntry, getTextEntryKey, dropPendingRedraw, resolveWindowData, resolveTargetWindow, isWindowReadyForRedraw, refreshEntryBounds, estimateEntryBounds, measurePlainTextWidth, estimateDrawTextExFallbackWidth, estimateDrawTextExFallbackHeight, estimateMaxDrawTextExFallbackHeight, getDrawTextExLineCount, getLineHeight, getWindowIconWidth, countDrawTextExIcons, prepareTranslationSource, restoreTranslatedWindowText, sanitizeDrawTextOutput, convertWindowText, describeWindowTextEligibility, describeEntryEligibility, isDedicatedMessageWindow, rememberMessageStart, getSurfaceId, createSlotKey, createWindowTextRecordId, safeRecordIdPart, hashTextForRecordId, normalizeSlotNumber, getWindowTypeName, getWindowCtorName, normalizeDrawTextAlignValue } = Object.fromEntries(['install', 'installOrchestratorSubscription', 'getRenderGeneration', 'isRenderTargetCurrent', 'handleRenderRejected', 'installWindowBaseWrappers', 'hasHookInChain', 'handleDrawText', 'handleDrawTextEx', 'createObservedEntry', 'recordSkippedEntry', 'createEntry', 'refreshEntry', 'requestEntryTranslation', 'observeEntry', 'syncEntryFromObservedItem', 'getEntryStatus', 'isEntryActive', 'isEntryRequestActive', 'isEntryCompleted', 'firstNonEmptyString', 'recordDrawTrace', 'windowTraceDetails', 'getRegisteredWindowData', 'markEntryObservedInRefresh', 'safeStripRpgmEscapes', 'describeWindowScreenState', 'buildOrchestratorPayload', 'applyRenderCommand', 'markRequestSkipped', 'markRequestFailed', 'updateOrchestratorItem', 'beginPendingRenderCommand', 'markPendingRenderDeferred', 'completePendingRenderCommand', 'rejectPendingRender', 'clearPendingRenderCommand', 'getPendingRenderDetails', 'redrawTranslatedText', 'drawTranslatedEntry', 'calculateRedrawBounds', 'drawTranslatedWindowText', 'invokeCompletedEntry', 'invokeOriginalDrawText', 'invokeOriginalDrawTextEx', 'withTranslatedWindowTextScale', 'withWindowTranslatedDrawScope', 'isWindowTranslatedDrawActive', 'withWindowDrawTextExReplayScope', 'findExistingEntry', 'retireEntriesInSameSlot', 'markEntryStale', 'cancelEntryTranslation', 'markRecordDisappeared', 'recordDecision', 'queuePendingRedraw', 'clearPendingInvalidation', 'getCurrentEntry', 'getTextEntryKey', 'dropPendingRedraw', 'resolveWindowData', 'resolveTargetWindow', 'isWindowReadyForRedraw', 'refreshEntryBounds', 'estimateEntryBounds', 'measurePlainTextWidth', 'estimateDrawTextExFallbackWidth', 'estimateDrawTextExFallbackHeight', 'estimateMaxDrawTextExFallbackHeight', 'getDrawTextExLineCount', 'getLineHeight', 'getWindowIconWidth', 'countDrawTextExIcons', 'prepareTranslationSource', 'restoreTranslatedWindowText', 'sanitizeDrawTextOutput', 'convertWindowText', 'describeWindowTextEligibility', 'describeEntryEligibility', 'isDedicatedMessageWindow', 'rememberMessageStart', 'getSurfaceId', 'createSlotKey', 'createWindowTextRecordId', 'safeRecordIdPart', 'hashTextForRecordId', 'normalizeSlotNumber', 'getWindowTypeName', 'getWindowCtorName', 'normalizeDrawTextAlignValue'].map((name) => [name, callContext(name)]));
    const bitmapTools = bitmapDiagnostics.create(context);
    const { mergeBounds, isValidRect, roundDiagnosticNumber, cloneDiagnosticRect, cloneDiagnosticArea, calculateBitmapSurfaceTextYOffset, estimateBitmapSurfaceTextBounds, createClearRectFromArea, getReplayItemRect, mergeReplayRect, expandReplayDirtyRect, replayRectsOverlap, getBitmapCanvasContext, supportsBitmapReplayClip, getReplayClipArea, getBitmapSnapshotContext, getEntryContentsRevision, getSnapshotContentsRevision, getWindowDataContentsRevision, getEntrySnapshotPadding, getSnapshotArea, getSnapshotDiagnostics, summarizeReplayItemsForDiagnostics, summarizeReplayStateForDiagnostics } = bitmapTools;
    
    
    
    
    
    
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
                try {
                    windowInstance.contents = contents;
                    return callback();
                } finally {
                    windowInstance.contents = previous;
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
                if (entry && isUsableBitmap(entry.contentsBitmap)) return entry.contentsBitmap;
                return windowInstance && isUsableBitmap(windowInstance.contents) ? windowInstance.contents : null;
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
                    const api = bitmapReplay;
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
                        if (!entry || entry._trStale || !windowEntryBelongsToContents(entry, bitmap)) return;
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
                    if (!entry || entry._trStale || !windowEntryBelongsToContents(entry, bitmap)) return;
                    if (!isEntryCompleted(entry)) return;
                    if (drawTranslatedEntry(match.windowInstance, match.windowData, bitmap, entry)) {
                        redrawn += 1;
                    }
                });
                return redrawn;
            }

    function resolveBitmapWindowData(bitmap) {
                if (!bitmap) return null;
                let owner = null;
                try {
                    const owners = context.contentsOwners;
                    if (owners && typeof owners.get === 'function') owner = owners.get(bitmap) || null;
                } catch (_) {}
                if (owner) {
                    try {
                        const data = windowRegistry && typeof windowRegistry.get === 'function'
                            ? windowRegistry.get(owner)
                            : null;
                        if (data) return { windowInstance: owner, windowData: data };
                    } catch (_) {}
                }
                try {
                    if (registeredWindows && typeof registeredWindows.forEach === 'function') {
                        let match = null;
                        registeredWindows.forEach((candidate) => {
                            if (match || !candidate) return;
                            const data = windowRegistry && typeof windowRegistry.get === 'function'
                                ? windowRegistry.get(candidate)
                                : null;
                            if (data && (candidate.contents === bitmap || data.contentsBitmap === bitmap)) {
                                match = { windowInstance: candidate, windowData: data };
                            }
                        });
                        return match;
                    }
                } catch (_) {}
                return null;
            }
    
    
    
    
    
    function collectWindowTextReplayItems(windowData, currentEntry, contents, dirtyRect, currentOrder) {
                if (!windowData || !windowData.texts || typeof windowData.texts.forEach !== 'function') return [];
                if (!dirtyRect) return [];
                const items = [];
                try {
                    windowData.texts.forEach((entry) => {
                        if (!entry || entry === currentEntry || entry._trStale) return;
                        if (!windowEntryBelongsToContents(entry, contents)) return;
                        if (!entry.bounds || !replayRectsOverlap(dirtyRect, entry.bounds)) return;
                        const drawOrder = Number(entry.drawOrder) || (Number(currentOrder) + 0.5);
                        items.push({ type: 'windowText', drawOrder, entry });
                    });
                } catch (_) {}
                return items;
            }
    
    function windowEntryBelongsToContents(entry, contents) {
                if (!entry || !contents) return false;
                try {
                    if (entry.contentsBitmap) return entry.contentsBitmap === contents;
                } catch (_) {}
                return true;
            }
    
    function combineReplayItems(bitmapItems, windowItems) {
                return []
                    .concat(Array.isArray(bitmapItems) ? bitmapItems : [])
                    .concat(Array.isArray(windowItems) ? windowItems : [])
                    .sort((a, b) => (Number(a && a.drawOrder) || 0) - (Number(b && b.drawOrder) || 0));
            }
    
    function filterReplayForEntry(items, entry) {
                const list = Array.isArray(items) ? items : [];
                if (!entry || entry.type !== 'drawTextEx') return list;
                return list.filter((item) => !(item
                    && item.type === 'renderOp'
                    && item.op
                    && item.op.windowDrawTextExReplay));
            }
    
    function replayMixedItems(contents, targetWindow, items, replayApi, clipRect = null) {
                if (!contents || !Array.isArray(items) || !items.length) return;
                const replay = () => {
                    items.forEach((item) => {
                        if (!item) return;
                        if (item.type === 'windowText') {
                            replayWindowTextEntry(targetWindow, contents, item.entry);
                        } else if (replayApi && typeof replayApi.replayBitmapItems === 'function') {
                            replayApi.replayBitmapItems(contents, [item]);
                        }
                    });
                };
                return withBitmapReplayClip(contents, clipRect, replay);
            }
    
    function replayWindowTextEntry(targetWindow, contents, entry) {
                if (!targetWindow || !contents || !entry || entry._trStale) return;
                const text = getWindowReplayText(entry);
                if (!text) return;
                try {
                    if (entry.drawState) applyBitmapDrawState(contents, entry.drawState);
                } catch (_) {}
                drawTranslatedWindowText(targetWindow, contents, entry, text, { route: 'replay' });
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
                    canvasContext.putImageData(snapshot.imageData, snapshot.x, snapshot.y);
                    return true;
                } catch (_) {
                    return false;
                }
            }

    function restoreWindowEntryBackground(contents, entry, windowData = null, options = null) {
                return restoreWindowEntryPixelSnapshot(contents, entry, 'backgroundSnapshot', windowData, options);
            }
    
    
    
    
    
    
    
    
    
        return { mergeBounds, isValidRect, roundDiagnosticNumber, cloneDiagnosticRect, cloneDiagnosticArea, calculateBitmapSurfaceTextYOffset, estimateBitmapSurfaceTextBounds, withWindowRedrawClear, withWindowContents, isUsableBitmap, getRedrawContents, wasDrawnToDetachedContents, isTransientRefreshWindow, isCoreRefreshWindowType, getBitmapReplayApi, assignWindowTextDrawOrder, captureWindowEntrySource, restoreWindowEntrySource, restoreEntriesForBitmapMutation, redrawRestoredEntriesForBitmapMutation, createClearRectFromArea, getReplayItemRect, mergeReplayRect, expandReplayDirtyRect, replayRectsOverlap, collectWindowTextReplayItems, windowEntryBelongsToContents, combineReplayItems, filterReplayForEntry, replayMixedItems, replayWindowTextEntry, getWindowReplayText, getBitmapCanvasContext, supportsBitmapReplayClip, withBitmapReplayClip, getReplayClipArea, getBitmapSnapshotContext, captureWindowEntryBackground, captureWindowEntryBackgroundPatch, ensureWindowEntryBackground, getWindowEntryBackgroundSnapshotStatus, getWindowEntrySourceSnapshotStatus, restoreWindowEntryBackground, getEntryContentsRevision, getSnapshotContentsRevision, getWindowDataContentsRevision, getEntrySnapshotPadding, getSnapshotArea, getSnapshotDiagnostics, summarizeReplayItemsForDiagnostics, summarizeReplayStateForDiagnostics };
    }
    
    defineRuntimeModule('adapters.windowTextBitmapReplay', { create: createBitmapReplayController });

})();
