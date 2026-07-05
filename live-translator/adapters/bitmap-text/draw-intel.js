// Bitmap text adapter support: draw intel.
// Hook installation stays in install.js; draw timing and attribution live here.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'adapters.bitmapText.drawIntel',
        requires: {
            sourceObservationContract: 'runtime.bitmap.sourceObservation',
        },
        factory({ sourceObservationContract }) {

    function createController(scope = {}) {
        const { sanitizePerfLabel } = scope.controllerFacades.mutationIntel;
        const {
            isDrawCaptureTraceEnabled,
            recordDrawTrace,
            bitmapTraceDetails,
        } = scope.controllerFacades.textUtils;

        function perfNow() {
            try { return scope.perf && typeof scope.perf.now === 'function' ? scope.perf.now() : Date.now(); } catch (_) { return Date.now(); }
        }

        function perfCount(name, amount = 1, domain = 'translator') {
            if (!scope.isPerfEnabled() || !scope.perf || typeof scope.perf.count !== 'function') return;
            try { scope.perf.count(name, amount, { domain }); } catch (_) {}
        }

        function perfTop(group, label, amount = 1, domain = 'translator') {
            if (!scope.isPerfEnabled() || !scope.perf || typeof scope.perf.top !== 'function') return;
            try { scope.perf.top(group, label, amount, { domain }); } catch (_) {}
        }

        function recordBitmapDrawHookCall(methodName) {
            perfCount('bitmap.drawText.calls', 1, 'hook');
            perfTop('bitmap.drawText.method', methodName, 1, 'hook');
        }

        function beginBitmapDrawHookIntel(methodName) {
            const profilerOn = scope.isPerfEnabled();
            const hookStart = profilerOn ? perfNow() : null;
            if (profilerOn) recordBitmapDrawHookCall(methodName);
            return { profilerOn, hookStart };
        }

        function recordBitmapDrawSourceObservation(sourceObservation) {
            const observation = sourceObservationContract.normalizeSourceObservation(sourceObservation);
            if (observation.status === 'observed') return;
            const metricName = observation.status === 'suppressed'
                ? 'bitmap.drawText.sourceSuppressed'
                : (observation.status === 'rejected'
                    ? 'bitmap.drawText.sourceRejected'
                    : 'bitmap.drawText.sourceIgnored');
            perfCount(metricName, 1, 'hook');
            perfTop('bitmap.drawText.sourceObservation.status', observation.status, 1, 'hook');
            if (observation.reason) {
                perfTop('bitmap.drawText.sourceObservation.reason', observation.reason, 1, 'hook');
            }
        }

        function recordBitmapDrawRecordResult(recorded) {
            perfCount(recorded ? 'bitmap.drawText.recorded' : 'bitmap.drawText.recordMissed', 1, 'hook');
        }

        function recordBitmapDrawNotRecordable() {
            perfCount('bitmap.drawText.notRecordable', 1, 'hook');
        }

        function isBitmapDrawTraceEnabled() {
            return isDrawCaptureTraceEnabled();
        }

        function recordBitmapDrawEnterTrace(bitmap, input = {}) {
            return recordBitmapDrawTrace('bitmap.drawText.enter', bitmap, input.text, input, {
                ownerType: input.ownerType,
                maxWidth: input.maxWidth,
                lineHeight: input.lineHeight,
                align: input.align,
            });
        }

        function recordBitmapDrawEnterIfEnabled(bitmap, input = {}) {
            const source = input && typeof input === 'object' ? input : {};
            if (source.traceEnabled !== true) return null;
            return recordBitmapDrawEnterTrace(bitmap, source.traceInput || source);
        }

        function recordBitmapDrawSourceObservationTrace(bitmap, input = {}, sourceObservation = {}) {
            const observation = sourceObservationContract.normalizeSourceObservation(sourceObservation);
            if (observation.status === 'observed') return null;
            const stage = observation.status === 'suppressed'
                ? 'bitmap.drawText.sourceSuppressed'
                : (observation.status === 'rejected'
                    ? 'bitmap.drawText.sourceRejected'
                    : 'bitmap.drawText.sourceIgnored');
            return recordBitmapDrawTrace(stage, bitmap, input.text, input, {
                ownerType: input.ownerType,
                reason: observation.reason,
                sourceObservationStatus: observation.status,
                maxWidth: input.maxWidth,
                lineHeight: input.lineHeight,
                align: input.align,
            });
        }

        function recordBitmapDrawReplacementTrace(bitmap, input = {}, replacement = {}) {
            return recordBitmapDrawTrace('bitmap.drawText.replaced', bitmap, replacement.text, {
                methodName: input.methodName,
                text: replacement.text,
                x: replacement.x,
                y: replacement.y,
            }, {
                ownerType: input.ownerType,
                reason: replacement.reason || 'inlineReplacementIndex',
                originalText: input.text,
                maxWidth: replacement.maxWidth,
                lineHeight: replacement.lineHeight,
                align: replacement.align,
            });
        }

        function recordBitmapDrawSuppressedTrace(bitmap, input = {}, replacement = {}) {
            return recordBitmapDrawTrace('bitmap.drawText.skip', bitmap, input.text, input, {
                ownerType: input.ownerType,
                reason: replacement.reason || 'inlineReplacementIndex',
                maxWidth: input.maxWidth,
                lineHeight: input.lineHeight,
                align: input.align,
            });
        }

        function recordBitmapDrawRecordedTrace(bitmap, input = {}, unit = null) {
            return recordBitmapDrawTrace('bitmap.drawText.recorded', bitmap, input.text, input, {
                ownerType: input.ownerType,
                drawUnitId: unit && unit.id ? unit.id : '',
                maxWidth: input.maxWidth,
                lineHeight: input.lineHeight,
                align: input.align,
            });
        }

        function recordBitmapDrawTransactionOutcome(bitmap, input = {}) {
            const source = input && typeof input === 'object' ? input : {};
            const outcome = source.outcome && typeof source.outcome === 'object' ? source.outcome : {};
            const inlineReplacement = outcome.inlineReplacement && typeof outcome.inlineReplacement === 'object'
                ? outcome.inlineReplacement
                : null;
            const bypassReason = outcome.bypassReason || '';
            const sourceObservation = sourceObservationContract.normalizeSourceObservation(
                outcome.sourceObservation,
                outcome.status === 'recordMissed' ? 'rejected' : '',
                outcome.status === 'recordMissed' ? 'record-missed' : bypassReason
            );
            if (sourceObservation.status !== 'observed') {
                if (source.profilerOn === true) recordBitmapDrawSourceObservation(sourceObservation);
                if (source.traceEnabled === true) {
                    recordBitmapDrawSourceObservationTrace(bitmap, source.traceInput, sourceObservation);
                }
            }
            if (inlineReplacement && source.traceEnabled === true) {
                if (outcome.status === 'replaced') {
                    recordBitmapDrawReplacementTrace(bitmap, source.traceInput, inlineReplacement);
                } else if (outcome.status === 'suppressed') {
                    recordBitmapDrawSuppressedTrace(bitmap, source.traceInput, inlineReplacement);
                }
            }
            const unit = outcome.unit || null;
            if (outcome.recordResult === true && source.profilerOn === true) {
                recordBitmapDrawRecordResult(!!unit);
            }
            if (unit && source.traceEnabled === true) {
                recordBitmapDrawRecordedTrace(bitmap, source.traceInput, unit);
            }
            if (outcome.notRecordable === true && source.profilerOn === true) {
                recordBitmapDrawNotRecordable();
            }
            return unit;
        }

        function recordBitmapDrawTrace(stage, bitmap, rawText, input = {}, extra = {}) {
            if (!isDrawCaptureTraceEnabled()) return null;
            return recordDrawTrace(stage, rawText, bitmapTraceDetails(
                bitmap,
                input.methodName,
                rawText,
                input.x,
                input.y,
                extra
            ));
        }

        function createBitmapNativeDrawInvoker(bitmap, methodName, original) {
            const profilerOn = scope.isPerfEnabled();
            let nativeDrawMs = 0;

            function invoke(drawArgs, bypassReason = '') {
                if (!profilerOn) return original.apply(bitmap, drawArgs);
                const nativeStart = perfNow();
                try {
                    return original.apply(bitmap, drawArgs);
                } finally {
                    const nativeMs = Math.max(0, perfNow() - nativeStart);
                    nativeDrawMs += nativeMs;
                    const attribution = classifyBitmapNativeDrawAttribution(bitmap, bypassReason);
                    recordBitmapNativeDrawTiming(methodName, nativeMs, attribution, bypassReason);
                }
            }

            return {
                invoke,
                getNativeDrawMs() {
                    return nativeDrawMs;
                },
            };
        }

        function recordBitmapHookTiming(start, methodName, status, bypassReason, nativeDrawMs = 0) {
            if (!Number.isFinite(Number(start)) || !scope.isPerfEnabled()) return;
            const elapsed = Math.max(0, perfNow() - start - (Number(nativeDrawMs) || 0));
            perfTime('bitmap.drawText.hook.ms', elapsed, 'hook');
            perfTime(`bitmap.drawText.hook.method.${sanitizePerfLabel(methodName)}.ms`, elapsed, 'hook');
            perfTop('bitmap.drawText.hook.status', status || 'unknown', 1, 'hook');
            if (bypassReason) perfTop('bitmap.drawText.hook.bypassReason', bypassReason, 1, 'hook');
        }

        function finishBitmapDrawHookIntel(input = {}) {
            const source = input && typeof input === 'object' ? input : {};
            recordBitmapHookTiming(
                source.hookStart,
                source.methodName || 'drawText',
                source.status || 'native-only',
                source.bypassReason || '',
                getNativeDrawMs(source.nativeDraw)
            );
        }

        function getNativeDrawMs(nativeDraw) {
            return nativeDraw && typeof nativeDraw.getNativeDrawMs === 'function'
                ? nativeDraw.getNativeDrawMs()
                : 0;
        }

        function recordBitmapNativeDrawTiming(methodName, nativeMs, attribution, bypassReason) {
            const drawAttribution = attribution && typeof attribution === 'object' ? attribution : {};
            const targetDomain = drawAttribution.domain || 'game';
            const workload = drawAttribution.workload || targetDomain;
            perfTime('bitmap.drawText.native.ms', nativeMs, targetDomain);
            perfTime(`bitmap.drawText.native.method.${sanitizePerfLabel(methodName)}.ms`, nativeMs, targetDomain);
            perfTime(`bitmap.drawText.native.workload.${sanitizePerfLabel(workload)}.ms`, nativeMs, targetDomain);
            perfTop('bitmap.drawText.native.methodTime', methodName || 'drawText', nativeMs, targetDomain);
            perfTop('bitmap.drawText.native.domain', targetDomain, 1, targetDomain);
            perfTop('bitmap.drawText.native.workload', workload, 1, targetDomain);
            if (bypassReason) {
                perfTop('bitmap.drawText.native.bypassReason', bypassReason, 1, targetDomain);
                perfTime(`bitmap.drawText.native.bypass.${sanitizePerfLabel(bypassReason)}.ms`, nativeMs, targetDomain);
            }
        }

        function classifyBitmapNativeDrawAttribution(bitmap, bypassReason) {
            const guardState = bitmap ? scope.bitmapServices.getRenderGuardState(bitmap) : null;
            const attribution = sanitizeBitmapNativeDrawAttribution(guardState && guardState.bitmapNativeDrawAttribution);
            if (attribution) {
                return {
                    domain: `translator-render.${attribution}`,
                    workload: attribution,
                };
            }
            if (guardState && guardState.bitmapReplayDepth > 0) {
                return {
                    domain: 'translator-replay',
                    workload: 'bitmapReplay',
                };
            }
            if (guardState && guardState.spriteTextReplayDepth > 0) {
                return {
                    domain: 'translator-render.spriteOverlay',
                    workload: 'spriteOverlay',
                };
            }
            return {
                domain: 'game',
                workload: bypassReason ? `game.${bypassReason}` : 'game',
            };
        }

        function perfTime(name, ms, domain = 'translator') {
            if (!scope.isPerfEnabled() || !scope.perf || typeof scope.perf.time !== 'function') return;
            try { scope.perf.time(name, ms, { domain }); } catch (_) {}
        }

        function sanitizeBitmapNativeDrawAttribution(attribution) {
            const safe = sanitizePerfLabel(attribution || '');
            return safe === 'unknown' ? '' : safe;
        }

        return {
            beginBitmapDrawHookIntel,
            isBitmapDrawTraceEnabled,
            recordBitmapDrawEnterIfEnabled,
            recordBitmapDrawTransactionOutcome,
            createBitmapNativeDrawInvoker,
            finishBitmapDrawHookIntel,
        };
    }

            return { create: createController };
        },
    });
})();
