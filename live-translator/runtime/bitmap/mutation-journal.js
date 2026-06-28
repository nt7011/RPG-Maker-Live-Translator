// Bitmap mutation journal.
//
// Mutation hooks are moving toward a small transaction shell. This journal owns
// the deterministic participant ordering for the work that surrounds native
// bitmap mutations while staying independent from adapters and window helpers.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'runtime.bitmap.mutationJournal',
        factory() {
            function createMutationJournal(options = {}) {
                const settings = options && typeof options === 'object' ? options : {};
                const reportError = typeof settings.reportError === 'function' ? settings.reportError : null;
                const participants = [];
                let nextRegistrationOrder = 0;

                function registerParticipant(participant) {
                    const normalized = normalizeParticipant(participant, nextRegistrationOrder + 1);
                    nextRegistrationOrder += 1;
                    participants.push(normalized);
                    return function unregisterParticipant() {
                        const index = participants.indexOf(normalized);
                        if (index >= 0) participants.splice(index, 1);
                    };
                }

                (Array.isArray(settings.participants) ? settings.participants : []).forEach(registerParticipant);

                function beginMutation(bitmap, input = {}) {
                    const normalized = normalizeMutationInput(input);
                    const context = createMutationContext(bitmap, normalized);
                    const activeParticipants = selectParticipants(context);
                    context.setParticipants(activeParticipants.map((participant) => participant.name));
                    runPhase(context, activeParticipants, 'beforeNative');
                    return createJournalTransaction(context, activeParticipants);
                }

                function getParticipants() {
                    return participants
                        .slice()
                        .sort(compareParticipants)
                        .map((participant) => ({
                            name: participant.name,
                            order: participant.order,
                            capabilities: participant.capabilities.slice(),
                        }));
                }

                function selectParticipants(context) {
                    return participants
                        .slice()
                        .sort(compareParticipants)
                        .filter((participant) => participantMatchesCapabilities(participant, context.capabilities))
                        .filter((participant) => participantShouldRun(participant, context));
                }

                function participantShouldRun(participant, context) {
                    if (typeof participant.shouldRun !== 'function') return true;
                    try {
                        return participant.shouldRun(context) !== false;
                    } catch (error) {
                        reportParticipantError(context, participant, 'shouldRun', error);
                        return false;
                    }
                }

                function runPhase(context, activeParticipants, phaseName) {
                    context.setPhase(phaseName);
                    activeParticipants.forEach((participant) => {
                        const handler = participant[phaseName];
                        if (typeof handler !== 'function') return;
                        try {
                            const result = handler(context);
                            applyParticipantResult(context, result);
                            context.recordPhase(participant.name, phaseName, result);
                        } catch (error) {
                            reportParticipantError(context, participant, phaseName, error);
                        }
                    });
                    context.setPhase('');
                }

                function reportParticipantError(context, participant, phaseName, error) {
                    context.recordError(participant.name, phaseName, error);
                    if (!reportError) return;
                    try {
                        reportError(`mutationJournal.${phaseName}`, error, {
                            participant: participant.name,
                            methodName: context.methodName,
                        });
                    } catch (_) {}
                }

                function createJournalTransaction(context, activeParticipants) {
                    let status = 'pending';
                    const transaction = {
                        kind: 'mutation-journal',
                        methodName: context.methodName,
                        callNative: context.callNative !== false,
                        nativeArgs: context.getNativeArgs(),
                        participantNames: context.getParticipantNames(),
                        getStatus() {
                            return status;
                        },
                        getContextSnapshot() {
                            return context.getSnapshot(status);
                        },
                        commitNativeSuccess(input = {}) {
                            if (status !== 'pending') return null;
                            status = 'committed';
                            context.mergeMutationInput(input);
                            runPhase(context, activeParticipants, 'afterNativeSuccess');
                            return context.getSnapshot(status);
                        },
                        abortNativeFailure(error) {
                            if (status !== 'pending') return null;
                            status = 'aborted';
                            context.setNativeError(error);
                            runPhase(context, activeParticipants, 'afterNativeFailure');
                            return context.getSnapshot(status);
                        },
                        finishSuppressed(reason = 'suppressed') {
                            if (status !== 'pending') return null;
                            status = 'suppressed';
                            context.suppressNative(reason);
                            runPhase(context, activeParticipants, 'finishSuppressed');
                            return context.getSnapshot(status);
                        },
                    };
                    return freezeApi(transaction);
                }

                return freezeApi({
                    registerParticipant,
                    beginMutation,
                    getParticipants,
                });
            }

            function createMutationContext(bitmap, input = {}) {
                const state = {
                    bitmap,
                    methodName: stringify(input.methodName || 'mutation') || 'mutation',
                    args: Array.isArray(input.args) ? input.args.slice() : [],
                    nativeArgs: Array.isArray(input.nativeArgs) ? input.nativeArgs.slice() : [],
                    targetRect: cloneRect(input.targetRect || null),
                    targetRectAfterCopy: cloneRect(input.targetRectAfterCopy || input.targetRect || null),
                    sourceBitmap: input.sourceBitmap || null,
                    sourceRect: cloneRect(input.sourceRect || null),
                    full: input.full === true,
                    surfaceId: stringify(input.surfaceId || ''),
                    clearReplay: stringify(input.clearReplay || ''),
                    destroyed: input.destroyed === true,
                    newGeneration: input.newGeneration === true,
                    recordOp: input.recordOp || null,
                    replayOp: input.replayOp || input.recordOp || null,
                    capabilities: cloneStringList(input.capabilities),
                    participantNames: [],
                    phaseRecords: [],
                    errors: [],
                    metadata: copyPlainObject(input.metadata),
                    callNative: input.callNative !== false,
                    suppressedReason: '',
                    nativeErrorMessage: '',
                    phase: '',
                };
                if (!state.nativeArgs.length) state.nativeArgs = state.args.slice();

                const context = {
                    get bitmap() { return state.bitmap; },
                    get methodName() { return state.methodName; },
                    get args() { return state.args.slice(); },
                    get targetRect() { return cloneRect(state.targetRect); },
                    get targetRectAfterCopy() { return cloneRect(state.targetRectAfterCopy); },
                    get sourceBitmap() { return state.sourceBitmap; },
                    get sourceRect() { return cloneRect(state.sourceRect); },
                    get full() { return state.full; },
                    get surfaceId() { return state.surfaceId; },
                    get clearReplay() { return state.clearReplay; },
                    get destroyed() { return state.destroyed; },
                    get newGeneration() { return state.newGeneration; },
                    get recordOp() { return state.recordOp; },
                    get replayOp() { return state.replayOp; },
                    get capabilities() { return state.capabilities.slice(); },
                    get callNative() { return state.callNative; },
                    get phase() { return state.phase; },
                    get metadata() { return copyPlainObject(state.metadata); },
                    getNativeArgs() {
                        return state.nativeArgs.slice();
                    },
                    setNativeArgs(args) {
                        state.nativeArgs = Array.isArray(args) ? args.slice() : [];
                    },
                    suppressNative(reason = 'suppressed') {
                        state.callNative = false;
                        state.suppressedReason = stringify(reason || 'suppressed') || 'suppressed';
                    },
                    setMetadata(key, value) {
                        const name = stringify(key || '');
                        if (!name) return;
                        state.metadata[name] = clonePlainValue(value);
                    },
                    getMetadata(key) {
                        const name = stringify(key || '');
                        return clonePlainValue(state.metadata[name]);
                    },
                    mergeMutationInput(input = {}) {
                        const source = input && typeof input === 'object' ? input : {};
                        if (source.methodName !== undefined) state.methodName = stringify(source.methodName || 'mutation') || 'mutation';
                        if (Array.isArray(source.args)) state.args = source.args.slice();
                        if (Array.isArray(source.nativeArgs)) state.nativeArgs = source.nativeArgs.slice();
                        if (source.targetRect !== undefined || source.rect !== undefined) {
                            state.targetRect = cloneRect(source.targetRect || source.rect || null);
                            if (source.targetRectAfterCopy === undefined) state.targetRectAfterCopy = cloneRect(state.targetRect);
                        }
                        if (source.targetRectAfterCopy !== undefined) state.targetRectAfterCopy = cloneRect(source.targetRectAfterCopy || null);
                        if (source.sourceBitmap !== undefined) state.sourceBitmap = source.sourceBitmap || null;
                        if (source.sourceRect !== undefined) state.sourceRect = cloneRect(source.sourceRect || null);
                        if (source.full !== undefined) state.full = source.full === true;
                        if (source.surfaceId !== undefined) state.surfaceId = stringify(source.surfaceId || '');
                        if (source.clearReplay !== undefined) state.clearReplay = stringify(source.clearReplay || '');
                        if (source.destroyed !== undefined) state.destroyed = source.destroyed === true;
                        if (source.newGeneration !== undefined) state.newGeneration = source.newGeneration === true;
                        if (source.recordOp !== undefined) {
                            state.recordOp = source.recordOp || null;
                            if (source.replayOp === undefined) state.replayOp = state.recordOp;
                        }
                        if (source.replayOp !== undefined) state.replayOp = source.replayOp || null;
                    },
                    setParticipants(names) {
                        state.participantNames = cloneStringList(names);
                    },
                    getParticipantNames() {
                        return state.participantNames.slice();
                    },
                    recordPhase(participant, phaseName, result) {
                        state.phaseRecords.push({
                            participant: stringify(participant || ''),
                            phase: stringify(phaseName || ''),
                            result: summarizePhaseResult(result),
                        });
                    },
                    recordError(participant, phaseName, error) {
                        state.errors.push({
                            participant: stringify(participant || ''),
                            phase: stringify(phaseName || ''),
                            message: stringify(error && error.message ? error.message : error || 'error'),
                        });
                    },
                    setNativeError(error) {
                        state.nativeErrorMessage = stringify(error && error.message ? error.message : error || '');
                    },
                    setPhase(phaseName) {
                        state.phase = stringify(phaseName || '');
                    },
                    getSnapshot(status = 'pending') {
                        return {
                            status: stringify(status || 'pending'),
                            methodName: state.methodName,
                            callNative: state.callNative !== false,
                            nativeArgs: state.nativeArgs.slice(),
                            targetRect: cloneRect(state.targetRect),
                            targetRectAfterCopy: cloneRect(state.targetRectAfterCopy),
                            sourceRect: cloneRect(state.sourceRect),
                            full: state.full === true,
                            surfaceId: state.surfaceId,
                            clearReplay: state.clearReplay,
                            destroyed: state.destroyed === true,
                            newGeneration: state.newGeneration === true,
                            participantNames: state.participantNames.slice(),
                            phaseRecords: state.phaseRecords.map(copyPhaseRecord),
                            errors: state.errors.map(copyErrorRecord),
                            suppressedReason: state.suppressedReason,
                            nativeErrorMessage: state.nativeErrorMessage,
                            metadata: copyPlainObject(state.metadata),
                        };
                    },
                };
                return context;
            }

            function normalizeMutationInput(input = {}) {
                const source = input && typeof input === 'object' ? input : {};
                const args = Array.isArray(source.args) ? source.args.slice() : [];
                const nativeArgs = Array.isArray(source.nativeArgs) ? source.nativeArgs.slice() : args.slice();
                return {
                    methodName: stringify(source.methodName || 'mutation') || 'mutation',
                    args,
                    nativeArgs,
                    targetRect: cloneRect(source.targetRect || source.rect || null),
                    targetRectAfterCopy: cloneRect(source.targetRectAfterCopy || source.targetRect || source.rect || null),
                    sourceBitmap: source.sourceBitmap || null,
                    sourceRect: cloneRect(source.sourceRect || null),
                    full: source.full === true,
                    surfaceId: stringify(source.surfaceId || ''),
                    clearReplay: stringify(source.clearReplay || ''),
                    destroyed: source.destroyed === true,
                    newGeneration: source.newGeneration === true,
                    recordOp: source.recordOp || null,
                    replayOp: source.replayOp || source.recordOp || null,
                    capabilities: cloneStringList(source.capabilities),
                    metadata: copyPlainObject(source.metadata),
                    callNative: source.callNative !== false,
                };
            }

            function normalizeParticipant(participant, registrationOrder) {
                const source = participant && typeof participant === 'object' ? participant : {};
                const name = stringify(source.name || source.capability || `participant-${registrationOrder}`) || `participant-${registrationOrder}`;
                return {
                    name,
                    order: finiteNumber(source.order, 0),
                    registrationOrder,
                    capabilities: cloneStringList(source.capabilities || source.capability),
                    shouldRun: typeof source.shouldRun === 'function' ? source.shouldRun : null,
                    beforeNative: typeof source.beforeNative === 'function' ? source.beforeNative : null,
                    afterNativeSuccess: typeof source.afterNativeSuccess === 'function' ? source.afterNativeSuccess : null,
                    afterNativeFailure: typeof source.afterNativeFailure === 'function' ? source.afterNativeFailure : null,
                    finishSuppressed: typeof source.finishSuppressed === 'function' ? source.finishSuppressed : null,
                };
            }

            function compareParticipants(left, right) {
                if (left.order !== right.order) return left.order - right.order;
                return left.registrationOrder - right.registrationOrder;
            }

            function participantMatchesCapabilities(participant, requestedCapabilities) {
                if (!participant.capabilities.length || !requestedCapabilities.length) return true;
                return participant.capabilities.some((capability) => requestedCapabilities.indexOf(capability) >= 0);
            }

            function applyParticipantResult(context, result) {
                if (!result || typeof result !== 'object') return;
                if (Array.isArray(result.nativeArgs)) context.setNativeArgs(result.nativeArgs);
                if (result.callNative === false || result.suppressNative === true) {
                    context.suppressNative(result.reason || 'participant-suppressed');
                }
            }

            function summarizePhaseResult(result) {
                if (!result || typeof result !== 'object') return null;
                return {
                    callNative: result.callNative === false ? false : undefined,
                    suppressNative: result.suppressNative === true ? true : undefined,
                    reason: result.reason !== undefined ? stringify(result.reason) : undefined,
                    nativeArgs: Array.isArray(result.nativeArgs) ? result.nativeArgs.map(summarizeArg) : undefined,
                };
            }

            function copyPhaseRecord(record) {
                return {
                    participant: record.participant,
                    phase: record.phase,
                    result: clonePlainValue(record.result),
                };
            }

            function copyErrorRecord(record) {
                return {
                    participant: record.participant,
                    phase: record.phase,
                    message: record.message,
                };
            }

            function cloneRect(rect) {
                if (!rect || typeof rect !== 'object') return null;
                const x1 = finiteNumber(rect.x1, rect.x, 0);
                const y1 = finiteNumber(rect.y1, rect.y, 0);
                const x2 = rect.x2 !== undefined ? finiteNumber(rect.x2, x1) : x1 + Math.max(0, finiteNumber(rect.width, 0));
                const y2 = rect.y2 !== undefined ? finiteNumber(rect.y2, y1) : y1 + Math.max(0, finiteNumber(rect.height, 0));
                return { x1, y1, x2, y2 };
            }

            function cloneStringList(value) {
                const source = Array.isArray(value) ? value : (value !== undefined && value !== null ? [value] : []);
                const output = [];
                source.forEach((item) => {
                    const text = stringify(item || '');
                    if (text && output.indexOf(text) < 0) output.push(text);
                });
                return output;
            }

            function clonePlainValue(value) {
                if (value === null || value === undefined) return value === undefined ? undefined : null;
                const type = typeof value;
                if (type === 'string' || type === 'number' || type === 'boolean') return value;
                if (Array.isArray(value)) return value.map(clonePlainValue);
                if (type !== 'object') return undefined;
                const output = {};
                Object.keys(value).forEach((key) => {
                    const cloned = clonePlainValue(value[key]);
                    if (cloned !== undefined) output[key] = cloned;
                });
                return output;
            }

            function copyPlainObject(value) {
                if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
                const output = {};
                Object.keys(value).forEach((key) => {
                    const cloned = clonePlainValue(value[key]);
                    if (cloned !== undefined) output[key] = cloned;
                });
                return output;
            }

            function summarizeArg(value) {
                const type = typeof value;
                if (value === null || type === 'string' || type === 'number' || type === 'boolean') return value;
                if (type === 'object' || type === 'function') return '[object]';
                return stringify(value);
            }

            function finiteNumber(...values) {
                for (const value of values) {
                    const numeric = Number(value);
                    if (Number.isFinite(numeric)) return numeric;
                }
                return 0;
            }

            function stringify(value) {
                try { return String(value ?? ''); } catch (_) { return ''; }
            }

            function freezeApi(api) {
                try { return Object.freeze(api); } catch (_) { return api; }
            }

            return {
                createMutationJournal,
            };
        },
    });
})();
