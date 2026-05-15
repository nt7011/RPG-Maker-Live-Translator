// Window text adapter support: draw observer.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before adapters/window-text/draw-observer.js.');
    }

    function createDrawObserverController(context = {}) {
    const callContext = (name) => (...args) => context[name](...args);
    const { logger, telemetry, adapterContract, windowRegistry, registeredWindows, contentsOwners, windowLifecycle, ensureWindowRegistered, pruneDetachedRegisteredWindows, generateKey, captureBitmapDrawState, applyBitmapDrawState, createWindowTextScaleScope, preview, diag, dbg, drawCaptureTrace, bitmapReplay, settings, stripControls, encodeText, restoreText, entriesByRecordId, redrawSettings, textScaleOthers, ADAPTER_ID, ADAPTER_LABEL, RENDER_STRATEGY, WINDOW_PRIORITY_VISIBLE, WINDOW_WRAPPER_TOKEN, REDRAW_DIAGNOSTIC_ITEM_LIMIT, MAX_BACKGROUND_SNAPSHOT_PIXELS } = context;
    const { install, installOrchestratorSubscription, getRenderGeneration, isRenderTargetCurrent, handleRenderRejected, installWindowBaseWrappers, hasHookInChain, requestEntryTranslation, observeEntry, syncEntryFromObservedItem, getEntryStatus, isEntryActive, isEntryRequestActive, isEntryCompleted, firstNonEmptyString, recordDrawTrace, windowTraceDetails, getRegisteredWindowData, markEntryObservedInRefresh, safeStripRpgmEscapes, describeWindowScreenState, buildOrchestratorPayload, applyRenderCommand, markRequestSkipped, markRequestFailed, updateOrchestratorItem, beginPendingRenderCommand, markPendingRenderDeferred, completePendingRenderCommand, rejectPendingRender, clearPendingRenderCommand, getPendingRenderDetails, redrawTranslatedText, drawTranslatedEntry, calculateRedrawBounds, drawTranslatedWindowText, invokeCompletedEntry, invokeOriginalDrawText, invokeOriginalDrawTextEx, withTranslatedWindowTextScale, withWindowTranslatedDrawScope, isWindowTranslatedDrawActive, withWindowDrawTextExReplayScope, findExistingEntry, retireEntriesInSameSlot, markEntryStale, cancelEntryTranslation, markRecordDisappeared, recordDecision, queuePendingRedraw, clearPendingInvalidation, getCurrentEntry, getTextEntryKey, dropPendingRedraw, resolveWindowData, resolveTargetWindow, isWindowReadyForRedraw, refreshEntryBounds, estimateEntryBounds, measurePlainTextWidth, estimateDrawTextExFallbackWidth, estimateDrawTextExFallbackHeight, estimateMaxDrawTextExFallbackHeight, getDrawTextExLineCount, getLineHeight, getWindowIconWidth, countDrawTextExIcons, prepareTranslationSource, restoreTranslatedWindowText, sanitizeDrawTextOutput, convertWindowText, describeWindowTextEligibility, describeEntryEligibility, isDedicatedMessageWindow, rememberMessageStart, getSurfaceId, getIdentitySurfaceId, createSlotKey, createWindowTextRecordId, safeRecordIdPart, hashTextForRecordId, normalizeSlotNumber, getWindowTypeName, getWindowCtorName, normalizeDrawTextAlignValue, mergeBounds, isValidRect, roundDiagnosticNumber, cloneDiagnosticRect, cloneDiagnosticArea, calculateBitmapSurfaceTextYOffset, withWindowRedrawClear, withWindowContents, isUsableBitmap, getRedrawContents, wasDrawnToDetachedContents, isTransientRefreshWindow, isCoreRefreshWindowType, getBitmapReplayApi, assignWindowTextDrawOrder, createClearRectFromArea, getReplayItemRect, mergeReplayRect, expandReplayDirtyRect, replayRectsOverlap, collectWindowTextReplayItems, windowEntryBelongsToContents, combineReplayItems, filterReplayForEntry, replayMixedItems, replayWindowTextEntry, getWindowReplayText, getBitmapCanvasContext, supportsBitmapReplayClip, withBitmapReplayClip, getReplayClipArea, getBitmapSnapshotContext, captureWindowEntryBackground, captureWindowEntryBackgroundPatch, ensureWindowEntryBackground, getWindowEntryBackgroundSnapshotStatus, restoreWindowEntryBackground, getEntryContentsRevision, getSnapshotContentsRevision, getWindowDataContentsRevision, getEntrySnapshotPadding, getSnapshotArea, getSnapshotDiagnostics, summarizeReplayItemsForDiagnostics, summarizeReplayStateForDiagnostics } = Object.fromEntries(['install', 'installOrchestratorSubscription', 'getRenderGeneration', 'isRenderTargetCurrent', 'handleRenderRejected', 'installWindowBaseWrappers', 'hasHookInChain', 'requestEntryTranslation', 'observeEntry', 'syncEntryFromObservedItem', 'getEntryStatus', 'isEntryActive', 'isEntryRequestActive', 'isEntryCompleted', 'firstNonEmptyString', 'recordDrawTrace', 'windowTraceDetails', 'getRegisteredWindowData', 'markEntryObservedInRefresh', 'safeStripRpgmEscapes', 'describeWindowScreenState', 'buildOrchestratorPayload', 'applyRenderCommand', 'markRequestSkipped', 'markRequestFailed', 'updateOrchestratorItem', 'beginPendingRenderCommand', 'markPendingRenderDeferred', 'completePendingRenderCommand', 'rejectPendingRender', 'clearPendingRenderCommand', 'getPendingRenderDetails', 'redrawTranslatedText', 'drawTranslatedEntry', 'calculateRedrawBounds', 'drawTranslatedWindowText', 'invokeCompletedEntry', 'invokeOriginalDrawText', 'invokeOriginalDrawTextEx', 'withTranslatedWindowTextScale', 'withWindowTranslatedDrawScope', 'isWindowTranslatedDrawActive', 'withWindowDrawTextExReplayScope', 'findExistingEntry', 'retireEntriesInSameSlot', 'markEntryStale', 'cancelEntryTranslation', 'markRecordDisappeared', 'recordDecision', 'queuePendingRedraw', 'clearPendingInvalidation', 'getCurrentEntry', 'getTextEntryKey', 'dropPendingRedraw', 'resolveWindowData', 'resolveTargetWindow', 'isWindowReadyForRedraw', 'refreshEntryBounds', 'estimateEntryBounds', 'measurePlainTextWidth', 'estimateDrawTextExFallbackWidth', 'estimateDrawTextExFallbackHeight', 'estimateMaxDrawTextExFallbackHeight', 'getDrawTextExLineCount', 'getLineHeight', 'getWindowIconWidth', 'countDrawTextExIcons', 'prepareTranslationSource', 'restoreTranslatedWindowText', 'sanitizeDrawTextOutput', 'convertWindowText', 'describeWindowTextEligibility', 'describeEntryEligibility', 'isDedicatedMessageWindow', 'rememberMessageStart', 'getSurfaceId', 'getIdentitySurfaceId', 'createSlotKey', 'createWindowTextRecordId', 'safeRecordIdPart', 'hashTextForRecordId', 'normalizeSlotNumber', 'getWindowTypeName', 'getWindowCtorName', 'normalizeDrawTextAlignValue', 'mergeBounds', 'isValidRect', 'roundDiagnosticNumber', 'cloneDiagnosticRect', 'cloneDiagnosticArea', 'calculateBitmapSurfaceTextYOffset', 'withWindowRedrawClear', 'withWindowContents', 'isUsableBitmap', 'getRedrawContents', 'wasDrawnToDetachedContents', 'isTransientRefreshWindow', 'isCoreRefreshWindowType', 'getBitmapReplayApi', 'assignWindowTextDrawOrder', 'createClearRectFromArea', 'getReplayItemRect', 'mergeReplayRect', 'expandReplayDirtyRect', 'replayRectsOverlap', 'collectWindowTextReplayItems', 'windowEntryBelongsToContents', 'combineReplayItems', 'filterReplayForEntry', 'replayMixedItems', 'replayWindowTextEntry', 'getWindowReplayText', 'getBitmapCanvasContext', 'supportsBitmapReplayClip', 'withBitmapReplayClip', 'getReplayClipArea', 'getBitmapSnapshotContext', 'captureWindowEntryBackground', 'captureWindowEntryBackgroundPatch', 'ensureWindowEntryBackground', 'getWindowEntryBackgroundSnapshotStatus', 'restoreWindowEntryBackground', 'getEntryContentsRevision', 'getSnapshotContentsRevision', 'getWindowDataContentsRevision', 'getEntrySnapshotPadding', 'getSnapshotArea', 'getSnapshotDiagnostics', 'summarizeReplayItemsForDiagnostics', 'summarizeReplayStateForDiagnostics'].map((name) => [name, callContext(name)]));
    
    function handleDrawText(windowInstance, originalDrawText, text, x, y, maxWidth, align) {
                const textStr = stringifyWindowTextInput(text);
                const originalDrawValue = normalizeNativeWindowTextInput(text);
                const invokeOriginal = (overrideText, options = {}) => {
                    const value = overrideText !== undefined ? overrideText : originalDrawValue;
                    return invokeOriginalDrawText(windowInstance, originalDrawText, value, x, y, maxWidth, align, options);
                };
                recordDrawTrace('window.drawText.enter', textStr, windowTraceDetails(windowInstance, 'drawText', textStr, x, y, {
                    maxWidth,
                    align,
                }));
    
                if (isWindowTranslatedDrawActive(windowInstance)) {
                    recordDrawTrace('window.drawText.bypass', textStr, windowTraceDetails(windowInstance, 'drawText', textStr, x, y, {
                        reason: 'translatedDrawActive',
                        maxWidth,
                        align,
                    }));
                    return invokeOriginal();
                }
    
                if (isDedicatedMessageWindow(windowInstance)) {
                    recordDrawTrace('window.drawText.bypass', textStr, windowTraceDetails(windowInstance, 'drawText', textStr, x, y, {
                        reason: 'dedicatedMessageWindow',
                        maxWidth,
                        align,
                    }));
                    return invokeOriginal();
                }
    
                const contents = windowInstance && windowInstance.contents;
                if (contents
                    && (contents._trWindowTextDrawTextExReplayDepth > 0
                        || contents._trWindowDrawTextExReplayDepth > 0)) {
                    telemetry.logDraw('bypass', textStr, x, y, {
                        windowType: getWindowCtorName(windowInstance),
                        method: 'drawTextEx-nested',
                    });
                    recordDrawTrace('window.drawText.bypass', textStr, windowTraceDetails(windowInstance, 'drawText', textStr, x, y, {
                        reason: 'drawTextExNestedReplay',
                        maxWidth,
                        align,
                    }));
                    return invokeOriginal();
                }
    
                const observation = observePlainWindowTextDraw({
                    windowInstance,
                    tracePrefix: 'window.drawText',
                    traceMethod: 'drawText',
                    rawText: textStr,
                    x,
                    y,
                    originalParams: { maxWidth, align },
                    traceDetails: { maxWidth, align },
                    emptyReason: text === undefined ? 'missingTextArgument' : 'empty',
                });
                if (observation && observation.completed) {
                    return invokeCompletedEntry(
                        observation.entry,
                        observation.normalizedText,
                        invokeOriginal,
                        observation.phase === 'existing' ? 'drawText-existing' : 'drawText-entry'
                    );
                }
                const result = invokeOriginal();
                captureSourceAfterNativeDraw(windowInstance, observation && observation.entry);
                return result;
            }
    
    function handleDrawTextEx(windowInstance, originalDrawTextEx, text, x, y) {
                try {
                    if (windowInstance && windowInstance.contents) {
                        windowInstance.contents._trPreferWindowPipeline = true;
                    }
                } catch (_) {}
    
                const textStr = stringifyWindowTextInput(text);
                const invokeOriginal = (overrideText, options = {}) => {
                    const value = overrideText !== undefined ? overrideText : textStr;
                    return invokeOriginalDrawTextEx(windowInstance, originalDrawTextEx, value, x, y, options);
                };
                recordDrawTrace('window.drawTextEx.enter', textStr, windowTraceDetails(windowInstance, 'drawTextEx', textStr, x, y, {
                    maxWidth: Infinity,
                    align: 'left',
                }));
    
                if (isWindowTranslatedDrawActive(windowInstance)) {
                    recordDrawTrace('window.drawTextEx.bypass', textStr, windowTraceDetails(windowInstance, 'drawTextEx', textStr, x, y, {
                        reason: 'translatedDrawActive',
                        maxWidth: Infinity,
                        align: 'left',
                    }));
                    return invokeOriginal();
                }
    
                if (isDedicatedMessageWindow(windowInstance)) {
                    rememberMessageStart(windowInstance, x, y);
                    recordDrawTrace('window.drawTextEx.bypass', textStr, windowTraceDetails(windowInstance, 'drawTextEx', textStr, x, y, {
                        reason: 'dedicatedMessageWindow',
                        maxWidth: Infinity,
                        align: 'left',
                    }));
                    return invokeOriginal();
                }
    
                const windowData = ensureWindowRegistered(windowInstance);
                const convertedText = convertWindowText(windowInstance, textStr);
                const convertedTrimmed = String(convertedText || '').trim();
                const visibleText = safeStripRpgmEscapes(convertedText || convertedTrimmed || textStr).trim();
                if (!convertedTrimmed) {
                    const slotInvalidated = retireEmptyWindowTextSlot(windowInstance, 'drawTextEx', x, y);
                    recordDrawTrace('window.drawTextEx.skip', textStr, windowTraceDetails(windowInstance, 'drawTextEx', textStr, x, y, {
                        reason: text === undefined ? 'missingTextArgument' : 'emptyConverted',
                        convertedText,
                        slotKey: createSlotKey('drawTextEx', x, y),
                        slotInvalidated,
                        maxWidth: Infinity,
                        align: 'left',
                    }));
                    return invokeOriginal();
                }
    
                const params = { maxWidth: Infinity, align: 'left' };
                const existing = findExistingEntry(windowData, 'drawTextEx', textStr, convertedTrimmed, x, y);
                if (existing) {
                    refreshEntry(windowInstance, windowData, existing, textStr, convertedTrimmed, x, y, 'drawTextEx', convertedText, params);
                    recordDrawTrace('window.drawTextEx.existing', textStr, windowTraceDetails(windowInstance, 'drawTextEx', textStr, x, y, {
                        recordId: existing.recordId || '',
                        slotKey: existing.slotKey || createSlotKey('drawTextEx', x, y),
                        status: getEntryStatus(existing),
                        convertedText,
                        maxWidth: Infinity,
                        align: 'left',
                        bounds: cloneDiagnosticRect(existing.bounds),
                    }));
                    if (isEntryCompleted(existing)) {
                        return invokeCompletedEntry(existing, convertedTrimmed, invokeOriginal, 'drawTextEx-existing');
                    }
                    requestEntryTranslation(windowData, existing);
                    const result = invokeOriginal();
                    captureSourceAfterNativeDraw(windowInstance, existing);
                    return result;
                }
    
                // drawTextEx keeps non-content control codes in the converted
                // string. Eligibility should classify the rendered glyphs, not
                // icon/font/color escape metadata.
                const eligibility = describeWindowTextEligibility(textStr, visibleText, 'drawTextEx');
                if (!eligibility.eligible) {
                    recordSkippedEntry(windowInstance, windowData, textStr, x, y, 'drawTextEx', convertedText, params, eligibility);
                    recordDrawTrace('window.drawTextEx.skip', textStr, windowTraceDetails(windowInstance, 'drawTextEx', textStr, x, y, {
                        reason: eligibility.reason || 'ineligible',
                        category: eligibility.category || '',
                        convertedText,
                        maxWidth: Infinity,
                        align: 'left',
                    }));
                    return invokeOriginal();
                }
    
                const entry = createObservedEntry(windowInstance, windowData, textStr, x, y, 'drawTextEx', convertedText, params);
                if (isEntryCompleted(entry)) {
                    return invokeCompletedEntry(entry, convertedTrimmed, invokeOriginal, 'drawTextEx-entry');
                }
                const result = invokeOriginal();
                captureSourceAfterNativeDraw(windowInstance, entry);
                return result;
            }

    function handleSurfaceDrawText(payload = {}, event = {}) {
                const draw = normalizeSurfaceDrawText(payload, event);
                const windowInstance = resolveSurfaceDrawWindow(draw.bitmap);
                const traceDetails = {
                    maxWidth: draw.maxWidth,
                    lineHeight: draw.lineHeight,
                    align: draw.align,
                    sourceAdapter: draw.sourceAdapter,
                    ownershipStatus: draw.ownershipStatus,
                    ownershipReason: draw.ownershipReason,
                    backgroundPatch: !!draw.backgroundPatch,
                };

                if (!windowInstance) {
                    recordDrawTrace('window.surfaceDraw.skip', draw.text, Object.assign({
                        adapter: ADAPTER_ID,
                        surfaceType: 'window',
                        methodName: draw.methodName,
                        rawText: draw.text,
                        visibleText: safeStripRpgmEscapes(draw.text),
                        normalizedText: safeStripRpgmEscapes(draw.text).trim(),
                        x: draw.x,
                        y: draw.y,
                        reason: 'ownerWindowMissing',
                    }, traceDetails));
                    return null;
                }

                recordDrawTrace('window.surfaceDraw.enter', draw.text, windowTraceDetails(windowInstance, draw.methodName, draw.text, draw.x, draw.y, traceDetails));

                if (isWindowTranslatedDrawActive(windowInstance)) {
                    recordDrawTrace('window.surfaceDraw.bypass', draw.text, windowTraceDetails(windowInstance, draw.methodName, draw.text, draw.x, draw.y, Object.assign({
                        reason: 'translatedDrawActive',
                    }, traceDetails)));
                    return null;
                }
                if (isDedicatedMessageWindow(windowInstance)) {
                    recordDrawTrace('window.surfaceDraw.bypass', draw.text, windowTraceDetails(windowInstance, draw.methodName, draw.text, draw.x, draw.y, Object.assign({
                        reason: 'dedicatedMessageWindow',
                    }, traceDetails)));
                    return null;
                }
                if (shouldBypassSurfaceDraw(draw.bitmap)) {
                    recordDrawTrace('window.surfaceDraw.bypass', draw.text, windowTraceDetails(windowInstance, draw.methodName, draw.text, draw.x, draw.y, Object.assign({
                        reason: 'surfaceReplayOrPipeline',
                    }, traceDetails)));
                    return null;
                }

                const observation = observePlainWindowTextDraw({
                    windowInstance,
                    tracePrefix: 'window.surfaceDraw',
                    traceMethod: draw.methodName,
                    rawText: draw.text,
                    x: draw.x,
                    y: draw.y,
                    originalParams: {
                        maxWidth: draw.maxWidth,
                        lineHeight: draw.lineHeight,
                        align: draw.align,
                    },
                    drawOrigin: {
                        type: 'bitmapSurface',
                        adapter: draw.sourceAdapter || 'bitmap',
                        methodName: draw.methodName,
                        target: 'window.contents',
                        ownerType: draw.ownerType,
                        measuredWidth: draw.measuredWidth,
                        drawState: draw.drawState,
                    },
                    traceDetails,
                    telemetryMethod: 'bitmap.drawText',
                });
                if (event && event.postDraw === true && observation && observation.entry) {
                    applySurfaceDrawBackgroundPatch(draw, observation.entry);
                    captureSourceAfterNativeDraw(windowInstance, observation.entry);
                }
                if (observation && observation.completed) {
                    if (event && event.postDraw === true) {
                        const redrawResult = redrawTranslatedText(observation.entry, observation.windowData);
                        return {
                            action: redrawResult === 'drawn' ? 'redraw-applied' : 'observed-window-surface-text',
                            reason: redrawResult || 'post-draw-window-surface-text',
                        };
                    }
                    return createSurfaceDrawDecision(windowInstance, observation.windowData, observation.entry, traceDetails);
                }
                return observation && observation.entry
                    ? { action: 'observed-window-surface-text', reason: 'observed-window-surface-text' }
                    : null;
            }

    function captureSourceAfterNativeDraw(windowInstance, entry) {
                if (!entry || !entry.translationSource || entry.skipReason) return false;
                const contents = entry.contentsBitmap || (windowInstance && windowInstance.contents) || null;
                const capture = context && typeof context.captureWindowEntrySource === 'function'
                    ? context.captureWindowEntrySource
                    : null;
                if (!capture) return false;
                try {
                    return capture(contents, entry) === true;
                } catch (_) {
                    return false;
                }
            }

    function observePlainWindowTextDraw(input = {}) {
                const windowInstance = input.windowInstance || null;
                const rawText = String(input.rawText ?? '');
                const x = input.x;
                const y = input.y;
                const type = input.type || 'drawText';
                const convertedText = input.convertedText || null;
                const textToDraw = convertedText || rawText;
                const normalizedText = String(textToDraw || '').trim();
                const visibleText = firstNonEmptyString(input.visibleText, safeStripRpgmEscapes(textToDraw), safeStripRpgmEscapes(rawText));
                const normalizedVisibleText = String(visibleText || '').trim();
                const tracePrefix = input.tracePrefix || `window.${type}`;
                const traceMethod = input.traceMethod || type;
                const originalParams = Object.assign({}, input.originalParams || {});
                if (input.drawOrigin) originalParams.drawOrigin = input.drawOrigin;
                const traceDetails = Object.assign({}, input.traceDetails || {});

                if (!normalizedText) {
                    const slotInvalidated = retireEmptyWindowTextSlot(windowInstance, type, x, y);
                    recordDrawTrace(`${tracePrefix}.skip`, rawText, windowTraceDetails(windowInstance, traceMethod, rawText, x, y, Object.assign({
                        reason: input.emptyReason || 'empty',
                        slotKey: createSlotKey(type, x, y),
                        slotInvalidated,
                    }, traceDetails)));
                    return { completed: false, reason: input.emptyReason || 'empty' };
                }

                const windowData = ensureWindowRegistered(windowInstance);
                const existing = findExistingEntry(windowData, type, rawText, normalizedText, x, y);
                if (existing) {
                    refreshEntry(windowInstance, windowData, existing, rawText, normalizedText, x, y, type, convertedText, originalParams);
                    recordDrawTrace(`${tracePrefix}.existing`, rawText, windowTraceDetails(windowInstance, traceMethod, rawText, x, y, Object.assign({
                        recordId: existing.recordId || '',
                        slotKey: existing.slotKey || createSlotKey(type, x, y),
                        status: getEntryStatus(existing),
                        bounds: cloneDiagnosticRect(existing.bounds),
                    }, traceDetails)));
                    if (isEntryCompleted(existing)) {
                        return { completed: true, phase: 'existing', entry: existing, windowData, normalizedText };
                    }
                    requestEntryTranslation(windowData, existing);
                    return { completed: false, phase: 'existing', entry: existing, windowData, normalizedText };
                }

                const eligibility = describeWindowTextEligibility(rawText, normalizedVisibleText, type);
                if (!eligibility.eligible) {
                    const skipped = recordSkippedEntry(windowInstance, windowData, rawText, x, y, type, convertedText, originalParams, eligibility);
                    recordDrawTrace(`${tracePrefix}.skip`, rawText, windowTraceDetails(windowInstance, traceMethod, rawText, x, y, Object.assign({
                        reason: eligibility.reason || 'ineligible',
                        category: eligibility.category || '',
                    }, traceDetails)));
                    return { completed: false, phase: 'skipped', entry: skipped, windowData, normalizedText };
                }

                telemetry.logDraw('original', normalizedText, x, y, {
                    windowType: getWindowTypeName(windowInstance, windowData),
                    method: input.telemetryMethod || type,
                    maxWidth: originalParams.maxWidth,
                    align: originalParams.align,
                });
                const entry = createObservedEntry(windowInstance, windowData, rawText, x, y, type, convertedText, originalParams);
                if (tracePrefix !== `window.${type}`) {
                    recordDrawTrace(`${tracePrefix}.detected`, rawText, windowTraceDetails(windowInstance, traceMethod, rawText, x, y, Object.assign({
                        recordId: entry && entry.recordId || '',
                        slotKey: entry && entry.slotKey || createSlotKey(type, x, y),
                        status: entry ? getEntryStatus(entry) : '',
                        bounds: cloneDiagnosticRect(entry && entry.bounds),
                    }, traceDetails)));
                }
                if (isEntryCompleted(entry)) {
                    return { completed: true, phase: 'detected', entry, windowData, normalizedText };
                }
                return { completed: false, phase: 'detected', entry, windowData, normalizedText };
            }

    function retireEmptyWindowTextSlot(windowInstance, type, x, y) {
                const windowData = getRegisteredWindowData(windowInstance);
                if (!windowData) return false;
                // An empty draw is still a real slot redraw. Retire the old text so
                // an in-flight translation cannot later paint over an inactive field.
                return retireEntriesInSameSlot(windowData, type, x, y, null, 'window-entry-empty') > 0;
            }

    function createSurfaceDrawDecision(windowInstance, windowData, entry, traceDetails = {}) {
                if (!entry || !entry.renderedText) return null;
                const contents = entry.contentsBitmap || (windowInstance && windowInstance.contents) || null;
                const rendered = sanitizeDrawTextOutput(entry.renderedText, entry.type);
                if (!rendered || rendered.trim() === String(entry.convertedText || '').trim()) return null;
                const position = entry.position || {};
                const params = entry.originalParams || {};
                const yOffset = calculateBitmapSurfaceTextYOffset(contents, entry, rendered);
                const drawY = (Number(position.y) || 0) + yOffset;
                const details = {
                    windowType: getWindowTypeName(windowInstance, windowData),
                    method: entry.type || '',
                    drawOrigin: entry.drawOrigin && entry.drawOrigin.type ? entry.drawOrigin.type : '',
                    translationDrawn: rendered,
                    translationReceived: entry.providerText || '',
                    yOffset: roundDiagnosticNumber(yOffset),
                };
                recordDecision(entry, 'draw.inline', 'window-owned bitmap draw replaced native draw', details);
                completePendingRenderCommand(entry, details);
                recordDrawTrace('window.surfaceDraw.inline', entry.rawText || rendered, windowTraceDetails(windowInstance, 'bitmap.drawText', entry.rawText || rendered, position.x, position.y, Object.assign({
                    recordId: entry.recordId || '',
                    slotKey: entry.slotKey || createSlotKey(entry.type, position.x, position.y),
                    status: getEntryStatus(entry),
                    replacementText: rendered,
                    replacementY: drawY,
                    yOffset,
                }, traceDetails)));
                return {
                    action: 'replace-native-draw',
                    text: rendered,
                    x: Number(position.x) || 0,
                    y: drawY,
                    maxWidth: params.maxWidth,
                    lineHeight: params.lineHeight,
                    align: normalizeDrawTextAlignValue(params.align),
                    reason: 'completed-window-surface-text',
                };
            }

    function normalizeSurfaceDrawText(payload = {}, event = {}) {
                const source = payload && typeof payload === 'object' ? payload : {};
                const bitmap = source.bitmap || source.target || null;
                const text = String((source.text !== undefined ? source.text : source.rawText) ?? '');
                return {
                    bitmap,
                    methodName: String(source.methodName || 'bitmap.drawText'),
                    text,
                    x: finiteNumber(source.x, 0),
                    y: finiteNumber(source.y, 0),
                    maxWidth: finiteNumber(source.maxWidth, 0),
                    lineHeight: positiveNumber(source.lineHeight, bitmap && bitmap.fontSize, 24),
                    align: normalizeDrawTextAlignValue(source.align),
                    drawState: source.drawState && typeof source.drawState === 'object'
                        ? Object.assign({}, source.drawState)
                        : null,
                    measuredWidth: finiteNumber(source.measuredWidth, 0),
                    backgroundPatch: normalizeSurfaceBackgroundPatch(source.backgroundPatch),
                    ownerType: String(source.ownerType || ''),
                    sourceAdapter: String((event && event.sourceAdapter) || source.sourceAdapter || ''),
                    ownershipStatus: String((event && event.status) || source.ownershipStatus || ''),
                    ownershipReason: String((event && event.reason) || ''),
                };
            }

    function normalizeSurfaceBackgroundPatch(patch) {
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

    function applySurfaceDrawBackgroundPatch(draw, entry) {
                if (!draw || !entry || !draw.backgroundPatch) return false;
                const contents = entry.contentsBitmap || (entry.ownerWindow && entry.ownerWindow.contents) || null;
                try {
                    return captureWindowEntryBackgroundPatch(contents, entry, draw.backgroundPatch) === true;
                } catch (_) {
                    return false;
                }
            }

    function resolveSurfaceDrawWindow(bitmap) {
                if (!bitmap) return null;
                try {
                    if (contentsOwners && typeof contentsOwners.get === 'function') {
                        const owner = contentsOwners.get(bitmap);
                        if (owner) return owner;
                    }
                } catch (_) {}
                try {
                    if (registeredWindows && typeof registeredWindows.forEach === 'function') {
                        let found = null;
                        registeredWindows.forEach((candidate) => {
                            if (!found && candidate && candidate.contents === bitmap) found = candidate;
                        });
                        if (found) return found;
                    }
                } catch (_) {}
                return null;
            }

    function shouldBypassSurfaceDraw(bitmap) {
                return !!(bitmap && (
                    bitmap._trBitmapReplayDepth > 0
                    || bitmap._trBitmapSkipDepth > 0
                    || bitmap._trWindowPipelineDepth > 0
                    || bitmap._trWindowTextDrawTextExReplayDepth > 0
                    || bitmap._trWindowDrawTextExReplayDepth > 0
                ));
            }

    function stringifyWindowTextInput(value) {
                return value === undefined ? '' : String(value);
            }

    function normalizeNativeWindowTextInput(value) {
                return value === undefined ? '' : value;
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
    
    function createObservedEntry(windowInstance, windowData, rawText, x, y, type, convertedText, originalParams) {
                if (!windowData) return null;
                const textToTranslate = convertedText || rawText;
                const convertedTrimmed = String(textToTranslate || '').trim();
                if (!convertedTrimmed) return null;
    
                retireEntriesInSameSlot(windowData, type, x, y);
    
                const key = generateKey(type, x, y, windowData.windowType, convertedTrimmed);
                const entry = createEntry(windowInstance, windowData, key, rawText, convertedTrimmed, x, y, type, convertedText, originalParams);
                windowData.texts.set(key, entry);
                observeEntry(windowData, entry, 'detected', { eventType: 'item.detected' });
                recordDrawTrace(`window.${type}.detected`, rawText, windowTraceDetails(windowInstance, type, rawText, x, y, {
                    recordId: entry.recordId || '',
                    slotKey: entry.slotKey || createSlotKey(type, x, y),
                    status: getEntryStatus(entry),
                    convertedText,
                    translationSource: entry.translationSource || '',
                    bounds: cloneDiagnosticRect(entry.bounds),
                    contentsRevision: entry.contentsRevision || 0,
                }));
                try {
                    if (!windowData.pendingRedraws) windowData.pendingRedraws = new Map();
                    windowData.pendingRedraws.delete(key);
                } catch (_) {}
                if (!isEntryCompleted(entry)) {
                    requestEntryTranslation(windowData, entry);
                }
                return entry;
            }
    
    function recordSkippedEntry(windowInstance, windowData, rawText, x, y, type, convertedText, originalParams, eligibility) {
                if (!windowData) return null;
                const textToDraw = convertedText || rawText;
                const convertedTrimmed = String(textToDraw || '').trim();
                if (!convertedTrimmed) return null;
                const reason = eligibility && eligibility.reason ? eligibility.reason : 'native';
    
                const existing = findExistingEntry(windowData, type, rawText, convertedTrimmed, x, y);
                if (existing) {
                    refreshEntry(windowInstance, windowData, existing, rawText, convertedTrimmed, x, y, type, convertedText, originalParams);
                    existing.skipReason = reason;
                    existing.translationSource = '';
                    existing.codecState = null;
                    observeEntry(windowData, existing, 'skipped', {
                        eventType: 'item.skipped',
                        message: existing.skipReason,
                        decision: eligibility,
                        details: { reason: existing.skipReason, nativeReplay: true },
                    });
                    recordDrawTrace(`window.${type}.skipped`, rawText, windowTraceDetails(windowInstance, type, rawText, x, y, {
                        recordId: existing.recordId || '',
                        slotKey: existing.slotKey || createSlotKey(type, x, y),
                        reason: existing.skipReason,
                        category: eligibility && eligibility.category ? eligibility.category : '',
                        status: getEntryStatus(existing, 'skipped'),
                        convertedText,
                        bounds: cloneDiagnosticRect(existing.bounds),
                    }));
                    return existing;
                }
    
                retireEntriesInSameSlot(windowData, type, x, y);
    
                const key = generateKey(type, x, y, windowData.windowType, convertedTrimmed);
                const entry = createEntry(windowInstance, windowData, key, rawText, convertedTrimmed, x, y, type, convertedText, originalParams);
                entry.isTranslatable = false;
                entry.skipReason = reason;
                entry.translationSource = '';
                entry.normalizedSource = '';
                entry.codecState = null;
                windowData.texts.set(key, entry);
                observeEntry(windowData, entry, 'skipped', {
                    eventType: 'item.skipped',
                    message: entry.skipReason,
                    decision: eligibility,
                    details: { reason: entry.skipReason, nativeReplay: true },
                });
                recordDrawTrace(`window.${type}.skipped`, rawText, windowTraceDetails(windowInstance, type, rawText, x, y, {
                    recordId: entry.recordId || '',
                    slotKey: entry.slotKey || createSlotKey(type, x, y),
                    reason: entry.skipReason,
                    category: eligibility && eligibility.category ? eligibility.category : '',
                    status: getEntryStatus(entry, 'skipped'),
                    convertedText,
                    bounds: cloneDiagnosticRect(entry.bounds),
                }));
                try {
                    if (!windowData.pendingRedraws) windowData.pendingRedraws = new Map();
                    windowData.pendingRedraws.delete(key);
                } catch (_) {}
                return entry;
            }
    
    function createEntry(windowInstance, windowData, key, rawText, convertedTrimmed, x, y, type, convertedText, originalParams) {
                const contents = windowInstance && windowInstance.contents ? windowInstance.contents : null;
                const surfaceId = getSurfaceId(windowData);
                const identitySurfaceId = getIdentitySurfaceId(windowInstance, windowData);
                const codecState = prepareTranslationSource(convertedText || convertedTrimmed || rawText);
                const translationText = codecState.translationText || convertedTrimmed || rawText;
                const drawOrigin = normalizeDrawOrigin(originalParams && originalParams.drawOrigin, type);
                const entry = {
                    key,
                    recordId: createWindowTextRecordId(identitySurfaceId || surfaceId, createSlotKey(type, x, y), translationText),
                    surfaceId,
                    identitySurfaceId,
                    slotKey: createSlotKey(type, x, y),
                    sourceAdapter: ADAPTER_ID,
                    type,
                    rawText,
                    convertedText: convertedTrimmed,
                    visibleText: stripControls(convertedText || convertedTrimmed || rawText),
                    translationSource: translationText,
                    normalizedSource: String(translationText || '').trim(),
                    codecState,
                    renderedText: '',
                    providerText: '',
                    position: { x, y },
                    originalParams: normalizeOriginalParams(originalParams),
                    drawOrigin,
                    timestamp: Date.now(),
                    drawState: drawOrigin.drawState || captureBitmapDrawState(contents),
                    contentsBitmap: contents,
                    contentsRevision: windowData.contentsRevision || 0,
                    surfaceRevision: 1,
                    drawOrder: 0,
                    bounds: null,
                    ownerWindow: windowInstance,
                    windowData,
                    _trSurfaceVisible: true,
                };
                markEntryObservedInRefresh(entry, windowInstance, windowData);
                assignWindowTextDrawOrder(contents, entry);
                refreshEntryBounds(windowInstance, entry, convertedText || convertedTrimmed || rawText);
                captureWindowEntryBackground(contents, entry);
                telemetry.logTextDetected(type, convertedTrimmed, x, y, {
                    converted: convertedText,
                    windowType: windowData.windowType || 'unknown',
                });
                return entry;
            }
    
    function refreshEntry(windowInstance, windowData, entry, rawText, convertedTrimmed, x, y, type, convertedText, originalParams) {
                entry.type = type || entry.type;
                entry.rawText = rawText;
                entry.convertedText = convertedTrimmed;
                entry.visibleText = stripControls(convertedText || convertedTrimmed || rawText);
                entry.position = { x, y };
                entry.originalParams = normalizeOriginalParams(originalParams || entry.originalParams || {});
                entry.drawOrigin = normalizeDrawOrigin(originalParams ? originalParams.drawOrigin : entry.drawOrigin, type);
                entry.timestamp = Date.now();
                entry.contentsBitmap = windowInstance && windowInstance.contents ? windowInstance.contents : entry.contentsBitmap;
                entry.contentsRevision = windowData ? (windowData.contentsRevision || 0) : entry.contentsRevision;
                if (windowData) {
                    entry.surfaceId = getSurfaceId(windowData) || entry.surfaceId;
                    entry.identitySurfaceId = getIdentitySurfaceId(windowInstance, windowData) || entry.identitySurfaceId;
                }
                entry.ownerWindow = windowInstance || entry.ownerWindow;
                entry.windowData = windowData || entry.windowData;
                entry.drawState = entry.drawOrigin && entry.drawOrigin.drawState
                    ? entry.drawOrigin.drawState
                    : captureBitmapDrawState(windowInstance && windowInstance.contents);
                markEntryObservedInRefresh(entry, windowInstance, windowData);
                entry.surfaceRevision = (Number(entry.surfaceRevision) || 0) + 1;
                clearPendingInvalidation(entry);
                retireEntriesInSameSlot(windowData, type, x, y, entry);
                assignWindowTextDrawOrder(entry.contentsBitmap, entry);
    
                const codecState = prepareTranslationSource(convertedText || convertedTrimmed || rawText);
                const translationText = codecState.translationText || convertedTrimmed || rawText;
                entry.translationSource = translationText;
                entry.normalizedSource = String(translationText || '').trim();
                entry.codecState = codecState;
                refreshEntryBounds(windowInstance, entry, convertedText || convertedTrimmed || rawText);
                ensureWindowEntryBackground(entry.contentsBitmap, entry);
                observeEntry(windowData, entry, getEntryStatus(entry, 'detected'), {
                    eventType: 'item.observed',
                });
                return entry;
            }

    function normalizeOriginalParams(params) {
                const source = params && typeof params === 'object' ? params : {};
                const next = Object.assign({}, source);
                delete next.drawOrigin;
                return next;
            }

    function normalizeDrawOrigin(origin, methodName) {
                if (!origin || typeof origin !== 'object') {
                    return { type: 'window', adapter: ADAPTER_ID, methodName: methodName || 'drawText' };
                }
                return {
                    type: String(origin.type || 'window'),
                    adapter: String(origin.adapter || ADAPTER_ID),
                    methodName: String(origin.methodName || methodName || 'drawText'),
                    target: String(origin.target || ''),
                    ownerType: String(origin.ownerType || ''),
                    measuredWidth: finiteNumber(origin.measuredWidth, 0),
                    drawState: origin.drawState && typeof origin.drawState === 'object'
                        ? Object.assign({}, origin.drawState)
                        : null,
                };
            }
    
        return { handleDrawText, handleDrawTextEx, handleSurfaceDrawText, createObservedEntry, recordSkippedEntry, createEntry, refreshEntry };
    }
    
    defineRuntimeModule('adapters.windowTextDrawObserver', { create: createDrawObserverController });

})();
