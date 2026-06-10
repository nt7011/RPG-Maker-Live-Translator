// Window text adapter support: completed source-draw substitution.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before adapters/window-text/completed-substitution.js.');
    }

    function createCompletedSubstitutionController(context = {}) {
        const {
            telemetry = null,
            sanitizeDrawTextOutput,
            toDrawTextExInputText,
            getWindowTextMetricPrefix,
            getWindowTextPerfMethod,
            getWindowNativeDrawOwner,
            getRedrawContents,
            resolveWindowData,
            resolveTargetWindow,
            dropRenderRetry,
            updateOrchestratorItem,
            recordDecision,
            recordDrawTrace,
            windowTraceDetails,
            captureWindowEntrySource,
            completeEntryNativeSourceDraw,
            resolveHorizontalTextFit,
            summarizeHorizontalTextFit,
            perfCount,
            perfTop,
            perfStart,
            perfElapsed,
        } = context;

        function invokeCompletedEntry(entry, originalText, invokeOriginal, eventName, options = {}) {
            const translated = typeof sanitizeDrawTextOutput === 'function'
                ? sanitizeDrawTextOutput(entry && entry.renderedText, entry && entry.type)
                : String(entry && entry.renderedText || '');
            const route = 'completedSubstitution';
            const metricPrefix = typeof getWindowTextMetricPrefix === 'function'
                ? getWindowTextMetricPrefix(entry, route)
                : `windowText.${entry && entry.type === 'drawTextEx' ? 'drawTextEx' : 'drawText'}.${route}`;
            callMetric(perfCount, `${metricPrefix}.calls`);
            callMetric(perfTop, 'windowText.completedSubstitution.method', typeof getWindowTextPerfMethod === 'function' ? getWindowTextPerfMethod(entry) : '');
            callMetric(perfTop, 'windowText.completedSubstitution.event', eventName || 'unknown');
            if (typeof translated !== 'string' || translated.trim() === String(originalText || '').trim()) {
                callMetric(perfCount, `${metricPrefix}.skippedSame`);
                callDecision(entry, 'draw.skipped', 'cached redraw matched original', {
                    method: eventName,
                    windowType: entry && entry.windowData && entry.windowData.windowType ? entry.windowData.windowType : '',
                });
                return invokeOriginal();
            }

            const completedStart = typeof perfStart === 'function' ? perfStart() : 0;
            let drew = false;
            try {
                const windowData = typeof resolveWindowData === 'function' ? resolveWindowData(entry) : entry && entry.windowData || null;
                const targetWindow = typeof resolveTargetWindow === 'function' ? resolveTargetWindow(entry, windowData) : entry && entry.ownerWindow || null;
                const substitutionText = getCompletedSubstitutionText(entry, translated);
                const contents = typeof getRedrawContents === 'function'
                    ? getRedrawContents(targetWindow, entry)
                    : targetWindow && targetWindow.contents || null;
                const textFit = typeof resolveHorizontalTextFit === 'function'
                    ? resolveHorizontalTextFit(targetWindow, windowData, contents, entry, substitutionText)
                    : null;
                if (shouldDeferDrawTextExSubstitutionForFit(entry, textFit, targetWindow, windowData, contents, eventName, options)) {
                    const result = invokeOriginal();
                    captureCompletedSourceSnapshot(contents, entry);
                    completeNativeSourceDraw(entry, 'window-completed-substitution-deferred-for-fit');
                    const renderResult = notifyDeferredDrawTextExFit(entry, textFit, targetWindow, windowData, contents, substitutionText, translated, eventName, options);
                    callMetric(perfCount, `${metricPrefix}.deferredForFit`);
                    callDecision(entry, 'draw.deferred', 'completed drawTextEx substitution waiting for same-line boundary', {
                        windowType: entry && entry.windowData && entry.windowData.windowType ? entry.windowData.windowType : '',
                        method: eventName,
                        translationDrawn: translated,
                        sourceSubstituted: false,
                        deferredRender: summarizeDeferredRenderResult(renderResult),
                        horizontalTextFit: typeof summarizeHorizontalTextFit === 'function'
                            ? summarizeHorizontalTextFit(textFit)
                            : null,
                    });
                    return result;
                }
                logTelemetryDraw(translated, entry, eventName);
                const result = invokeOriginal(substitutionText, {
                    nativeDrawOwner: typeof getWindowNativeDrawOwner === 'function'
                        ? getWindowNativeDrawOwner(entry, `${route}.translatedSource`)
                        : '',
                    scaleText: true,
                    textFit,
                });
                captureCompletedSourceSnapshot(contents, entry);
                completeNativeSourceDraw(entry, 'window-completed-substitution-translated-draw');
                if (windowData && typeof dropRenderRetry === 'function') dropRenderRetry(windowData, entry);
                drew = true;
                recordCompletedSubstitutionTrace(targetWindow, entry, substitutionText, eventName);
                recordCompletedSubstitutionRendered(entry, translated, eventName);
                callDecision(entry, 'draw.existing', 'existing translated text substituted at source draw', {
                    windowType: entry && entry.windowData && entry.windowData.windowType ? entry.windowData.windowType : '',
                    method: eventName,
                    translationDrawn: translated,
                    sourceSubstituted: true,
                    drawTextExInputConverted: entry && entry.type === 'drawTextEx'
                        && substitutionText !== String(translated ?? ''),
                    horizontalTextFit: typeof summarizeHorizontalTextFit === 'function'
                        ? summarizeHorizontalTextFit(textFit)
                        : null,
                });
                return result;
            } finally {
                if (typeof perfElapsed === 'function') perfElapsed(`${metricPrefix}.ms`, completedStart);
                callMetric(perfCount, `${metricPrefix}.${drew ? 'drawn' : 'missed'}`);
            }
        }

        function getCompletedSubstitutionText(entry, translated) {
            const text = String(translated ?? '');
            return entry && entry.type === 'drawTextEx' && typeof toDrawTextExInputText === 'function'
                ? toDrawTextExInputText(text)
                : text;
        }

        function shouldDeferDrawTextExSubstitutionForFit(entry, textFit, targetWindow, windowData, contents, eventName, options) {
            if (!(entry
                && entry.type === 'drawTextEx'
                && textFit
                && textFit.applied !== true
                && textFit.reason === 'missingNeighbor')) {
                return false;
            }
            const shouldDefer = options && typeof options.shouldDeferForFit === 'function'
                ? options.shouldDeferForFit
                : null;
            if (!shouldDefer) return false;
            try {
                return shouldDefer({
                    entry,
                    textFit,
                    targetWindow,
                    windowData,
                    contents,
                    eventName,
                }) === true;
            } catch (_) {
                return false;
            }
        }

        function notifyDeferredDrawTextExFit(entry, textFit, targetWindow, windowData, contents, substitutionText, translated, eventName, options) {
            const onDeferred = options && typeof options.onDeferredForFit === 'function'
                ? options.onDeferredForFit
                : null;
            if (!onDeferred) return null;
            try {
                return onDeferred({
                    entry,
                    textFit,
                    targetWindow,
                    windowData,
                    contents,
                    substitutionText,
                    translated,
                    eventName,
                }) || null;
            } catch (_) {
                return { status: 'error', reason: 'deferred-fit-callback-error' };
            }
        }

        function summarizeDeferredRenderResult(result) {
            if (!result || typeof result !== 'object') return null;
            return {
                status: String(result.status || ''),
                reason: String(result.reason || ''),
            };
        }

        function recordCompletedSubstitutionRendered(entry, translated, eventName) {
            if (!entry || !entry.recordId || typeof updateOrchestratorItem !== 'function') return false;
            const windowData = typeof resolveWindowData === 'function' ? resolveWindowData(entry) : entry.windowData || null;
            return !!updateOrchestratorItem(entry, {
                status: 'completed',
                translation: translated,
                translationDrawn: translated,
            }, 'item.rendered', {
                windowType: windowData && windowData.windowType ? windowData.windowType : '',
                method: eventName || entry.type || '',
                translationReceived: entry.providerText || '',
                translationDrawn: translated,
                sourceSubstituted: true,
            });
        }

        function recordCompletedSubstitutionTrace(targetWindow, entry, substitutionText, eventName) {
            if (!targetWindow || !entry || typeof recordDrawTrace !== 'function' || typeof windowTraceDetails !== 'function') return;
            const position = entry.position || {};
            recordDrawTrace('window.completedSubstitution.draw', substitutionText, windowTraceDetails(targetWindow, entry.type || 'window', substitutionText, position.x, position.y, {
                reason: 'completedSubstitution',
                method: eventName || '',
                recordId: entry.recordId || '',
                slotKey: entry.slotKey || '',
                sourceText: entry.convertedText || entry.rawText || '',
                translationDrawn: entry.renderedText || '',
            }));
        }

        function captureCompletedSourceSnapshot(contents, entry) {
            if (!captureWindowEntrySource || !contents || !entry) return false;
            try {
                return captureWindowEntrySource(contents, entry) === true;
            } catch (_) {
                return false;
            }
        }

        function completeNativeSourceDraw(entry, reason = 'window-completed-substitution-source-draw') {
            if (typeof completeEntryNativeSourceDraw !== 'function') return false;
            try {
                const result = completeEntryNativeSourceDraw(entry, reason);
                return !!(result && result.accepted === true && result.phase === 'source-draw-committed');
            } catch (_) {
                return false;
            }
        }

        function logTelemetryDraw(translated, entry, eventName) {
            if (!telemetry || typeof telemetry.logDraw !== 'function' || !entry) return;
            const position = entry.position || {};
            telemetry.logDraw('redraw', translated, position.x, position.y, {
                windowType: entry.windowData && entry.windowData.windowType ? entry.windowData.windowType : '',
                method: eventName,
            });
        }

        function callDecision(entry, type, message, details) {
            if (typeof recordDecision !== 'function') return;
            recordDecision(entry, type, message, details);
        }

        function callMetric(fn, ...args) {
            if (typeof fn !== 'function') return;
            try { fn(...args); } catch (_) {}
        }

        return {
            invokeCompletedEntry,
            captureCompletedSourceSnapshot,
        };
    }

    defineRuntimeModule('adapters.windowTextCompletedSubstitution', { create: createCompletedSubstitutionController });
})();
