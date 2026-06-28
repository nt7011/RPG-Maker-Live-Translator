// Bitmap draw unit pipeline.
//
// Bitmap.drawText hooks record compact native draw units. This module owns the
// pending-unit buffers, draw-run context stacks, text-run subscriber ordering,
// dispatch consumption, and queue flush semantics. It does not own surface
// ledger policy; callers provide a committed-draw callback for that boundary.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'runtime.bitmap.drawUnitPipeline',
        factory() {
            const DEFAULT_TEXT_RUN_CLAIM_ORDER = 3;
            const OWNER_CLAIM_MAX_ORDER = 1;
            const DRAW_UNIT_DRAIN_PRESERVE = 'preserve';
            const DRAW_UNIT_DRAIN_TERMINAL = 'terminal';

            function createDrawUnitPipeline(deps = {}) {
                const runAssembler = deps.runAssembler;
                if (!runAssembler
                    || typeof runAssembler.collectTextRunsFromDrawUnitDispatch !== 'function'
                    || typeof runAssembler.createSurfaceDrawPayloadFromDispatchRun !== 'function'
                    || typeof runAssembler.getBackgroundPatchFromDispatchRun !== 'function'
                    || typeof runAssembler.getBackgroundPatchesFromDispatchRun !== 'function'
                    || typeof runAssembler.getDrawUnitsForTextRun !== 'function') {
                    throw new Error('[LiveTranslator] runtime.bitmap.drawUnitPipeline requires a complete run assembler dependency.');
                }

                const captureBitmapDrawState = typeof deps.captureBitmapDrawState === 'function'
                    ? deps.captureBitmapDrawState
                    : () => null;
                const recordCommittedDraw = typeof deps.recordCommittedDraw === 'function'
                    ? deps.recordCommittedDraw
                    : () => null;
                const reportError = typeof deps.reportError === 'function'
                    ? deps.reportError
                    : () => {};
                const warn = typeof deps.warn === 'function'
                    ? deps.warn
                    : () => {};
                const maxDrawUnitsPerBitmap = readPositiveInteger(deps.maxDrawUnitsPerBitmap, 8192);
                const maxTerminalDrawUnitEvents = readPositiveInteger(deps.maxTerminalDrawUnitEvents, 256);
                const maxDrawUnitDrainEvents = readPositiveInteger(deps.maxDrawUnitDrainEvents, 256);
                const recordTerminalDrawUnitEvent = typeof deps.recordTerminalDrawUnitEvent === 'function'
                    ? deps.recordTerminalDrawUnitEvent
                    : () => {};
                const recordDrawUnitDrainEvent = typeof deps.recordDrawUnitDrainEvent === 'function'
                    ? deps.recordDrawUnitDrainEvent
                    : () => {};
                const drawStates = new WeakMap();
                const drawRunContexts = new WeakMap();
                const pendingDrawBitmaps = new Set();
                const terminalDrawUnitEvents = [];
                const drawUnitDrainEvents = [];
                const textRunSubscribers = [];
                let nextDrawStateId = 0;
                let nextDrawUnitId = 0;
                let flushingDrawUnits = false;

                function ensureDrawState(bitmap) {
                    if (!bitmap) return null;
                    let state = drawStates.get(bitmap);
                    if (!state) {
                        state = {
                            id: `bdh-${(++nextDrawStateId).toString(36)}`,
                            bitmap,
                            units: [],
                            styleIds: new Map(),
                            styles: [],
                            order: 0,
                            droppedUnits: 0,
                        };
                        drawStates.set(bitmap, state);
                    }
                    if (!Array.isArray(state.units)) state.units = [];
                    if (!Array.isArray(state.styles)) state.styles = [];
                    if (!state.styleIds || typeof state.styleIds.get !== 'function') state.styleIds = new Map();
                    return state;
                }

                function getDrawState(bitmap) {
                    if (!bitmap) return null;
                    try {
                        return drawStates.get(bitmap) || null;
                    } catch (error) {
                        reportError('getDrawState', error);
                        return null;
                    }
                }

                function enterDrawRunContext(bitmap, input = {}) {
                    if (!canStoreWeakState(bitmap)) return () => {};
                    const context = normalizeDrawRunContext(input);
                    if (!context) return () => {};
                    let stack = drawRunContexts.get(bitmap);
                    if (!stack) {
                        stack = [];
                        drawRunContexts.set(bitmap, stack);
                    }
                    stack.push(context);
                    let active = true;
                    return () => {
                        if (!active) return;
                        active = false;
                        const current = drawRunContexts.get(bitmap);
                        if (!current) return;
                        const index = current.lastIndexOf(context);
                        if (index >= 0) current.splice(index, 1);
                        if (!current.length) drawRunContexts.delete(bitmap);
                    };
                }

                function getActiveDrawRunContext(bitmap) {
                    if (!canStoreWeakState(bitmap)) return null;
                    const stack = drawRunContexts.get(bitmap);
                    const context = stack && stack.length ? stack[stack.length - 1] : null;
                    return context || null;
                }

                function recordDraw(bitmap, input = {}) {
                    if (!bitmap || !input) return null;
                    const text = stringify(input.text !== undefined ? input.text : input.rawText);
                    if (!text) return null;
                    const state = ensureDrawState(bitmap);
                    if (!state) return null;
                    if (state.units.length >= maxDrawUnitsPerBitmap) {
                        state.droppedUnits += 1;
                        pendingDrawBitmaps.add(bitmap);
                        return null;
                    }
                    const methodName = stringify(input.methodName || 'drawText') || 'drawText';
                    const style = internDrawStyle(state, bitmap, input.drawState);
                    const drawRunContext = getActiveDrawRunContext(bitmap) || normalizeDrawRunContext(input.drawRunContext);
                    const normalCharacterContext = drawRunContext && drawRunContext.type === 'normalCharacter'
                        ? drawRunContext
                        : null;
                    const normalCharacterRunId = stringify(input.normalCharacterRunId || normalCharacterContext && normalCharacterContext.runId || '');
                    const drawRunContextSnapshot = createDrawRunContextSnapshot(drawRunContext, {
                        type: normalCharacterRunId ? 'normalCharacter' : '',
                        runId: normalCharacterRunId,
                    });
                    const unit = {
                        id: `bdu-${(++nextDrawUnitId).toString(36)}`,
                        bitmap,
                        methodName,
                        text,
                        x: finiteNumber(input.x, 0),
                        y: finiteNumber(input.y, 0),
                        maxWidth: finiteNumber(input.maxWidth, 0),
                        lineHeight: positiveNumber(input.lineHeight, bitmap && bitmap.fontSize, 24),
                        align: normalizeCanvasTextAlign(input.align),
                        ownerType: stringify(input.ownerType || ''),
                        normalCharacter: input.normalCharacter === true || !!normalCharacterContext || !!normalCharacterRunId,
                        normalCharacterRunId,
                        drawRunContext: drawRunContextSnapshot,
                        styleId: style.id,
                        drawState: style.state,
                        measuredWidth: nonNegativeNumber(input.measuredWidth, 0),
                        backgroundPatch: input.backgroundPatch || null,
                        fallbackBackgroundPatch: input.fallbackBackgroundPatch || null,
                        order: ++state.order,
                    };
                    state.units.push(unit);
                    pendingDrawBitmaps.add(bitmap);
                    recordDrawUnitCommit(bitmap, input, unit);
                    return unit;
                }

                function recordDrawUnitCommit(bitmap, input, unit) {
                    try {
                        const ledgerUnit = recordCommittedDraw(bitmap, input, unit);
                        if (ledgerUnit && unit) {
                            unit.ledgerUnitId = ledgerUnit.unitId;
                            unit.ledgerTextRunId = ledgerUnit.textRunId;
                            unit.surfaceId = ledgerUnit.surfaceId;
                            unit.surfaceRevision = ledgerUnit.revision;
                        }
                        return ledgerUnit || null;
                    } catch (error) {
                        reportError('recordCommittedDraw', error);
                        return null;
                    }
                }

                function internDrawStyle(state, bitmap, explicitState) {
                    const source = explicitState && typeof explicitState === 'object'
                        ? explicitState
                        : captureBitmapDrawState(bitmap);
                    const snapshot = source && typeof source === 'object' ? source : {};
                    const key = [
                        snapshot.fontFace,
                        snapshot.fontSize,
                        snapshot.fontBold,
                        snapshot.fontItalic,
                        snapshot.textColor,
                        snapshot.outlineColor,
                        snapshot.outlineWidth,
                    ].join('|');
                    const existingId = state.styleIds.get(key);
                    if (existingId) {
                        const existing = state.styles[existingId - 1];
                        if (existing) return existing;
                    }
                    const style = {
                        id: state.styles.length + 1,
                        key,
                        state: copyDrawState(snapshot),
                    };
                    state.styles.push(style);
                    state.styleIds.set(key, style.id);
                    return style;
                }

                function subscribeTextRuns(options = {}) {
                    const source = typeof options === 'function' ? { onRun: options } : (options || {});
                    if (typeof source.onRuns !== 'function' && typeof source.onRun !== 'function') {
                        warn('[BitmapServices] Ignoring invalid bitmap text run subscriber.');
                        return () => {};
                    }
                    const subscription = {
                        onRuns: typeof source.onRuns === 'function' ? source.onRuns : null,
                        onRun: typeof source.onRun === 'function' ? source.onRun : null,
                        adapterId: stringify(source.adapterId || source.id || 'bitmap'),
                        claimOrder: normalizeTextRunClaimOrder(source.claimOrder, DEFAULT_TEXT_RUN_CLAIM_ORDER),
                        token: stringify(source.token || 'text-runs'),
                        runOptions: normalizeTextRunSubscriptionOptions(source),
                    };
                    textRunSubscribers.push(subscription);
                    textRunSubscribers.sort((left, right) => left.claimOrder - right.claimOrder);
                    return () => {
                        const index = textRunSubscribers.indexOf(subscription);
                        if (index >= 0) textRunSubscribers.splice(index, 1);
                    };
                }

                function hasPendingDrawUnits(bitmap = null) {
                    if (bitmap) {
                        const state = getDrawState(bitmap);
                        return !!(state && ((state.units && state.units.length) || state.droppedUnits > 0));
                    }
                    return pendingDrawBitmaps.size > 0;
                }

                function flushPendingDrawUnits(reason = 'frame', targetBitmap = null, options = {}) {
                    if (flushingDrawUnits) return 0;
                    const flushOptions = normalizeDrawUnitFlushOptions(options);
                    const targets = targetBitmap
                        ? (hasPendingDrawUnits(targetBitmap) ? [targetBitmap] : [])
                        : Array.from(pendingDrawBitmaps);
                    if (!targets.length) return 0;
                    flushingDrawUnits = true;
                    let flushed = 0;
                    try {
                        targets.forEach((bitmap) => {
                            const state = getDrawState(bitmap);
                            if (!state || !Array.isArray(state.units) || (!state.units.length && !state.droppedUnits)) {
                                pendingDrawBitmaps.delete(bitmap);
                                return;
                            }
                            const units = state.units;
                            state.units = [];
                            const droppedUnits = state.droppedUnits || 0;
                            state.droppedUnits = 0;
                            pendingDrawBitmaps.delete(bitmap);
                            if (units.length) {
                                const dispatch = createDrawUnitDispatch(bitmap, state, units, reason, droppedUnits, flushOptions);
                                dispatchTextRuns(dispatch, flushOptions);
                                applyTerminalDrainPolicy(dispatch, flushOptions);
                                const remaining = dispatch.getUnconsumedUnits();
                                recordDrawUnitDrain(dispatch, {
                                    unitCount: units.length,
                                    remainingCount: remaining.length,
                                });
                                if (remaining.length) {
                                    state.units = remaining.concat(Array.isArray(state.units) ? state.units : []);
                                }
                                flushed += units.length;
                            }
                            if ((state.units && state.units.length) || state.droppedUnits > 0) {
                                pendingDrawBitmaps.add(bitmap);
                            }
                        });
                    } finally {
                        flushingDrawUnits = false;
                    }
                    return flushed;
                }

                function flushOwnerDrawUnits(reason = 'owner-claim', targetBitmap = null) {
                    return flushPendingDrawUnits(reason, targetBitmap, {
                        maxClaimOrder: OWNER_CLAIM_MAX_ORDER,
                        unconsumedMode: DRAW_UNIT_DRAIN_PRESERVE,
                        phase: 'owner-claim',
                    });
                }

                function normalizeDrawUnitFlushOptions(options = {}) {
                    const source = options && typeof options === 'object' ? options : {};
                    const maxClaimOrder = Number(source.maxClaimOrder);
                    const terminalReason = stringify(source.terminalReason || '');
                    const requestedMode = stringify(source.unconsumedMode || '');
                    return {
                        maxClaimOrder: Number.isFinite(maxClaimOrder) ? maxClaimOrder : Infinity,
                        unconsumedMode: normalizeDrawUnitDrainMode(requestedMode, terminalReason),
                        terminalReason,
                        phase: stringify(source.phase || ''),
                        source: stringify(source.source || ''),
                    };
                }

                function normalizeDrawUnitDrainMode(value, terminalReason) {
                    const mode = stringify(value).toLowerCase();
                    if (mode === DRAW_UNIT_DRAIN_TERMINAL) return DRAW_UNIT_DRAIN_TERMINAL;
                    if (terminalReason) return DRAW_UNIT_DRAIN_TERMINAL;
                    return DRAW_UNIT_DRAIN_PRESERVE;
                }

                function createDrawUnitDispatch(bitmap, state, units, reason, droppedUnits, options = {}) {
                    const consumed = new Set();
                    const terminal = new Map();
                    return {
                        bitmap,
                        state,
                        units: units.slice(),
                        reason: stringify(reason || 'frame'),
                        phase: stringify(options.phase || ''),
                        source: stringify(options.source || ''),
                        droppedUnits: Math.max(0, Number(droppedUnits) || 0),
                        consume(unit, adapterId = '') {
                            if (!unit) return false;
                            if (terminal.has(unit)) return false;
                            consumed.add(unit);
                            try { unit.consumedBy = stringify(adapterId || 'adapter'); } catch (_) {}
                            return true;
                        },
                        isConsumed(unit) {
                            return consumed.has(unit);
                        },
                        reject(unit, reason = '', adapterId = '') {
                            if (!unit || consumed.has(unit)) return false;
                            if (terminal.has(unit)) return false;
                            const event = recordTerminalDrawUnit(unit, this, {
                                reason,
                                adapterId,
                            });
                            terminal.set(unit, event);
                            return true;
                        },
                        isTerminal(unit) {
                            return terminal.has(unit);
                        },
                        forEachUnconsumed(callback) {
                            if (typeof callback !== 'function') return 0;
                            let visited = 0;
                            units.forEach((unit) => {
                                if (consumed.has(unit) || terminal.has(unit)) return;
                                visited += 1;
                                callback(unit);
                            });
                            return visited;
                        },
                        getUnconsumedUnits() {
                            return units.filter((unit) => !consumed.has(unit) && !terminal.has(unit));
                        },
                        getTerminalEvents() {
                            return units.map((unit) => terminal.get(unit)).filter(Boolean);
                        },
                        consumedCount() {
                            return consumed.size;
                        },
                        terminalCount() {
                            return terminal.size;
                        },
                    };
                }

                function applyTerminalDrainPolicy(dispatch, options = {}) {
                    if (!dispatch || typeof dispatch.getUnconsumedUnits !== 'function') return 0;
                    if (options.unconsumedMode !== DRAW_UNIT_DRAIN_TERMINAL) return 0;
                    const reason = stringify(options.terminalReason || `${dispatch.reason || 'flush'}:unclaimed`) || 'unclaimed';
                    let rejected = 0;
                    dispatch.getUnconsumedUnits().forEach((unit) => {
                        if (dispatch.reject(unit, reason, 'draw-unit-pipeline')) rejected += 1;
                    });
                    return rejected;
                }

                function recordTerminalDrawUnit(unit, dispatch, input = {}) {
                    const event = createTerminalDrawUnitEvent(unit, dispatch, input);
                    appendTerminalDrawUnitEvent(event);
                    try {
                        unit.terminalReason = event.reason;
                        unit.terminalAdapterId = event.adapterId;
                    } catch (_) {}
                    return event;
                }

                function createTerminalDrawUnitEvent(unit, dispatch, input = {}) {
                    return {
                        type: 'draw-unit-terminal',
                        status: 'rejected',
                        reason: stringify(input.reason || 'unclaimed') || 'unclaimed',
                        adapterId: stringify(input.adapterId || 'adapter') || 'adapter',
                        flushReason: dispatch && stringify(dispatch.reason || '') || '',
                        phase: dispatch && stringify(dispatch.phase || '') || '',
                        stateId: dispatch && dispatch.state && dispatch.state.id || '',
                        unitId: unit && unit.id || '',
                        ledgerUnitId: unit && unit.ledgerUnitId || '',
                        ledgerTextRunId: unit && unit.ledgerTextRunId || '',
                        surfaceId: unit && unit.surfaceId || '',
                        surfaceRevision: unit && unit.surfaceRevision || 0,
                        methodName: unit && unit.methodName || '',
                        text: unit && unit.text || '',
                        x: unit && unit.x || 0,
                        y: unit && unit.y || 0,
                        maxWidth: unit && unit.maxWidth || 0,
                        lineHeight: unit && unit.lineHeight || 0,
                        order: unit && unit.order || 0,
                    };
                }

                function appendTerminalDrawUnitEvent(event) {
                    if (!event) return;
                    terminalDrawUnitEvents.push(event);
                    while (terminalDrawUnitEvents.length > maxTerminalDrawUnitEvents) {
                        terminalDrawUnitEvents.shift();
                    }
                    try {
                        recordTerminalDrawUnitEvent(event);
                    } catch (error) {
                        reportError('drawUnitPipeline.recordTerminalDrawUnitEvent', error);
                    }
                }

                function getTerminalDrawUnitEvents() {
                    return terminalDrawUnitEvents.map((event) => Object.assign({}, event));
                }

                function clearTerminalDrawUnitEvents() {
                    terminalDrawUnitEvents.length = 0;
                }

                function recordDrawUnitDrain(dispatch, input = {}) {
                    if (!dispatch) return null;
                    const event = createDrawUnitDrainEvent(dispatch, input);
                    appendDrawUnitDrainEvent(event);
                    return event;
                }

                function createDrawUnitDrainEvent(dispatch, input = {}) {
                    return {
                        type: 'draw-unit-drain',
                        reason: dispatch && stringify(dispatch.reason || '') || '',
                        phase: dispatch && stringify(dispatch.phase || '') || '',
                        source: dispatch && stringify(dispatch.source || '') || '',
                        stateId: dispatch && dispatch.state && dispatch.state.id || '',
                        surfaceId: getDispatchSurfaceId(dispatch),
                        unitCount: Math.max(0, Math.floor(Number(input.unitCount) || 0)),
                        droppedUnits: Math.max(0, Math.floor(Number(dispatch && dispatch.droppedUnits) || 0)),
                        consumedCount: typeof dispatch.consumedCount === 'function'
                            ? Math.max(0, Math.floor(Number(dispatch.consumedCount()) || 0))
                            : 0,
                        terminalCount: typeof dispatch.terminalCount === 'function'
                            ? Math.max(0, Math.floor(Number(dispatch.terminalCount()) || 0))
                            : 0,
                        remainingCount: Math.max(0, Math.floor(Number(input.remainingCount) || 0)),
                    };
                }

                function getDispatchSurfaceId(dispatch) {
                    if (!dispatch || !Array.isArray(dispatch.units)) return '';
                    for (const unit of dispatch.units) {
                        const surfaceId = stringify(unit && unit.surfaceId || '');
                        if (surfaceId) return surfaceId;
                    }
                    return '';
                }

                function appendDrawUnitDrainEvent(event) {
                    if (!event) return;
                    drawUnitDrainEvents.push(event);
                    while (drawUnitDrainEvents.length > maxDrawUnitDrainEvents) {
                        drawUnitDrainEvents.shift();
                    }
                    try {
                        recordDrawUnitDrainEvent(event);
                    } catch (error) {
                        reportError('drawUnitPipeline.recordDrawUnitDrainEvent', error);
                    }
                }

                function getDrawUnitDrainEvents() {
                    return drawUnitDrainEvents.map((event) => Object.assign({}, event));
                }

                function clearDrawUnitDrainEvents() {
                    drawUnitDrainEvents.length = 0;
                }

                function dispatchTextRuns(dispatch, options = {}) {
                    if (!dispatch || !dispatch.units || !dispatch.units.length || !textRunSubscribers.length) return;
                    textRunSubscribers.slice().forEach((subscription) => {
                        if (!subscription) return;
                        if (Number(subscription.claimOrder) > options.maxClaimOrder) return;
                        const runs = collectDispatchTextRuns(dispatch, subscription.runOptions);
                        if (!runs.length) return;
                        const metadata = {
                            adapterId: subscription.adapterId,
                            claimOrder: subscription.claimOrder,
                            token: subscription.token,
                            phase: options.phase || '',
                            consume(run, adapterId = subscription.adapterId) {
                                return consumeTextRun(dispatch, run, adapterId);
                            },
                            createSurfaceDrawPayload(run, overrides = {}) {
                                return createSurfaceDrawPayloadFromTextRun(dispatch, run, overrides);
                            },
                            getBackgroundPatch(run) {
                                return getTextRunBackgroundPatch(dispatch, run);
                            },
                            getBackgroundPatches(run) {
                                return getTextRunBackgroundPatches(dispatch, run);
                            },
                            reject(run, reason, adapterId = subscription.adapterId) {
                                return rejectTextRun(dispatch, run, reason, adapterId);
                            },
                        };
                        try {
                            if (subscription.onRuns) {
                                subscription.onRuns(runs, dispatch, metadata);
                            } else if (subscription.onRun) {
                                runs.forEach((run) => subscription.onRun(run, dispatch, metadata));
                            }
                        } catch (error) {
                            reportError('textRunSubscriber', error);
                        }
                    });
                }

                function consumeTextRun(dispatch, run, adapterId = '') {
                    if (!dispatch || !run || !Array.isArray(run.units) || typeof dispatch.consume !== 'function') return 0;
                    let consumed = 0;
                    runAssembler.getDrawUnitsForTextRun(dispatch, run).forEach((unit) => {
                        if (typeof dispatch.isConsumed === 'function' && dispatch.isConsumed(unit)) return;
                        if (typeof dispatch.isTerminal === 'function' && dispatch.isTerminal(unit)) return;
                        if (dispatch.consume(unit, adapterId)) consumed += 1;
                    });
                    return consumed;
                }

                function rejectTextRun(dispatch, run, reason = '', adapterId = '') {
                    if (!dispatch || !run || !Array.isArray(run.units) || typeof dispatch.reject !== 'function') return 0;
                    let rejected = 0;
                    runAssembler.getDrawUnitsForTextRun(dispatch, run).forEach((unit) => {
                        if (typeof dispatch.isConsumed === 'function' && dispatch.isConsumed(unit)) return;
                        if (typeof dispatch.isTerminal === 'function' && dispatch.isTerminal(unit)) return;
                        if (dispatch.reject(unit, reason || 'adapter-rejected', adapterId)) rejected += 1;
                    });
                    return rejected;
                }

                function createSurfaceDrawPayloadFromTextRun(dispatch, run, overrides = {}) {
                    return runAssembler.createSurfaceDrawPayloadFromDispatchRun(dispatch, run, overrides);
                }

                function getTextRunBackgroundPatch(dispatch, run) {
                    return runAssembler.getBackgroundPatchFromDispatchRun(dispatch, run);
                }

                function getTextRunBackgroundPatches(dispatch, run) {
                    return runAssembler.getBackgroundPatchesFromDispatchRun(dispatch, run);
                }

                function collectDispatchTextRuns(dispatch, options = {}) {
                    try {
                        return runAssembler.collectTextRunsFromDrawUnitDispatch(dispatch, Object.assign({}, options, {
                            reason: dispatch && dispatch.reason || '',
                        }));
                    } catch (error) {
                        reportError('runAssembler.collectTextRunsFromDrawUnitDispatch', error);
                        return [];
                    }
                }

                return freezeApi({
                    recordDraw,
                    enterDrawRunContext,
                    getActiveDrawRunContext,
                    subscribeTextRuns,
                    flushPendingDrawUnits,
                    flushOwnerDrawUnits,
                    hasPendingDrawUnits,
                    getTerminalDrawUnitEvents,
                    clearTerminalDrawUnitEvents,
                    getDrawUnitDrainEvents,
                    clearDrawUnitDrainEvents,
                });
            }

            function normalizeDrawRunContext(input = {}) {
                const source = input && typeof input === 'object' ? input : {};
                const type = stringify(source.type || source.kind || '');
                const runId = stringify(source.runId || source.id || source.normalCharacterRunId || '');
                if (!type || !runId) return null;
                const runInfo = source.runInfo && typeof source.runInfo === 'object'
                    ? Object.assign({}, source.runInfo)
                    : null;
                return {
                    type,
                    runId,
                    ownerKey: stringify(source.ownerKey || ''),
                    runInfo,
                };
            }

            function normalizeTextRunSubscriptionOptions(source = {}) {
                const runOptions = source.runOptions && typeof source.runOptions === 'object'
                    ? source.runOptions
                    : {};
                if (source.allowFallbackGlyphRuns === false || runOptions.allowFallbackGlyphRuns === false) {
                    return { allowFallbackGlyphRuns: false };
                }
                return {};
            }

            function copyDrawState(source) {
                return {
                    fontFace: source.fontFace,
                    fontSize: source.fontSize,
                    fontBold: source.fontBold,
                    fontItalic: source.fontItalic,
                    textColor: source.textColor,
                    outlineColor: source.outlineColor,
                    outlineWidth: source.outlineWidth,
                };
            }

            function createDrawRunContextSnapshot(context, fallback = {}) {
                const source = context && typeof context === 'object' ? context : {};
                const type = stringify(source.type || fallback.type || '');
                const runId = stringify(source.runId || fallback.runId || '');
                if (!type || !runId) return null;
                const runInfo = copyDrawRunInfo(source.runInfo);
                const ownerKey = stringify(source.ownerKey || runInfo.ownerKey || runInfo.windowId || runInfo.ownerId || '');
                return {
                    type,
                    runId,
                    ownerKey,
                    runInfo,
                };
            }

            function copyDrawRunInfo(value) {
                if (!value || typeof value !== 'object') return {};
                const output = {};
                [
                    'runId',
                    'text',
                    'x',
                    'y',
                    'maxWidth',
                    'lineHeight',
                    'align',
                    'ownerKey',
                    'ownerId',
                    'windowId',
                    'surfaceId',
                    'slotKey',
                ].forEach((key) => {
                    const item = value[key];
                    if (item === null || ['string', 'number', 'boolean'].indexOf(typeof item) >= 0) {
                        output[key] = item;
                    }
                });
                return output;
            }

            function canStoreWeakState(value) {
                const type = typeof value;
                return value !== null && (type === 'object' || type === 'function');
            }

            function stringify(value) {
                try { return String(value ?? ''); } catch (_) { return ''; }
            }

            function finiteNumber(value, fallback) {
                const numeric = Number(value);
                return Number.isFinite(numeric) ? numeric : fallback;
            }

            function normalizeTextRunClaimOrder(value, fallback) {
                const numeric = Number(value);
                return Number.isFinite(numeric) ? Math.max(0, Math.round(numeric)) : fallback;
            }

            function positiveNumber(...values) {
                for (const value of values) {
                    const numeric = Number(value);
                    if (Number.isFinite(numeric) && numeric > 0) return numeric;
                }
                return 1;
            }

            function nonNegativeNumber(value, fallback) {
                const numeric = Number(value);
                return Number.isFinite(numeric) && numeric >= 0 ? numeric : fallback;
            }

            function readPositiveInteger(value, fallback) {
                const numeric = Number(value);
                return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : fallback;
            }

            function normalizeCanvasTextAlign(align) {
                const value = stringify(align).toLowerCase();
                return ['left', 'right', 'center', 'start', 'end'].indexOf(value) >= 0 ? value : 'left';
            }

            function freezeApi(api) {
                try { return Object.freeze(api); } catch (_) { return api; }
            }

            return freezeApi({
                createDrawUnitPipeline,
            });
        },
    });
})();
