// Window text adapter support: draw observer.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'adapters.windowText.drawObserver',
        requires: {
            surfaceDrawSupportModule: 'adapters.windowText.surfaceDrawSupport',
            drawTextExRefitModule: 'adapters.windowText.drawTextExRefit',
            drawInputModule: 'adapters.windowText.drawInput',
            entryObservationModule: 'adapters.windowText.entryObservation',
            sourceDrawSupportModule: 'adapters.windowText.sourceDrawSupport',
            surfaceRoleState: 'runtime.windowSurfaceRoleState',
            conversionScope: 'runtime.conversionScope',
        },
        factory({
            surfaceDrawSupportModule,
            drawTextExRefitModule,
            drawInputModule,
            entryObservationModule,
            sourceDrawSupportModule,
            surfaceRoleState,
            conversionScope,
        }) {

    function createDrawObserverController(context = {}) {
    const { telemetry, ensureWindowRegistered, generateKey, ADAPTER_ID, entryLifecycleState } = context;
    const { lifecycle: lifecycleService, draw: drawService } = context.services;
    const { bitmapReplay, diagnostics, entryLifecycle, entryRecords, renderCommands, renderDraw, textConversion, textMetrics } = context.facades;
    const { recordDrawTrace, windowTraceDetails, cloneDiagnosticRect } = diagnostics;
    const { requestEntryTranslation, observeEntry, getEntryStatus, isEntryCompleted, getRegisteredWindowData, markEntryObservedInRefresh, safeStripRpgmEscapes, describeWindowScreenState } = entryRecords;
    const { redrawTranslatedText } = renderCommands;
    const { invokeCompletedEntry, invokeOriginalDrawText, invokeOriginalDrawTextEx, isWindowTranslatedDrawActive } = renderDraw;
    const { findExistingEntry, retireEntriesInExactSlot, retireEntriesForReplacementDraw, clearPendingInvalidation, refreshEntryBounds } = entryLifecycle;
    const { describeWindowTextEligibility, isDedicatedMessageWindow, getSurfaceId, getIdentitySurfaceId, createSlotKey, createWindowTextRecordId, getWindowTypeName, normalizeDrawTextAlignValue } = textMetrics;
    const { sanitizeDrawTextOutput, convertWindowText } = textConversion;
    const { calculateBitmapSurfaceTextYOffset, assignWindowTextDrawOrder, rememberInlineReplacement, captureWindowEntryBackground, ensureWindowEntryBackground } = bitmapReplay;
    const surfaceDrawSupport = surfaceDrawSupportModule.create({
                ADAPTER_ID,
                renderTransaction: context.renderTransaction,
                services: context.services,
                facades: context.facades,
            });
    const {
                normalizeSurfaceDrawText,
                applySurfaceDrawBackgroundPatch,
                resolveSurfaceDrawWindow,
                describeSurfaceDrawSourceObservation,
                getWindowDrawTextExReplayDepth,
                isCommittedSurfaceDrawEvent,
                normalizeOriginalParams,
                normalizeDrawOrigin,
            } = surfaceDrawSupport;
    const drawTextExRefit = drawTextExRefitModule.create({
                entryLifecycleState,
                services: context.services,
                facades: context.facades,
            });
    const {
                refitCompletedDrawTextExBeforeNeighbor,
            } = drawTextExRefit;
    const drawInput = drawInputModule.create({
                facades: context.facades,
            });
    const {
                classifyDrawTextInput,
                classifyDrawTextExInput,
                classifySurfaceDrawInput,
            } = drawInput;
    const entryObservation = entryObservationModule.create({
                facades: context.facades,
            });
    const {
                createEntryObservation,
                projectTranslatableSource,
                projectSkippedSource,
                applyEntrySource,
                getTranslationProjectionText,
            } = entryObservation;
    const sourceDrawSupport = sourceDrawSupportModule.create({
                services: context.services,
                facades: context.facades,
            });
    const {
                beginNativeSourceDraw,
                captureSourceAfterNativeDraw,
            } = sourceDrawSupport;

    function handleDrawText(windowInstance, originalDrawText, text, x, y, maxWidth, align) {
                const draw = classifyDrawTextInput({
                    windowInstance,
                    text,
                    x,
                    y,
                    maxWidth,
                    align,
                    stripEscapes: safeStripRpgmEscapes,
                });
                const textStr = draw.rawText;
                const invokeOriginal = (overrideText, options = {}) => {
                    const value = overrideText !== undefined ? overrideText : draw.nativeText;
                    return invokeOriginalDrawText(windowInstance, originalDrawText, value, x, y, maxWidth, align, options);
                };
                recordDrawTrace('window.drawText.enter', textStr, windowTraceDetails(windowInstance, 'drawText', textStr, x, y, {
                    maxWidth,
                    align,
                }));

                if (conversionScope && typeof conversionScope.isActive === 'function' && conversionScope.isActive()) {
                    const routed = conversionScope.routeMutation(windowInstance, 'drawText', draw.nativeArgs);
                    recordDrawTrace('window.drawText.suppressed', textStr, windowTraceDetails(windowInstance, 'drawText', textStr, x, y, {
                        reason: 'conversion-scope',
                        maxWidth,
                        align,
                    }));
                    if (routed && routed.handled) return routed.result;
                    return 0;
                }
    
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
                if (contents && getWindowDrawTextExReplayDepth(contents) > 0) {
                    telemetry.logDraw('bypass', textStr, x, y, {
                        windowType: getWindowTypeName(windowInstance, getRegisteredWindowData(windowInstance)),
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
                    drawInput: draw,
                });
                if (observation && observation.completed) {
                    const result = invokeCompletedEntry(
                        observation.entry,
                        observation.normalizedText,
                        invokeOriginal,
                        observation.phase === 'existing' ? 'drawText-existing' : 'drawText-entry'
                    );
                    refitCompletedDrawTextExBeforeNeighbor(windowInstance, observation.windowData, observation.entry, 'window-drawText-completed');
                    return result;
                }
                const result = invokeOriginal();
                captureSourceAfterNativeDraw(windowInstance, observation && observation.entry);
                refitCompletedDrawTextExBeforeNeighbor(windowInstance, observation && observation.windowData, observation && observation.entry, 'window-drawText-source');
                return result;
            }
    
    function handleDrawTextEx(windowInstance, originalDrawTextEx, text, x, y, originalArgs = null) {
                const draw = classifyDrawTextExInput({
                    windowInstance,
                    text,
                    x,
                    y,
                    originalArgs,
                    convertText: convertWindowText,
                    stripEscapes: safeStripRpgmEscapes,
                });
                x = draw.x;
                y = draw.y;
                const textStr = draw.rawText;
                const params = draw.params;
                const invokeOriginal = (overrideText, options = {}) => {
                    const value = overrideText !== undefined ? overrideText : draw.nativeText;
                    return invokeOriginalDrawTextEx(windowInstance, originalDrawTextEx, value, x, y, Object.assign({}, options || {}, {
                        originalArgs: draw.nativeArgs,
                    }));
                };
                recordDrawTrace('window.drawTextEx.enter', textStr, windowTraceDetails(windowInstance, 'drawTextEx', textStr, x, y, {
                    maxWidth: params.maxWidth,
                    align: 'left',
                }));

                if (conversionScope && typeof conversionScope.isActive === 'function' && conversionScope.isActive()) {
                    const routed = conversionScope.routeMutation(windowInstance, 'drawTextEx', draw.nativeArgs);
                    recordDrawTrace('window.drawTextEx.suppressed', textStr, windowTraceDetails(windowInstance, 'drawTextEx', textStr, x, y, {
                        reason: 'conversion-scope',
                        maxWidth: params.maxWidth,
                        align: 'left',
                    }));
                    if (routed && routed.handled) return routed.result;
                    return 0;
                }
    
                if (isWindowTranslatedDrawActive(windowInstance)) {
                    recordDrawTrace('window.drawTextEx.bypass', textStr, windowTraceDetails(windowInstance, 'drawTextEx', textStr, x, y, {
                        reason: 'translatedDrawActive',
                        maxWidth: params.maxWidth,
                        align: 'left',
                    }));
                    return invokeOriginal();
                }
    
                if (isDedicatedMessageWindow(windowInstance)) {
                    recordDrawTrace('window.drawTextEx.bypass', textStr, windowTraceDetails(windowInstance, 'drawTextEx', textStr, x, y, {
                        reason: 'dedicatedMessageWindow',
                        maxWidth: params.maxWidth,
                        align: 'left',
                    }));
                    return invokeOriginal();
                }

                const observation = observePlainWindowTextDraw({
                    windowInstance,
                    tracePrefix: 'window.drawTextEx',
                    traceMethod: 'drawTextEx',
                    drawInput: draw,
                    traceDetails: {
                        convertedText: draw.convertedText,
                        maxWidth: params.maxWidth,
                        align: 'left',
                    },
                });
                if (observation && observation.completed) {
                    return invokeCompletedEntry(
                        observation.entry,
                        observation.normalizedText,
                        invokeOriginal,
                        observation.phase === 'existing' ? 'drawTextEx-existing' : 'drawTextEx-entry',
                        createDrawTextExCompletedSubstitutionOptions(windowInstance)
                    );
                }
                const result = invokeOriginal();
                if (observation && observation.entry && observation.phase !== 'skipped') {
                    captureSourceAfterNativeDraw(windowInstance, observation.entry);
                }
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
                    drawRun: draw.drawRun,
                    generation: draw.generation,
                    phase: event && (event.phase || event.sourcePhase) || '',
                    sourceCommitted: event && event.sourceCommitted === true,
                    nativeDrawCapability: event && event.nativeDrawCapability || '',
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
                const sourceObservation = describeSurfaceDrawSourceObservation(draw.bitmap);
                if (sourceObservation.status !== 'observed') {
                    recordDrawTrace(getSurfaceDrawSourceObservationStage(sourceObservation), draw.text, windowTraceDetails(windowInstance, draw.methodName, draw.text, draw.x, draw.y, Object.assign({
                        reason: sourceObservation.reason || sourceObservation.status,
                        sourceObservationStatus: sourceObservation.status,
                        sourceObservationReason: sourceObservation.reason || '',
                    }, traceDetails)));
                    return null;
                }
                const coveredWindowEntry = findWindowEntryCoveredBySurfaceDraw(windowInstance, draw);
                if (coveredWindowEntry) {
                    recordDrawTrace('window.surfaceDraw.bypass', draw.text, windowTraceDetails(windowInstance, draw.methodName, draw.text, draw.x, draw.y, Object.assign({
                        reason: 'window-surfaceDraw-covered-by-window-entry',
                        recordId: coveredWindowEntry.recordId || '',
                        slotKey: coveredWindowEntry.slotKey || '',
                    }, traceDetails)));
                    return null;
                }
                const committedSurfaceDraw = isCommittedSurfaceDrawEvent(event);
                if (!committedSurfaceDraw) {
                    recordDrawTrace('window.surfaceDraw.skip', draw.text, windowTraceDetails(windowInstance, draw.methodName, draw.text, draw.x, draw.y, Object.assign({
                        reason: 'sourceDrawNotCommitted',
                    }, traceDetails)));
                    return null;
                }

                const drawOrigin = {
                    type: 'bitmapSurface',
                    adapter: draw.sourceAdapter || 'bitmap',
                    methodName: draw.methodName,
                    target: 'window.contents',
                    ownerType: draw.ownerType,
                    measuredWidth: draw.measuredWidth,
                    surfaceId: draw.surfaceId,
                    slotKey: draw.slotKey,
                    runId: draw.runId,
                    unitIds: draw.unitIds,
                    surfaceRevision: draw.surfaceRevision,
                    drawRun: draw.drawRun,
                    drawState: draw.drawState,
                    drawBoundary: draw.drawBoundary,
                };
                const surfaceInput = classifySurfaceDrawInput({
                    windowInstance,
                    methodName: draw.methodName,
                    text: draw.text,
                    x: draw.x,
                    y: draw.y,
                    maxWidth: draw.maxWidth,
                    lineHeight: draw.lineHeight,
                    align: draw.align,
                    drawOrigin,
                    stripEscapes: safeStripRpgmEscapes,
                });
                const observation = observePlainWindowTextDraw({
                    windowInstance,
                    tracePrefix: 'window.surfaceDraw',
                    traceMethod: draw.methodName,
                    drawInput: surfaceInput,
                    observedContents: draw.bitmap,
                    traceDetails,
                    telemetryMethod: 'bitmap.drawText',
                });
                if (observation && observation.entry) {
                    // Bitmap-owned draw-unit dispatches carry the clean pre-native
                    // backdrop on a later surface event. Apply it for existing
                    // entries too, not only post-draw notifications, so async
                    // redraw restores clean pixels instead of the stale source
                    // snapshot captured earlier.
                    applySurfaceDrawBackgroundPatch(draw, observation.entry);
                }
                if (observation && observation.entry) {
                    captureSourceAfterNativeDraw(windowInstance, observation.entry, draw.bitmap);
                }
                if (observation && observation.completed) {
                    const inlineReplacement = createSurfaceDrawReplacement(windowInstance, observation.entry);
                    const redrawResult = redrawTranslatedText(observation.entry, observation.windowData);
                    if (inlineReplacement) {
                        rememberSurfaceDrawInlineReplacement(windowInstance, observation.entry, draw, inlineReplacement.decision, {
                            useCurrentGeneration: true,
                        });
                    }
                    const refitCount = refitCompletedDrawTextExBeforeNeighbor(windowInstance, observation.windowData, observation.entry, 'window-surfaceDraw-completed');
                    return {
                        action: redrawResult && redrawResult.status === 'committed' ? 'redraw-applied' : 'observed-window-surface-text',
                        reason: redrawResult && redrawResult.reason || 'post-draw-window-surface-text',
                        refitDrawTextEx: refitCount,
                    };
                }
                if (observation && observation.entry) {
                    refitCompletedDrawTextExBeforeNeighbor(windowInstance, observation.windowData, observation.entry, 'window-surfaceDraw-source');
                }
                return observation && observation.entry
                    ? { action: 'observed-window-surface-text', reason: 'observed-window-surface-text' }
                    : null;
            }

    function findWindowEntryCoveredBySurfaceDraw(windowInstance, draw = {}) {
                if (!windowInstance || !draw || typeof draw !== 'object') return null;
                const windowData = getRegisteredWindowData(windowInstance);
                const entries = windowData && windowData.texts;
                if (!entries || typeof entries.forEach !== 'function') return null;
                const methodName = draw.methodName || 'drawText';
                const slotKey = createSlotKey(methodName, draw.x, draw.y, {
                    maxWidth: draw.maxWidth,
                    align: draw.align,
                });
                const rawText = String(draw.text ?? '');
                const normalizedText = normalizeWindowSurfaceComparisonText(rawText);
                const drawBounds = estimateSurfaceDrawCoverageBounds(windowInstance, draw, rawText);
                let match = null;
                try {
                    entries.forEach((entry) => {
                        if (match || !entry) return;
                        if (entry.type && entry.type !== methodName) return;
                        const origin = entry.drawOrigin && typeof entry.drawOrigin === 'object' ? entry.drawOrigin : null;
                        if (origin && origin.type && origin.type !== 'window') return;
                        if (!windowEntryTextMatchesSurfaceDraw(entry, rawText, normalizedText, draw)) return;
                        if (entry.slotKey === slotKey) {
                            match = entry;
                            return;
                        }
                        if (isSurfaceDrawCoveredByWindowEntry(entry, drawBounds)) match = entry;
                    });
                } catch (_) {}
                return match;
            }

    function windowEntryTextMatchesSurfaceDraw(entry, rawText, normalizedText, draw) {
                if (!entry) return false;
                const entryRawText = String(entry.rawText ?? '');
                if (entryRawText === rawText) return true;
                const entryVisible = normalizeWindowSurfaceComparisonText(entryRawText);
                if (entryVisible && entryVisible === normalizedText) return true;
                if (!isWhitespaceElidedSurfaceDraw(draw)) return false;
                const entryCompact = compactWindowSurfaceComparisonText(entryVisible);
                const surfaceCompact = compactWindowSurfaceComparisonText(normalizedText);
                return !!(entryCompact && surfaceCompact && entryCompact === surfaceCompact);
            }

    function normalizeWindowSurfaceComparisonText(value) {
                return safeStripRpgmEscapes(String(value ?? '')).trim();
            }

    function compactWindowSurfaceComparisonText(value) {
                return normalizeWindowSurfaceComparisonText(value).replace(/\s+/g, '');
            }

    function isWhitespaceElidedSurfaceDraw(draw) {
                const drawRun = draw && draw.drawRun && typeof draw.drawRun === 'object' ? draw.drawRun : null;
                if (!drawRun) return false;
                // Inferred fallback glyph runs are assembled from painted glyphs,
                // so native spaces can be absent even when the window source text
                // contained them. Keep this special case tied to that draw-run
                // provenance and require coverage before suppressing the record.
                return drawRun.type === 'fallbackGlyph'
                    && drawRun.reason === 'adjacent-glyph-run'
                    && drawRun.confidence === 'inferred';
            }

    function estimateSurfaceDrawCoverageBounds(windowInstance, draw, rawText) {
                if (!draw || typeof draw !== 'object') return null;
                const methodName = draw.methodName || 'drawText';
                const params = {
                    maxWidth: draw.maxWidth,
                    lineHeight: draw.lineHeight,
                    align: draw.align,
                };
                try {
                    return textMetrics.estimateEntryBounds(windowInstance, methodName, rawText, draw.x, draw.y, rawText, params);
                } catch (_) {
                    return null;
                }
            }

    function isSurfaceDrawCoveredByWindowEntry(entry, drawBounds) {
                const entryBounds = normalizeCoverageRect(entry && entry.bounds);
                const surfaceBounds = normalizeCoverageRect(drawBounds);
                if (!entryBounds || !surfaceBounds) return false;
                return rectContainsWithTolerance(entryBounds, surfaceBounds, 2)
                    || rectOverlapRatio(entryBounds, surfaceBounds) >= 0.9;
            }

    function normalizeCoverageRect(rect) {
                if (!rect || typeof rect !== 'object') return null;
                const x1 = Number(rect.x1);
                const y1 = Number(rect.y1);
                const x2 = Number(rect.x2);
                const y2 = Number(rect.y2);
                if (!Number.isFinite(x1) || !Number.isFinite(y1) || !Number.isFinite(x2) || !Number.isFinite(y2)) return null;
                const left = Math.min(x1, x2);
                const top = Math.min(y1, y2);
                const right = Math.max(x1, x2);
                const bottom = Math.max(y1, y2);
                if (right <= left || bottom <= top) return null;
                return { x1: left, y1: top, x2: right, y2: bottom };
            }

    function rectContainsWithTolerance(outer, inner, tolerance = 0) {
                return outer.x1 <= inner.x1 + tolerance
                    && outer.y1 <= inner.y1 + tolerance
                    && outer.x2 >= inner.x2 - tolerance
                    && outer.y2 >= inner.y2 - tolerance;
            }

    function rectOverlapRatio(first, second) {
                const x1 = Math.max(first.x1, second.x1);
                const y1 = Math.max(first.y1, second.y1);
                const x2 = Math.min(first.x2, second.x2);
                const y2 = Math.min(first.y2, second.y2);
                if (x2 <= x1 || y2 <= y1) return 0;
                const overlap = (x2 - x1) * (y2 - y1);
                const smaller = Math.min(rectArea(first), rectArea(second));
                return smaller > 0 ? overlap / smaller : 0;
            }

    function rectArea(rect) {
                return Math.max(0, rect.x2 - rect.x1) * Math.max(0, rect.y2 - rect.y1);
            }

    function createDrawTextExCompletedSubstitutionOptions(windowInstance) {
                return {
                    shouldDeferForFit(payload) {
                        return shouldDeferCompletedDrawTextExSubstitutionForFit(windowInstance, payload);
                    },
                    onDeferredForFit(payload) {
                        return queueDeferredCompletedDrawTextExSubstitution(windowInstance, payload);
                    },
                };
            }

    function shouldDeferCompletedDrawTextExSubstitutionForFit(windowInstance, payload = {}) {
                const entry = payload && payload.entry;
                const textFit = payload && payload.textFit;
                if (!entry || entry.type !== 'drawTextEx') return false;
                if (!textFit || textFit.applied === true || textFit.reason !== 'missingNeighbor') return false;
                const windowData = payload.windowData || entry.windowData || null;
                const targetWindow = payload.targetWindow || windowInstance || entry.ownerWindow || null;
                return !!(lifecycleService
                    && typeof lifecycleService.wasEntryObservedInRefresh === 'function'
                    && lifecycleService.wasEntryObservedInRefresh(entry, targetWindow, windowData));
            }

    function queueDeferredCompletedDrawTextExSubstitution(windowInstance, payload = {}) {
                const entry = payload && payload.entry;
                if (!entry || !entry.windowData) return { status: 'ignored', reason: 'missing-entry' };
                const result = redrawTranslatedText(entry, entry.windowData);
                return result && typeof result === 'object'
                    ? result
                    : { status: result === true ? 'committed' : 'missed', reason: 'deferred-fit-redraw' };
            }

    function observePlainWindowTextDraw(input = {}) {
                const windowInstance = input.windowInstance || null;
                const draw = input.drawInput || null;
                if (!draw) return { completed: false, reason: 'missing-draw-input' };
                const observation = createEntryObservation(input);
                if (!observation) return { completed: false, reason: 'missing-entry-observation' };
                const rawText = observation.rawText;
                const x = observation.x;
                const y = observation.y;
                const type = observation.type;
                const normalizedText = observation.normalizedText;
                const normalizedVisibleText = observation.normalizedVisibleText;
                const tracePrefix = input.tracePrefix || `window.${type}`;
                const traceMethod = input.traceMethod || type;
                const originalParams = observation.originalParams;
                const traceDetails = Object.assign({}, draw.traceDetails || {}, input.traceDetails || {});

                if (!draw.geometry || !draw.geometry.drawable) {
                    recordDrawTrace(`${tracePrefix}.skip`, rawText, windowTraceDetails(windowInstance, traceMethod, rawText, x, y, Object.assign({
                        reason: draw.skipReason || 'invalidDrawGeometry',
                        geometry: draw.geometry && draw.geometry.details,
                    }, traceDetails)));
                    return { completed: false, reason: draw.skipReason || 'invalidDrawGeometry' };
                }

                if (draw.textKind !== 'literal') {
                    const slotInvalidated = draw.canRetireEmptySlot
                        ? retireEmptyWindowTextSlot(windowInstance, type, x, y, originalParams)
                        : false;
                    recordDrawTrace(`${tracePrefix}.skip`, rawText, windowTraceDetails(windowInstance, traceMethod, rawText, x, y, Object.assign({
                        reason: draw.emptyReason || 'empty',
                        slotKey: createSlotKey(type, x, y, originalParams),
                        slotInvalidated,
                    }, traceDetails)));
                    return { completed: false, reason: draw.emptyReason || 'empty' };
                }

                if (draw.drawRole && !draw.drawRole.renderable) {
                    if (draw.canRetireNonRenderableSlot) {
                        retireNonRenderableSlot(windowInstance, type, x, y, originalParams, draw.drawRole.reason);
                    }
                    recordDrawTrace(`${tracePrefix}.skip`, rawText, windowTraceDetails(windowInstance, traceMethod, rawText, x, y, Object.assign({
                        reason: draw.drawRole.reason,
                        drawRole: draw.drawRole.role,
                        bounds: cloneDiagnosticRect(draw.drawRole.bounds),
                        contentsSize: draw.drawRole.contentsSize,
                    }, traceDetails)));
                    return { completed: false, phase: 'non-renderable', reason: draw.drawRole.reason, drawRole: draw.drawRole };
                }
                if (draw.drawRole && draw.drawRole.role) {
                    originalParams.drawRole = draw.drawRole.role;
                }

                const windowData = ensureWindowRegistered(windowInstance);
                const existing = findExistingEntry(windowData, type, rawText, normalizedText, x, y, originalParams);
                if (existing) {
                    refreshEntry(windowInstance, windowData, existing, observation);
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
                    const skipped = recordSkippedEntry(windowInstance, windowData, observation, eligibility);
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
                const entry = createObservedEntry(windowInstance, windowData, observation);
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
                // Empty or missing text only proves that the exact draw slot was
                // cleared. It must not invalidate a different-width label that
                // happens to share the same anchor.
                return retireEntriesInExactSlot(windowData, type, x, y, null, 'window-entry-empty', params) > 0;
            }

    function retireNonRenderableSlot(windowInstance, type, x, y, params = null, reason = 'offscreen-draw') {
                const windowData = getRegisteredWindowData(windowInstance);
                if (!windowData) return false;
                return retireEntriesInExactSlot(windowData, type, x, y, null, reason || 'offscreen-draw', params) > 0;
            }

    function createSurfaceDrawReplacement(windowInstance, entry) {
                if (!entry || !entry.renderedText) return null;
                const contents = entry.contentsBitmap || (windowInstance && windowInstance.contents) || null;
                const rendered = sanitizeDrawTextOutput(entry.renderedText, entry.type);
                if (!rendered || rendered.trim() === String(entry.convertedText || '').trim()) return null;
                const position = entry.position || {};
                const params = entry.originalParams || {};
                const replacementInput = classifySurfaceDrawInput({
                    windowInstance,
                    methodName: entry.type || 'drawText',
                    entryType: entry.type || 'drawText',
                    text: rendered,
                    x: position.x,
                    y: position.y,
                    maxWidth: params.maxWidth,
                    lineHeight: params.lineHeight,
                    align: params.align,
                    stripEscapes: safeStripRpgmEscapes,
                });
                if (!replacementInput.geometry || !replacementInput.geometry.drawable) return null;
                const yOffset = calculateBitmapSurfaceTextYOffset(contents, entry, rendered);
                const drawY = replacementInput.geometry.details.y + yOffset;
                return {
                    rendered,
                    position,
                    yOffset,
                    drawY,
                    decision: {
                        action: 'replace-native-draw',
                        text: rendered,
                        x: replacementInput.geometry.details.x,
                        y: drawY,
                        maxWidth: params.maxWidth,
                        lineHeight: params.lineHeight,
                        align: normalizeDrawTextAlignValue(params.align),
                        reason: 'completed-window-surface-text',
                    },
                };
            }

    function getSurfaceDrawSourceObservationStage(sourceObservation) {
                const status = String(sourceObservation && sourceObservation.status || '');
                if (status === 'suppressed') return 'window.surfaceDraw.sourceSuppressed';
                if (status === 'rejected') return 'window.surfaceDraw.sourceRejected';
                return 'window.surfaceDraw.sourceIgnored';
            }

    function rememberSurfaceDrawInlineReplacement(windowInstance, entry, draw = null, decision = null, options = null) {
                const replacement = decision ? { decision } : createSurfaceDrawReplacement(windowInstance, entry);
                if (!replacement || !replacement.decision || typeof rememberInlineReplacement !== 'function') return null;
                const contents = entry && entry.contentsBitmap || (windowInstance && windowInstance.contents) || null;
                const slotKey = createInlineReplacementSlotKey(entry, draw);
                const replacementDecision = replacement.decision;
                const useCurrentGeneration = !!(options && options.useCurrentGeneration);
                return rememberInlineReplacement({
                    surface: draw && draw.bitmap || contents,
                    slotKey,
                    generation: useCurrentGeneration ? undefined : (decision ? draw && draw.generation : undefined),
                    action: replacementDecision.action,
                    text: replacementDecision.text,
                    nativeArgs: [
                        replacementDecision.text,
                        replacementDecision.x,
                        replacementDecision.y,
                        replacementDecision.maxWidth,
                        replacementDecision.lineHeight,
                        replacementDecision.align,
                    ],
                    methodName: entry.type || (draw && draw.methodName) || 'drawText',
                    ownerAdapter: ADAPTER_ID,
                    recordId: entry.recordId || '',
                    reason: replacementDecision.reason,
                });
            }

    function createInlineReplacementSlotKey(entry, draw = null) {
                const position = entry && entry.position || {};
                const params = entry && entry.originalParams || {};
                const methodName = draw && draw.methodName || entry && entry.type || 'drawText';
                const align = draw && draw.align || normalizeDrawTextAlignValue(params.align);
                return [
                    methodName,
                    draw && draw.x !== undefined ? draw.x : position.x,
                    draw && draw.y !== undefined ? draw.y : position.y,
                    draw && draw.maxWidth !== undefined ? draw.maxWidth : params.maxWidth,
                    draw && draw.lineHeight !== undefined ? draw.lineHeight : params.lineHeight,
                    align || 'left',
                ].map((value) => String(value ?? '')).join(':');
            }

    function createObservedEntry(windowInstance, windowData, observation) {
                if (!windowData) return null;
                const rawText = observation.rawText;
                const x = observation.x;
                const y = observation.y;
                const type = observation.type;
                const convertedText = observation.convertedText;
                const originalParams = observation.originalParams;
                const convertedTrimmed = observation.convertedTrimmed;
                if (!convertedTrimmed) return null;
    
                retireEntriesForReplacementDraw(windowData, type, x, y, null, 'window-entry-replaced', originalParams);
    
                const slotKey = createSlotKey(type, x, y, originalParams);
                const key = generateKey(type, x, y, windowData.windowType, convertedTrimmed, slotKey);
                const entry = createEntry(windowInstance, windowData, key, observation);
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
                    if (windowData.renderReadinessSchedule) windowData.renderReadinessSchedule.delete(key);
                } catch (_) {}
                if (!isEntryCompleted(entry)) {
                    requestEntryTranslation(windowData, entry);
                }
                return entry;
            }
    
    function recordSkippedEntry(windowInstance, windowData, observation, eligibility) {
                if (!windowData) return null;
                const rawText = observation.rawText;
                const x = observation.x;
                const y = observation.y;
                const type = observation.type;
                const convertedText = observation.convertedText;
                const originalParams = observation.originalParams;
                const convertedTrimmed = observation.convertedTrimmed;
                if (!convertedTrimmed) return null;
                const reason = eligibility && eligibility.reason ? eligibility.reason : 'native';
                const skippedSource = projectSkippedSource(observation, reason);
    
                const existing = findExistingEntry(windowData, type, rawText, convertedTrimmed, x, y, originalParams);
                if (existing) {
                    refreshEntry(windowInstance, windowData, existing, observation);
                    applyEntrySource(existing, skippedSource);
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
    
                retireEntriesForReplacementDraw(windowData, type, x, y, null, 'window-entry-replaced', originalParams);
    
                const slotKey = createSlotKey(type, x, y, originalParams);
                const key = generateKey(type, x, y, windowData.windowType, convertedTrimmed, slotKey);
                const entry = createEntry(windowInstance, windowData, key, observation);
                applyEntrySource(entry, skippedSource);
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
                    if (windowData.renderReadinessSchedule) windowData.renderReadinessSchedule.delete(key);
                } catch (_) {}
                return entry;
            }

    function createEntry(windowInstance, windowData, key, observation) {
                const rawText = observation.rawText;
                const convertedTrimmed = observation.convertedTrimmed;
                const x = observation.x;
                const y = observation.y;
                const type = observation.type;
                const convertedText = observation.convertedText;
                const originalParams = observation.originalParams;
                const observedContents = observation.observedContents;
                const sourceProjection = projectTranslatableSource(observation);
                const liveContents = windowInstance && windowInstance.contents ? windowInstance.contents : null;
                const screenState = describeWindowScreenState(windowInstance, windowData);
                const roleState = surfaceRoleState.describeWindowSourceSurface({
                    liveContents,
                    observedContents,
                    fallbackContents: observedContents || liveContents,
                    screenState,
                });
                const contents = roleState.sourceContentsBitmap || observedContents || liveContents;
                const surfaceId = getSurfaceId(windowData);
                const identitySurfaceId = getIdentitySurfaceId(windowInstance, windowData);
                const translationText = sourceProjection.translationSource || convertedTrimmed || rawText;
                const drawOrigin = normalizeDrawOrigin(originalParams && originalParams.drawOrigin, type);
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
                    visibleText: '',
                    translationSource: '',
                    normalizedSource: '',
                    codecState: null,
                    renderedText: '',
                    providerText: '',
                    position: { x, y },
                    originalParams: normalizeOriginalParams(originalParams),
                    drawOrigin,
                    timestamp: Date.now(),
                    drawState: drawOrigin.drawState || drawService.captureBitmapDrawState(contents),
                    contentsBitmap: contents,
                    sourceContentsBitmap: contents,
                    sourceContentsRole: roleState.sourceContentsRole,
                    renderSurfaceRole: roleState.renderSurfaceRole,
                    requiresCopiedTarget: roleState.requiresCopiedTarget,
                    surfaceRoleState: roleState,
                    contentsRevision: windowData.contentsRevision || 0,
                    surfaceRevision: 1,
                    drawOrder: 0,
                    bounds: null,
                    renderedBounds: null,
                    ownerWindow: windowInstance,
                    windowData,
                };
                applyEntrySource(entry, sourceProjection);
                entryLifecycleState.ensure(entry);
                entryLifecycleState.setSurfaceVisible(entry, screenState === 'visible', {
                    reason: 'window-entry-created',
                    screenState,
                });
                markEntryObservedInRefresh(entry, windowInstance, windowData);
                beginNativeSourceDraw(entry, 'window-native-source-draw');
                assignWindowTextDrawOrder(contents, entry);
                refreshEntryBounds(windowInstance, entry, getTranslationProjectionText(observation));
                captureWindowEntryBackground(contents, entry);
                telemetry.logTextDetected(type, convertedTrimmed, x, y, {
                    converted: convertedText,
                    windowType: windowData.windowType || 'unknown',
                });
                return entry;
            }
    
    function refreshEntry(windowInstance, windowData, entry, observation) {
                const rawText = observation.rawText;
                const convertedTrimmed = observation.convertedTrimmed;
                const x = observation.x;
                const y = observation.y;
                const type = observation.type;
                const convertedText = observation.convertedText;
                const originalParams = observation.originalParams;
                const observedContents = observation.observedContents;
                const sourceProjection = projectTranslatableSource(observation);
                const liveContents = windowInstance && windowInstance.contents ? windowInstance.contents : null;
                const screenState = describeWindowScreenState(windowInstance || entry.ownerWindow, windowData || entry.windowData);
                const roleState = surfaceRoleState.describeWindowSourceSurface({
                    liveContents,
                    observedContents,
                    fallbackContents: observedContents || liveContents || entry.contentsBitmap,
                    screenState,
                });
                const contents = roleState.sourceContentsBitmap || observedContents || liveContents || entry.contentsBitmap;
                entry.type = type || entry.type;
                entry.rawText = rawText;
                entry.convertedText = convertedTrimmed;
                entry.position = { x, y };
                entry.originalParams = normalizeOriginalParams(originalParams || entry.originalParams || {});
                entry.drawOrigin = normalizeDrawOrigin(originalParams ? originalParams.drawOrigin : entry.drawOrigin, type);
                entry.timestamp = Date.now();
                entry.contentsBitmap = contents;
                entry.sourceContentsBitmap = contents;
                entry.sourceContentsRole = roleState.sourceContentsRole;
                entry.renderSurfaceRole = roleState.renderSurfaceRole;
                entry.requiresCopiedTarget = roleState.requiresCopiedTarget;
                entry.surfaceRoleState = roleState;
                entry.contentsRevision = windowData ? (windowData.contentsRevision || 0) : entry.contentsRevision;
                clearRenderCommitProof(entry);
                if (windowData) {
                    entry.surfaceId = getSurfaceId(windowData) || entry.surfaceId;
                    entry.identitySurfaceId = getIdentitySurfaceId(windowInstance, windowData) || entry.identitySurfaceId;
                }
                entry.ownerWindow = windowInstance || entry.ownerWindow;
                entry.windowData = windowData || entry.windowData;
                entryLifecycleState.setSurfaceVisible(entry, screenState === 'visible', {
                    reason: 'window-entry-refreshed',
                    screenState,
                });
                entry.drawState = entry.drawOrigin && entry.drawOrigin.drawState
                    ? entry.drawOrigin.drawState
                    : drawService.captureBitmapDrawState(contents);
                entry.renderedBounds = null;
                markEntryObservedInRefresh(entry, windowInstance, windowData);
                entry.surfaceRevision = (Number(entry.surfaceRevision) || 0) + 1;
                beginNativeSourceDraw(entry, 'window-native-source-refresh');
                clearPendingInvalidation(entry);
                entry.slotKey = createSlotKey(type, x, y, entry.originalParams);
                retireEntriesForReplacementDraw(windowData, type, x, y, entry, 'window-entry-replaced', entry.originalParams);
                assignWindowTextDrawOrder(entry.contentsBitmap, entry);
    
                applyEntrySource(entry, sourceProjection);
                refreshEntryBounds(windowInstance, entry, getTranslationProjectionText(observation));
                ensureWindowEntryBackground(entry.contentsBitmap, entry);
                observeEntry(windowData, entry, getEntryStatus(entry, 'detected'), {
                    eventType: 'item.observed',
                });
                return entry;
            }

    function clearRenderCommitProof(entry) {
                if (entry && Object.prototype.hasOwnProperty.call(entry, 'renderCommitProof')) {
                    delete entry.renderCommitProof;
                }
            }

        return { handleDrawText, handleDrawTextEx, handleSurfaceDrawText, createObservedEntry, recordSkippedEntry, createEntry, refreshEntry };
    }
            return { create: createDrawObserverController };
        },
    });

})();
