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
    const { telemetry, ensureWindowRegistered, generateKey, stripControls, ADAPTER_ID, entryLifecycleState } = context;
    const renderTransaction = context.renderTransaction;
    const { lifecycle: lifecycleService, surface: surfaceService, draw: drawService, replay: replayService } = context.services;
    const { bitmapReplay, diagnostics, entryLifecycle, entryRecords, renderCommands, renderDraw, sourceDraw, textConversion, textMetrics } = context.facades;
    const { recordDrawTrace, windowTraceDetails, recordDecision, roundDiagnosticNumber, cloneDiagnosticRect } = diagnostics;
    const { requestEntryTranslation, observeEntry, getEntryStatus, isEntryCompleted, firstNonEmptyString, getRegisteredWindowData, markEntryObservedInRefresh, safeStripRpgmEscapes, describeWindowScreenState } = entryRecords;
    const { completePendingRenderCommand, redrawTranslatedText } = renderCommands;
    const { invokeCompletedEntry, invokeOriginalDrawText, invokeOriginalDrawTextEx, isWindowTranslatedDrawActive } = renderDraw;
    const { findExistingEntry, retireEntriesInSameSlot, clearPendingInvalidation, getCurrentEntry, getTextEntryKey, resolveTargetWindow, refreshEntryBounds } = entryLifecycle;
    const { captureWindowEntrySource, beginEntryNativeSourceDraw, completeEntryNativeSourceDraw } = sourceDraw;
    const { estimateEntryBounds, prepareTranslationSource, describeWindowTextEligibility, isDedicatedMessageWindow, getSurfaceId, getIdentitySurfaceId, createSlotKey, createWindowTextRecordId, getWindowTypeName, getWindowCtorName, normalizeDrawTextAlignValue } = textMetrics;
    const { sanitizeDrawTextOutput, convertWindowText } = textConversion;
    const { isValidRect, calculateBitmapSurfaceTextYOffset, assignWindowTextDrawOrder, captureWindowEntryBackground, captureWindowEntryBackgroundPatch, ensureWindowEntryBackground } = bitmapReplay;

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
                    recordDrawTrace('window.drawTextEx.bypass', textStr, windowTraceDetails(windowInstance, 'drawTextEx', textStr, x, y, {
                        reason: 'dedicatedMessageWindow',
                        maxWidth: Infinity,
                        align: 'left',
                    }));
                    return invokeOriginal();
                }
    
                const convertedText = convertWindowText(windowInstance, textStr);
                const convertedTrimmed = String(convertedText || '').trim();
                const visibleText = safeStripRpgmEscapes(convertedText || convertedTrimmed || textStr).trim();
                const params = { maxWidth: Infinity, align: 'left' };
                if (!convertedTrimmed) {
                    const slotInvalidated = retireEmptyWindowTextSlot(windowInstance, 'drawTextEx', x, y, params);
                    recordDrawTrace('window.drawTextEx.skip', textStr, windowTraceDetails(windowInstance, 'drawTextEx', textStr, x, y, {
                        reason: text === undefined ? 'missingTextArgument' : 'emptyConverted',
                        convertedText,
                        slotKey: createSlotKey('drawTextEx', x, y, params),
                        slotInvalidated,
                        maxWidth: Infinity,
                        align: 'left',
                    }));
                    return invokeOriginal();
                }

                const geometry = describeDrawableWindowTextGeometry('drawTextEx', x, y, params);
                if (!geometry.drawable) {
                    recordDrawTrace('window.drawTextEx.skip', textStr, windowTraceDetails(windowInstance, 'drawTextEx', textStr, x, y, {
                        reason: geometry.reason,
                        geometry: geometry.details,
                        convertedText,
                        maxWidth: Infinity,
                        align: 'left',
                    }));
                    return invokeOriginal();
                }

                const drawRole = describeWindowTextDrawRole(windowInstance, 'drawTextEx', x, y, params, convertedText || textStr);
                if (!drawRole.renderable) {
                    retireNonRenderableSlot(windowInstance, 'drawTextEx', x, y, params, drawRole.reason);
                    recordDrawTrace('window.drawTextEx.skip', textStr, windowTraceDetails(windowInstance, 'drawTextEx', textStr, x, y, {
                        reason: drawRole.reason,
                        drawRole: drawRole.role,
                        bounds: cloneDiagnosticRect(drawRole.bounds),
                        contentsSize: drawRole.contentsSize,
                        convertedText,
                        maxWidth: Infinity,
                        align: 'left',
                    }));
                    return invokeOriginal();
                }
    
                const windowData = ensureWindowRegistered(windowInstance);
                params.drawRole = drawRole.role;
                const existing = findExistingEntry(windowData, 'drawTextEx', textStr, convertedTrimmed, x, y, params);
                if (existing) {
                    refreshEntry(windowInstance, windowData, existing, textStr, convertedTrimmed, x, y, 'drawTextEx', convertedText, params);
                    recordDrawTrace('window.drawTextEx.existing', textStr, windowTraceDetails(windowInstance, 'drawTextEx', textStr, x, y, {
                        recordId: existing.recordId || '',
                        slotKey: existing.slotKey || createSlotKey('drawTextEx', x, y, params),
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
                        drawBoundary: draw.drawBoundary,
                    },
                    traceDetails,
                    telemetryMethod: 'bitmap.drawText',
                });
                if (observation && observation.entry) {
                    // Bitmap-owned batches carry the clean pre-native backdrop on a
                    // later surface event. Apply it for existing entries too, not
                    // only post-draw notifications, so async redraw restores clean
                    // pixels instead of the stale source snapshot captured earlier.
                    applySurfaceDrawBackgroundPatch(draw, observation.entry);
                }
                if (event && event.postDraw === true && observation && observation.entry) {
                    captureSourceAfterNativeDraw(windowInstance, observation.entry);
                }
                if (observation && observation.completed) {
                    if (event && event.postDraw === true) {
                        const redrawResult = redrawTranslatedText(observation.entry, observation.windowData);
                        return {
                            action: redrawResult && redrawResult.status === 'accepted' ? 'redraw-applied' : 'observed-window-surface-text',
                            reason: redrawResult && redrawResult.reason || 'post-draw-window-surface-text',
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
                const contents = bindEntryToLiveSourceContents(windowInstance, entry)
                    || entry.contentsBitmap
                    || (windowInstance && windowInstance.contents)
                    || null;
                let captured = false;
                try {
                    captured = captureWindowEntrySource(contents, entry) === true;
                } catch (_) {
                    captured = false;
                }
                completeNativeSourceDraw(entry);
                flushQueuedRenderAfterNativeSourceDraw(entry);
                return captured;
            }

    function bindEntryToLiveSourceContents(windowInstance, entry) {
                if (!entry || !windowInstance || !windowInstance.contents) return entry && entry.contentsBitmap || null;
                const liveContents = windowInstance.contents;
                if (entry.contentsBitmap === liveContents) return liveContents;
                const windowData = getRegisteredWindowData(windowInstance) || entry.windowData || null;
                if (windowData && getCurrentEntry(windowData, entry) !== entry) {
                    return entry.contentsBitmap || liveContents;
                }
                entry.contentsBitmap = liveContents;
                entry.ownerWindow = windowInstance;
                if (windowData) {
                    entry.windowData = windowData;
                    entry.contentsRevision = windowData.contentsRevision || 0;
                    entry.surfaceId = getSurfaceId(windowData) || entry.surfaceId;
                    entry.identitySurfaceId = getIdentitySurfaceId(windowInstance, windowData) || entry.identitySurfaceId;
                }
                assignWindowTextDrawOrder(liveContents, entry);
                return liveContents;
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
                    const slotInvalidated = retireEmptyWindowTextSlot(windowInstance, type, x, y, originalParams);
                    recordDrawTrace(`${tracePrefix}.skip`, rawText, windowTraceDetails(windowInstance, traceMethod, rawText, x, y, Object.assign({
                        reason: input.emptyReason || 'empty',
                        slotKey: createSlotKey(type, x, y, originalParams),
                        slotInvalidated,
                    }, traceDetails)));
                    return { completed: false, reason: input.emptyReason || 'empty' };
                }

                const geometry = describeDrawableWindowTextGeometry(type, x, y, originalParams);
                if (!geometry.drawable) {
                    recordDrawTrace(`${tracePrefix}.skip`, rawText, windowTraceDetails(windowInstance, traceMethod, rawText, x, y, Object.assign({
                        reason: geometry.reason,
                        geometry: geometry.details,
                    }, traceDetails)));
                    return { completed: false, reason: geometry.reason };
                }

                if (type === 'drawTextEx') {
                    const drawRole = describeWindowTextDrawRole(windowInstance, type, x, y, originalParams, textToDraw);
                    if (!drawRole.renderable) {
                        retireNonRenderableSlot(windowInstance, type, x, y, originalParams, drawRole.reason);
                        recordDrawTrace(`${tracePrefix}.skip`, rawText, windowTraceDetails(windowInstance, traceMethod, rawText, x, y, Object.assign({
                            reason: drawRole.reason,
                            drawRole: drawRole.role,
                            bounds: cloneDiagnosticRect(drawRole.bounds),
                            contentsSize: drawRole.contentsSize,
                        }, traceDetails)));
                        return { completed: false, phase: 'non-renderable', reason: drawRole.reason, drawRole };
                    }
                    originalParams.drawRole = drawRole.role;
                }

                const windowData = ensureWindowRegistered(windowInstance);
                const existing = findExistingEntry(windowData, type, rawText, normalizedText, x, y, originalParams);
                if (existing) {
                    refreshEntry(windowInstance, windowData, existing, rawText, normalizedText, x, y, type, convertedText, originalParams);
                    recordDrawTrace(`${tracePrefix}.existing`, rawText, windowTraceDetails(windowInstance, traceMethod, rawText, x, y, Object.assign({
                        recordId: existing.recordId || '',
                        slotKey: existing.slotKey || createSlotKey(type, x, y, originalParams),
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
                        slotKey: entry && entry.slotKey || createSlotKey(type, x, y, originalParams),
                        status: entry ? getEntryStatus(entry) : '',
                        bounds: cloneDiagnosticRect(entry && entry.bounds),
                    }, traceDetails)));
                }
                if (isEntryCompleted(entry)) {
                    return { completed: true, phase: 'detected', entry, windowData, normalizedText };
                }
                return { completed: false, phase: 'detected', entry, windowData, normalizedText };
            }

    function retireEmptyWindowTextSlot(windowInstance, type, x, y, params = null) {
                const windowData = getRegisteredWindowData(windowInstance);
                if (!windowData) return false;
                // An empty draw is still a real slot redraw. Retire the old text so
                // an in-flight translation cannot later paint over an inactive field.
                return retireEntriesInSameSlot(windowData, type, x, y, null, 'window-entry-empty', params) > 0;
            }

    function retireNonRenderableSlot(windowInstance, type, x, y, params = null, reason = 'offscreen-draw') {
                const windowData = getRegisteredWindowData(windowInstance);
                if (!windowData) return false;
                return retireEntriesInSameSlot(windowData, type, x, y, null, reason || 'offscreen-draw', params) > 0;
            }

    function createSurfaceDrawDecision(windowInstance, windowData, entry, traceDetails = {}) {
                if (!entry || !entry.renderedText) return null;
                const contents = entry.contentsBitmap || (windowInstance && windowInstance.contents) || null;
                const rendered = sanitizeDrawTextOutput(entry.renderedText, entry.type);
                if (!rendered || rendered.trim() === String(entry.convertedText || '').trim()) return null;
                const position = entry.position || {};
                const params = entry.originalParams || {};
                const geometry = describeDrawableWindowTextGeometry(entry.type || 'drawText', position.x, position.y, params);
                if (!geometry.drawable) return null;
                const yOffset = calculateBitmapSurfaceTextYOffset(contents, entry, rendered);
                const drawY = geometry.details.y + yOffset;
                const details = {
                    windowType: getWindowTypeName(windowInstance, windowData),
                    method: entry.type || '',
                    renderMode: 'native-substitution',
                    drawOrigin: entry.drawOrigin && entry.drawOrigin.type ? entry.drawOrigin.type : '',
                    translationDrawn: rendered,
                    translationReceived: entry.providerText || '',
                    yOffset: roundDiagnosticNumber(yOffset),
                };
                recordDecision(entry, 'draw.inline', 'window-owned bitmap draw replaced native draw', details);
                completePendingRenderCommand(entry, details);
                recordDrawTrace('window.surfaceDraw.inline', entry.rawText || rendered, windowTraceDetails(windowInstance, 'bitmap.drawText', entry.rawText || rendered, position.x, position.y, Object.assign({
                    recordId: entry.recordId || '',
                    slotKey: entry.slotKey || createSlotKey(entry.type, position.x, position.y, entry.originalParams),
                    status: getEntryStatus(entry),
                    replacementText: rendered,
                    replacementY: drawY,
                    yOffset,
                }, traceDetails)));
                rememberInlineRenderedBounds(windowInstance, entry, rendered, drawY);
                return {
                    action: 'replace-native-draw',
                    text: rendered,
                    x: geometry.details.x,
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
                    x: source.x,
                    y: source.y,
                    maxWidth: source.maxWidth,
                    lineHeight: positiveNumber(source.lineHeight, bitmap && bitmap.fontSize, 24),
                    align: normalizeDrawTextAlignValue(source.align),
                    drawState: source.drawState && typeof source.drawState === 'object'
                        ? Object.assign({}, source.drawState)
                        : null,
                    drawBoundary: source.drawBoundary && typeof source.drawBoundary === 'object'
                        ? renderTransaction.createSourceDrawBoundary(source.drawBoundary)
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
                const match = surfaceService.resolveWindowSurfaceForContents(bitmap);
                if (match && (match.windowInstance || match.owner)) return match.windowInstance || match.owner;
                return null;
            }

    function shouldBypassSurfaceDraw(bitmap) {
                const guarded = bitmap ? !!getBitmapDrawGuardService().getRenderGuardReason(bitmap) : false;
                return !!(bitmap && (
                    guarded
                    || bitmap._trWindowPipelineDepth > 0
                    || bitmap._trWindowTextDrawTextExReplayDepth > 0
                    || bitmap._trWindowDrawTextExReplayDepth > 0
                ));
            }

    function getBitmapDrawGuardService() {
                const bitmapDraws = replayService && replayService.bitmapDraws;
                if (!bitmapDraws || typeof bitmapDraws.getRenderGuardReason !== 'function') {
                    throw new Error('[WindowText] bitmap draw guard service is required.');
                }
                return bitmapDraws;
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

    function describeDrawableWindowTextGeometry(type, x, y, params = {}) {
                const invalid = [];
                const drawX = normalizeDrawableNumber(x);
                const drawY = normalizeDrawableNumber(y);
                if (drawX === null) invalid.push('x');
                if (drawY === null) invalid.push('y');
                if (type !== 'drawTextEx') {
                    const maxWidth = normalizeDrawableNumber(params && params.maxWidth);
                    if (maxWidth === null || maxWidth <= 0) invalid.push('maxWidth');
                }
                if (!invalid.length) {
                    return {
                        drawable: true,
                        reason: '',
                        details: {
                            x: drawX,
                            y: drawY,
                        },
                    };
                }
                return {
                    drawable: false,
                    reason: 'invalidDrawGeometry',
                    details: {
                        invalid,
                        x: describeDrawNumber(x),
                        y: describeDrawNumber(y),
                        maxWidth: describeDrawNumber(params && params.maxWidth),
                    },
                };
            }

    function describeWindowTextDrawRole(windowInstance, type, x, y, params = {}, textForMeasure = '') {
                const geometry = describeDrawableWindowTextGeometry(type, x, y, params);
                if (!geometry.drawable) {
                    return {
                        role: 'invalid',
                        renderable: false,
                        reason: geometry.reason || 'invalidDrawGeometry',
                        bounds: null,
                        contentsSize: null,
                    };
                }

                const contents = windowInstance && windowInstance.contents ? windowInstance.contents : null;
                const contentsWidth = normalizePositiveDimension(contents && contents.width);
                const contentsHeight = normalizePositiveDimension(contents && contents.height);
                if (contentsWidth === null || contentsHeight === null) {
                    return {
                        role: 'visible',
                        renderable: true,
                        reason: '',
                        bounds: null,
                        contentsSize: null,
                    };
                }

                let bounds = null;
                try {
                    bounds = estimateEntryBounds(
                        windowInstance,
                        type,
                        textForMeasure,
                        x,
                        y,
                        textForMeasure,
                        params
                    );
                } catch (_) {
                    bounds = null;
                }
                if (!isValidRect(bounds)) {
                    return {
                        role: 'visible',
                        renderable: true,
                        reason: '',
                        bounds: null,
                        contentsSize: {
                            width: contentsWidth,
                            height: contentsHeight,
                        },
                    };
                }

                const intersects = Number(bounds.x2) > 0
                    && Number(bounds.y2) > 0
                    && Number(bounds.x1) < contentsWidth
                    && Number(bounds.y1) < contentsHeight;
                if (intersects) {
                    return {
                        role: 'visible',
                        renderable: true,
                        reason: '',
                        bounds,
                        contentsSize: {
                            width: contentsWidth,
                            height: contentsHeight,
                        },
                    };
                }

                const role = type === 'drawTextEx' ? 'layout-measurement' : 'offscreen-draw';
                return {
                    role,
                    renderable: false,
                    reason: role,
                    bounds,
                    contentsSize: {
                        width: contentsWidth,
                        height: contentsHeight,
                    },
                };
            }

    function normalizePositiveDimension(value) {
                const numeric = Number(value);
                return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
            }

    function normalizeDrawableNumber(value) {
                if (value === null || value === undefined) return null;
                if (typeof value === 'number') return Number.isFinite(value) ? value : null;
                if (typeof value === 'string') {
                    if (!value.trim()) return null;
                    const numeric = Number(value);
                    return Number.isFinite(numeric) ? numeric : null;
                }
                return null;
            }

    function describeDrawNumber(value) {
                const numeric = normalizeDrawableNumber(value);
                return numeric === null ? null : numeric;
            }
    
    function createObservedEntry(windowInstance, windowData, rawText, x, y, type, convertedText, originalParams) {
                if (!windowData) return null;
                const textToTranslate = convertedText || rawText;
                const convertedTrimmed = String(textToTranslate || '').trim();
                if (!convertedTrimmed) return null;
    
                retireEntriesInSameSlot(windowData, type, x, y, null, 'window-entry-replaced', originalParams);
    
                const slotKey = createSlotKey(type, x, y, originalParams);
                const key = generateKey(type, x, y, windowData.windowType, convertedTrimmed, slotKey);
                const entry = createEntry(windowInstance, windowData, key, rawText, convertedTrimmed, x, y, type, convertedText, originalParams);
                windowData.texts.set(key, entry);
                observeEntry(windowData, entry, 'detected', { eventType: 'item.detected' });
                recordDrawTrace(`window.${type}.detected`, rawText, windowTraceDetails(windowInstance, type, rawText, x, y, {
                    recordId: entry.recordId || '',
                    slotKey: entry.slotKey || slotKey,
                    status: getEntryStatus(entry),
                    convertedText,
                    translationSource: entry.translationSource || '',
                    bounds: cloneDiagnosticRect(entry.bounds),
                    contentsRevision: entry.contentsRevision || 0,
                }));
                try {
                    if (windowData.renderQueue) windowData.renderQueue.delete(key);
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
    
                const existing = findExistingEntry(windowData, type, rawText, convertedTrimmed, x, y, originalParams);
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
                        slotKey: existing.slotKey || createSlotKey(type, x, y, originalParams),
                        reason: existing.skipReason,
                        category: eligibility && eligibility.category ? eligibility.category : '',
                        status: getEntryStatus(existing, 'skipped'),
                        convertedText,
                        bounds: cloneDiagnosticRect(existing.bounds),
                    }));
                    return existing;
                }
    
                retireEntriesInSameSlot(windowData, type, x, y, null, 'window-entry-replaced', originalParams);
    
                const slotKey = createSlotKey(type, x, y, originalParams);
                const key = generateKey(type, x, y, windowData.windowType, convertedTrimmed, slotKey);
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
                    slotKey: entry.slotKey || slotKey,
                    reason: entry.skipReason,
                    category: eligibility && eligibility.category ? eligibility.category : '',
                    status: getEntryStatus(entry, 'skipped'),
                    convertedText,
                    bounds: cloneDiagnosticRect(entry.bounds),
                }));
                try {
                    if (windowData.renderQueue) windowData.renderQueue.delete(key);
                } catch (_) {}
                return entry;
            }

    function createEntry(windowInstance, windowData, key, rawText, convertedTrimmed, x, y, type, convertedText, originalParams) {
                const contents = windowInstance && windowInstance.contents ? windowInstance.contents : null;
                const surfaceId = getSurfaceId(windowData);
                const identitySurfaceId = getIdentitySurfaceId(windowInstance, windowData);
                const textSource = prepareTranslationSource(convertedText || convertedTrimmed || rawText);
                const codecState = textSource.codecState;
                const translationText = textSource.translationSource || convertedTrimmed || rawText;
                const drawOrigin = normalizeDrawOrigin(originalParams && originalParams.drawOrigin, type);
                const screenState = describeWindowScreenState(windowInstance, windowData);
                const entry = {
                    key,
                    recordId: createWindowTextRecordId(identitySurfaceId || surfaceId, createSlotKey(type, x, y, originalParams), translationText),
                    surfaceId,
                    identitySurfaceId,
                    slotKey: createSlotKey(type, x, y, originalParams),
                    sourceAdapter: ADAPTER_ID,
                    type,
                    rawText,
                    convertedText: convertedTrimmed,
                    visibleText: textSource.visibleText,
                    translationSource: translationText,
                    normalizedSource: textSource.normalizedSource,
                    codecState,
                    renderedText: '',
                    providerText: '',
                    position: { x, y },
                    originalParams: normalizeOriginalParams(originalParams),
                    drawOrigin,
                    timestamp: Date.now(),
                    drawState: drawOrigin.drawState || drawService.captureBitmapDrawState(contents),
                    contentsBitmap: contents,
                    contentsRevision: windowData.contentsRevision || 0,
                    surfaceRevision: 1,
                    drawOrder: 0,
                    bounds: null,
                    renderedBounds: null,
                    ownerWindow: windowInstance,
                    windowData,
                };
                entryLifecycleState.ensure(entry);
                entryLifecycleState.setSurfaceVisible(entry, screenState === 'visible', {
                    reason: 'window-entry-created',
                    screenState,
                });
                markEntryObservedInRefresh(entry, windowInstance, windowData);
                beginNativeSourceDraw(entry, 'window-native-source-draw');
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
                const screenState = describeWindowScreenState(entry.ownerWindow, entry.windowData);
                entryLifecycleState.setSurfaceVisible(entry, screenState === 'visible', {
                    reason: 'window-entry-refreshed',
                    screenState,
                });
                entry.drawState = entry.drawOrigin && entry.drawOrigin.drawState
                    ? entry.drawOrigin.drawState
                    : drawService.captureBitmapDrawState(windowInstance && windowInstance.contents);
                entry.renderedBounds = null;
                markEntryObservedInRefresh(entry, windowInstance, windowData);
                entry.surfaceRevision = (Number(entry.surfaceRevision) || 0) + 1;
                beginNativeSourceDraw(entry, 'window-native-source-refresh');
                clearPendingInvalidation(entry);
                entry.slotKey = createSlotKey(type, x, y, entry.originalParams);
                retireEntriesInSameSlot(windowData, type, x, y, entry, 'window-entry-replaced', entry.originalParams);
                assignWindowTextDrawOrder(entry.contentsBitmap, entry);
    
                const textSource = prepareTranslationSource(convertedText || convertedTrimmed || rawText);
                const codecState = textSource.codecState;
                const translationText = textSource.translationSource || convertedTrimmed || rawText;
                entry.visibleText = textSource.visibleText;
                entry.translationSource = translationText;
                entry.normalizedSource = textSource.normalizedSource;
                entry.codecState = codecState;
                refreshEntryBounds(windowInstance, entry, convertedText || convertedTrimmed || rawText);
                ensureWindowEntryBackground(entry.contentsBitmap, entry);
                observeEntry(windowData, entry, getEntryStatus(entry, 'detected'), {
                    eventType: 'item.observed',
                });
                return entry;
            }

    function rememberInlineRenderedBounds(windowInstance, entry, rendered, drawY) {
                if (!entry) return;
                const position = entry.position || {};
                try {
                    entry.renderedBounds = cloneRenderedBounds(estimateEntryBounds(
                        windowInstance,
                        entry.type,
                        rendered,
                        position.x,
                        drawY,
                        rendered,
                        entry.originalParams
                    ));
                } catch (_) {
                    entry.renderedBounds = null;
                }
            }

    function cloneRenderedBounds(bounds) {
                if (!isValidRect(bounds)) return null;
                return {
                    x1: Number(bounds.x1),
                    y1: Number(bounds.y1),
                    x2: Number(bounds.x2),
                    y2: Number(bounds.y2),
                };
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
                    drawBoundary: origin.drawBoundary && typeof origin.drawBoundary === 'object'
                        ? renderTransaction.createSourceDrawBoundary(origin.drawBoundary)
                        : null,
                };
            }

    function beginNativeSourceDraw(entry, reason) {
                if (!shouldTrackNativeSourceDraw(entry)) return false;
                try {
                    const result = beginEntryNativeSourceDraw(entry, reason);
                    return !!(result && result.accepted === true && result.phase === 'source-draw-observed');
                } catch (_) {
                    return false;
                }
            }

    function completeNativeSourceDraw(entry) {
                try {
                    const result = completeEntryNativeSourceDraw(entry, 'window-native-source-draw-complete');
                    return !!(result && result.accepted === true && result.phase === 'source-draw-committed');
                } catch (_) {
                    return false;
                }
            }

    function flushQueuedRenderAfterNativeSourceDraw(entry) {
                if (!entry || !entry.windowData || !entry.windowData.renderQueue) return false;
                const key = entry.key || getTextEntryKey(entry.windowData, entry);
                const queued = key ? entry.windowData.renderQueue.get(key) : null;
                if (!queued || queued.entry !== entry || queued.queue !== 'after-source-draw') return false;
                if (!isEntryCompleted(entry) || !entry.renderedText) return false;
                const ownerWindow = entry.ownerWindow || resolveTargetWindow(entry, entry.windowData);
                if (!ownerWindow) return false;
                return lifecycleService.withRenderDrain(
                    ownerWindow,
                    entry.windowData,
                    'native-source-draw-complete',
                    () => {
                        const result = redrawTranslatedText(entry, entry.windowData);
                        return !!(result && result.status === 'accepted');
                    }
                ) === true;
            }

    function shouldTrackNativeSourceDraw(entry) {
                return !!(entry
                    && (!entry.drawOrigin || !entry.drawOrigin.type || entry.drawOrigin.type === 'window'));
            }
    
        return { handleDrawText, handleDrawTextEx, handleSurfaceDrawText, createObservedEntry, recordSkippedEntry, createEntry, refreshEntry };
    }
    
    defineRuntimeModule('adapters.windowTextDrawObserver', { create: createDrawObserverController });

})();
