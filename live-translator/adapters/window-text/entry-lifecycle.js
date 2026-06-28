// Window text adapter support: entry lifecycle.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'adapters.windowText.entryLifecycle',
        requires: {
            renderTransaction: 'runtime.renderTransaction',
            bitmapRenderPlannerModule: 'runtime.bitmap.renderPlanner',
        },
        factory({ renderTransaction, bitmapRenderPlannerModule }) {

    function createEntryLifecycleController(context = {}) {
    const { telemetry, pruneDetachedRegisteredWindows, generateKey, entriesByRecordId, detachedEntriesByRecordId, ADAPTER_ID, DETACHED_ENTRY_LIMIT, entryLifecycleState } = context;
    const { lifecycle: lifecycleService, surface: surfaceService, replay: replayService } = context.services;
    const { bitmapReplay, entryRecords, renderCompletion, textMetrics } = context.facades;
    const { getEntryStatus, isEntryActive, forgetEntrySourceRun } = entryRecords;
    const { updateOrchestratorItem, rejectPendingRender } = renderCompletion;
    const { estimateEntryBounds, createSlotKey, getWindowTypeName } = textMetrics;
    const { materializeCopiedRenderTargetsForEntry, isWindowRedrawClearActive } = bitmapReplay;
    const bitmapRenderPlanner = context.bitmapRenderPlanner
        && typeof context.bitmapRenderPlanner.createWindowSourceEntryCopiedTargetRecoveryPlan === 'function'
        ? context.bitmapRenderPlanner
        : bitmapRenderPlannerModule.create();
    const RETIRE_MATCH_EXACT_SLOT = 'exact-slot';
    const RETIRE_MATCH_REPLACEMENT_DRAW = 'replacement-draw';
    let nextLifecycleRecoveryPlanId = 0;

    function createLifecycleRecoveryPlanId() {
                return `window-lifecycle-plan-${(++nextLifecycleRecoveryPlanId).toString(36)}`;
            }

    function findExistingEntry(windowData, type, rawText, convertedTrimmed, x, y, params = null) {
                if (!windowData || !windowData.texts) return null;
                const slotKey = createSlotKey(type, x, y, params);
                const key = generateKey(type, x, y, windowData.windowType, convertedTrimmed, slotKey);
                const entry = windowData.texts.get(key);
                if (!entry || entryLifecycleState.isStale(entry)) return null;
                if ((entry.slotKey || createSlotKey(entry.type, entry.position && entry.position.x, entry.position && entry.position.y, entry.originalParams)) !== slotKey) {
                    return null;
                }
                return entry.rawText === rawText && entry.convertedText === convertedTrimmed ? entry : null;
            }
    
    // Retire by the proof the caller actually has. Empty, missing, or
    // non-renderable draws only clear one exact slot. A visible replacement draw
    // may legitimately change width while still owning the same anchor.
    function retireEntriesInExactSlot(windowData, type, x, y, exceptEntry = null, reason = 'window-entry-replaced', params = null) {
                return retireMatchingEntries(windowData, type, x, y, exceptEntry, reason, params, RETIRE_MATCH_EXACT_SLOT);
            }

    function retireEntriesForReplacementDraw(windowData, type, x, y, exceptEntry = null, reason = 'window-entry-replaced', params = null) {
                return retireMatchingEntries(windowData, type, x, y, exceptEntry, reason, params, RETIRE_MATCH_REPLACEMENT_DRAW);
            }

    function retireMatchingEntries(windowData, type, x, y, exceptEntry = null, reason = 'window-entry-replaced', params = null, matchMode = RETIRE_MATCH_EXACT_SLOT) {
                if (!windowData || !windowData.texts || typeof windowData.texts.forEach !== 'function') return 0;
                const stale = [];
                const slotKey = createSlotKey(type, x, y, params);
                const replacementDraw = matchMode === RETIRE_MATCH_REPLACEMENT_DRAW;
                try {
                    windowData.texts.forEach((entry, key) => {
                        if (!entry || entryLifecycleState.isStale(entry)) return;
                        if (exceptEntry && entry === exceptEntry) return;
                        const entrySlotKey = entry.slotKey
                            || createSlotKey(entry.type, entry.position && entry.position.x, entry.position && entry.position.y, entry.originalParams);
                        if (entrySlotKey === slotKey
                            || (replacementDraw && isSameWindowReplacementAnchor(entry, type, x, y, params))) {
                            stale.push({ entry, key });
                        }
                    });
                } catch (_) {}
                stale.forEach(({ entry, key }) => {
                    if (shouldDeferWindowEntryReplacement(windowData, entry)) {
                        markEntryPendingStale(windowData, entry, reason);
                    } else {
                        markEntryStale(windowData, key, entry, reason);
                    }
                });
                return stale.length;
            }

    // A visible replacement draw is stronger proof than an empty, offscreen, or
    // measurement draw. Width may change when a plugin recomputes a label, but
    // the same method/anchor/alignment still means the new label owns the slot.
    function isSameWindowReplacementAnchor(entry, type, x, y, params = null) {
                if (!entry || !isWindowOriginEntry(entry) || !isWindowOriginParams(params)) return false;
                if (String(entry.type || '') !== String(type || '')) return false;
                if (!sameReplacementCoordinate(entry.position && entry.position.x, x)) return false;
                if (!sameReplacementCoordinate(entry.position && entry.position.y, y)) return false;
                return normalizeReplacementAlign(entry.originalParams) === normalizeReplacementAlign(params);
            }

    function isWindowOriginEntry(entry) {
                const origin = entry && entry.drawOrigin && typeof entry.drawOrigin === 'object'
                    ? entry.drawOrigin
                    : null;
                return !origin || !origin.type || origin.type === 'window';
            }

    function isWindowOriginParams(params) {
                const origin = params && params.drawOrigin && typeof params.drawOrigin === 'object'
                    ? params.drawOrigin
                    : null;
                return !origin || !origin.type || origin.type === 'window';
            }

    function sameReplacementCoordinate(left, right) {
                const leftNumber = Number(left);
                const rightNumber = Number(right);
                if (!Number.isFinite(leftNumber) || !Number.isFinite(rightNumber)) return String(left || '') === String(right || '');
                return Math.round(leftNumber * 1000) === Math.round(rightNumber * 1000);
            }

    function normalizeReplacementAlign(params) {
                const align = params && Object.prototype.hasOwnProperty.call(params, 'align')
                    ? String(params.align || '').trim().toLowerCase()
                    : '';
                return align || 'left';
            }

    function shouldDeferWindowEntryReplacement(windowData, entry) {
                const ownerWindow = entry && entry.ownerWindow;
                return isRefreshActiveForWindow(ownerWindow, windowData);
            }

    function markEntryPendingStale(windowData, entry, reason) {
                if (!entry || entryLifecycleState.isStale(entry)) return;
                const at = Date.now();
                entryLifecycleState.markPendingInvalidation(entry, 'window-entry-stale', {
                    sourceReason: reason || 'window-entry-replaced',
                    at,
                    contentsRevision: windowData && Number.isFinite(Number(windowData.contentsRevision))
                        ? Number(windowData.contentsRevision)
                        : 0,
                });
            }
    
    function markEntryStale(windowData, key, entry, reason = 'window-entry-stale') {
                if (!entry) return;
                rejectPendingRender(entry, reason, {
                    key: String(key || ''),
                    windowType: windowData && windowData.windowType ? windowData.windowType : '',
                });
                entryLifecycleState.markStale(entry, reason, {
                    surfaceVisible: false,
                    screenState: 'hidden',
                });
                forgetEntrySourceRunIfAvailable(entry);
                forgetEntryRecord(entry, reason, {
                    key: String(key || ''),
                    windowType: windowData && windowData.windowType ? windowData.windowType : '',
                });
                if (windowData && windowData.texts) {
                    try { windowData.texts.delete(key); } catch (_) {}
                }
                if (windowData && windowData.renderReadinessSchedule) {
                    try { windowData.renderReadinessSchedule.delete(key); } catch (_) {}
                }
                markRecordDisappeared(entry, reason, {
                    key: String(key || ''),
                    windowType: windowData && windowData.windowType ? windowData.windowType : '',
                });
            }

    function rememberDetachedEntry(entry, reason = 'window-entry-detached', details = null) {
                if (!entry || !entry.recordId || !detachedEntriesByRecordId) return false;
                if (!entry.normalizedSource && !entry.translationSource) return false;
                const recordId = String(entry.recordId || '');
                if (!recordId) return false;
                entryLifecycleState.markDetached(entry, reason || entryLifecycleState.getCanceledReason(entry) || 'window-entry-detached', details);
                try {
                    detachedEntriesByRecordId.delete(recordId);
                    detachedEntriesByRecordId.set(recordId, entry);
                    pruneDetachedEntries();
                    return true;
                } catch (_) {
                    return false;
                }
            }

    function takeDetachedEntry(recordOrId) {
                if (!detachedEntriesByRecordId) return null;
                const recordId = typeof recordOrId === 'string'
                    ? recordOrId
                    : String(recordOrId && recordOrId.recordId || '');
                if (!recordId) return null;
                try {
                    const entry = detachedEntriesByRecordId.get(recordId) || null;
                    if (entry) detachedEntriesByRecordId.delete(recordId);
                    return entry;
                } catch (_) {
                    return null;
                }
            }

    function peekDetachedEntry(recordOrId) {
                if (!detachedEntriesByRecordId) return null;
                const recordId = typeof recordOrId === 'string'
                    ? recordOrId
                    : String(recordOrId && recordOrId.recordId || '');
                if (!recordId) return null;
                try {
                    return detachedEntriesByRecordId.get(recordId) || null;
                } catch (_) {
                    return null;
                }
            }

    function pruneDetachedEntries() {
                if (!detachedEntriesByRecordId || typeof detachedEntriesByRecordId.size !== 'number') return;
                const limit = Number.isFinite(Number(DETACHED_ENTRY_LIMIT)) && Number(DETACHED_ENTRY_LIMIT) > 0
                    ? Math.floor(Number(DETACHED_ENTRY_LIMIT))
                    : 256;
                while (detachedEntriesByRecordId.size > limit) {
                    const first = detachedEntriesByRecordId.keys().next();
                    if (!first || first.done) break;
                    detachedEntriesByRecordId.delete(first.value);
                }
            }

    function forgetEntryRecord(entry, reason = 'window-entry-detached', details = null) {
                if (!entry || !entry.recordId || !entriesByRecordId) return false;
                try {
                    const current = entriesByRecordId.get(entry.recordId);
                    if (current !== entry) {
                        return shouldRememberDetachedEntryWithoutActiveRecord(details)
                            ? rememberDetachedEntry(entry, reason, details)
                            : false;
                    }
                    rememberDetachedEntry(entry, reason, details);
                    return entriesByRecordId.delete(entry.recordId) === true;
                } catch (_) {
                    return false;
                }
            }

    function shouldRememberDetachedEntryWithoutActiveRecord(details) {
                if (!details || typeof details !== 'object') return false;
                if (details.allowDetachedReattach === true) return true;
                const plan = details.detachedRecoveryPlan && typeof details.detachedRecoveryPlan === 'object'
                    ? details.detachedRecoveryPlan
                    : null;
                return !!(plan && plan.status === 'planned');
            }
    
    function cancelEntryTranslation(entry, reason = 'window-entry-stale') {
                let canceled = false;
                if (isEntryActive(entry)) {
                    const result = lifecycleService.cancelItemTranslation(entry, reason);
                    canceled = !!(result && result.changed === true);
                }
                return canceled;
            }
    
    function markRecordDisappeared(entry, reason, details = null) {
                if (!isEntryActive(entry)) return;
                forgetEntrySourceRunIfAvailable(entry);
                rejectPendingRender(entry, reason || 'window-entry-disappeared', details);
                lifecycleService.retireItem(entry, 'disappeared', {
                    eventType: 'item.disappeared',
                    message: reason || '',
                    details,
                });
                entryLifecycleState.setSurfaceVisible(entry, false, {
                    reason: reason || 'window-entry-disappeared',
                    screenState: 'hidden',
                });
            }

    function forgetEntrySourceRunIfAvailable(entry) {
                if (typeof forgetEntrySourceRun !== 'function') return false;
                try {
                    return forgetEntrySourceRun(entry) === true;
                } catch (_) {
                    return false;
                }
            }
    
    function recordDecision(entry, type, message = '', details = null) {
                lifecycleService.recordDecision(entry, type, message, details);
            }
    
    function scheduleRenderRetry(targetWindow, windowData, entry, key, plan = null) {
                if (!windowData) return;
                if (!windowData.renderReadinessSchedule) windowData.renderReadinessSchedule = new Map();
                const queueKey = key || getTextEntryKey(windowData, entry);
                if (!queueKey) return;
                const record = createRenderReadinessScheduleRecord(targetWindow, windowData, entry, queueKey, plan);
                if (!record || !record.commandId) {
                    recordDecision(entry, 'draw.queue_rejected', 'render command id required', {
                        windowType: getWindowTypeName(targetWindow, windowData),
                        queue: plan && plan.queue ? String(plan.queue) : '',
                        reason: plan && plan.reason ? String(plan.reason) : 'window-redraw-deferred',
                        key: queueKey,
                    });
                    return false;
                }
                windowData.renderReadinessSchedule.set(queueKey, record);
                if (entry._queueLogged) return true;
                // The adapter schedules a readiness wakeup, but snapshots
                // still consume the stable draw.queued diagnostic event.
                telemetry.logDraw('queue', entry.renderedText || entry.convertedText, entry.position.x, entry.position.y, {
                    windowType: getWindowTypeName(targetWindow, windowData),
                });
                recordDecision(entry, 'draw.queued', 'window redraw queued', {
                    windowType: getWindowTypeName(targetWindow, windowData),
                    queue: plan && plan.queue ? String(plan.queue) : '',
                    reason: plan && plan.reason ? String(plan.reason) : '',
                });
                entry._queueLogged = true;
                return true;
            }

    function createRenderReadinessScheduleRecord(targetWindow, windowData, entry, key, plan = null) {
                const pending = entry && entry.renderTransaction;
                const refreshObservation = entry
                    && entry.renderLifecycle
                    && entry.renderLifecycle.refreshObservation;
                const commandId = pending && pending.commandId ? String(pending.commandId) : '';
                if (!commandId) return null;
                return {
                    type: 'render-command',
                    key: String(key || ''),
                    entry,
                    queue: plan && plan.queue ? String(plan.queue) : 'on-update-ready',
                    reason: plan && plan.reason ? String(plan.reason) : 'window-redraw-deferred',
                    commandId,
                    commandGeneration: Number(pending && pending.commandGeneration) || 0,
                    entryGeneration: Number(entry && entry.surfaceRevision) || 0,
                    refreshToken: Number(refreshObservation && refreshObservation.token) || 0,
                    refreshObserved: refreshObservation && refreshObservation.active === true,
                    contentsRevision: Number(windowData && windowData.contentsRevision) || 0,
                    windowType: getWindowTypeName(targetWindow, windowData),
                    queuedAt: Date.now(),
                };
            }
    
    function clearPendingInvalidation(entry) {
                return entryLifecycleState.clearPendingInvalidation(entry);
            }
    
    function getCurrentEntry(windowData, entry) {
                const key = entry && (entry.key || getTextEntryKey(windowData, entry));
                return key && windowData && windowData.texts ? windowData.texts.get(key) : null;
            }
    
    function getTextEntryKey(windowData, entry) {
                if (!windowData || !entry) return null;
                return generateKey(
                    entry.type,
                    entry.position && entry.position.x,
                    entry.position && entry.position.y,
                    windowData.windowType,
                    entry.convertedText,
                    entry.slotKey || createSlotKey(entry.type, entry.position && entry.position.x, entry.position && entry.position.y, entry.originalParams)
                );
            }
    
    function dropScheduledRenderRetry(windowData, entry, key = null) {
                if (!windowData || !windowData.renderReadinessSchedule) return;
                const textKey = key || getTextEntryKey(windowData, entry);
                if (textKey) {
                    try { windowData.renderReadinessSchedule.delete(textKey); } catch (_) {}
                }
                if (entry) entry._queueLogged = false;
            }

    function invalidateEntriesForBitmapMutation(bitmap, rect = null, reason = 'bitmap-mutation', options = {}) {
                if (!bitmap || isWindowRedrawClearActive(bitmap)) return 0;
                if (options && options.skipEntryInvalidation) return 0;
                const match = surfaceService.resolveWindowSurfaceForContents(bitmap);
                const owner = match && (match.owner || match.windowInstance);
                const windowData = match && match.windowData;
                if (!windowData || !windowData.texts || typeof windowData.texts.forEach !== 'function') return 0;

                const targetRect = cloneMutationRect(rect);
                const deferUntilRefreshEnds = isWindowRefreshMutation(owner, bitmap, windowData);
                const removed = [];
                windowData.texts.forEach((entry, key) => {
                    if (!entry || !surfaceService.windowEntryBelongsToContents(entry, bitmap, owner, windowData)) return;
                    const entryRect = deriveMutationEntryRect(entry);
                    if (targetRect && entryRect && !rectanglesOverlap(targetRect, entryRect)) return;
                    if (deferUntilRefreshEnds && wasEntryObservedInCurrentRefresh(entry, owner, windowData)) return;
                    const screenState = getWindowOwnerScreenState(owner, windowData);
                    const recoveryPlan = planDetachedWindowEntryRecoveryAfterMutation(entry, {
                        methodName: reason,
                        screenState,
                    });
                    const allowDetachedReattach = recoveryPlan && recoveryPlan.status === 'planned';
                    if (allowDetachedReattach && canRetargetDetachedWindowEntryAfterSelfBlt(entryRect, bitmap, targetRect, {
                        sourceBitmap: options && options.sourceBitmap ? options.sourceBitmap : null,
                        sourceRect: options && options.sourceRect ? options.sourceRect : null,
                    })) {
                        retargetDetachedWindowEntryForSelfBlt(entry, entryRect, options.sourceRect, targetRect);
                    }
                    removed.push({
                        key,
                        entry,
                        allowDetachedReattach,
                        detachedRecoveryPlan: recoveryPlan && recoveryPlan.diagnostics || null,
                    });
                });

                removed.forEach(({ key, entry, allowDetachedReattach, detachedRecoveryPlan }) => {
                    const sourceReason = `${reason || 'bitmap'}-contents`;
                    if (deferUntilRefreshEnds) {
                        entryLifecycleState.markPendingInvalidation(entry, 'window-entry-stale', {
                            sourceReason,
                            at: Date.now(),
                            contentsRevision: Number(windowData && windowData.contentsRevision) || 0,
                        });
                    } else {
                        const screenState = getWindowOwnerScreenState(owner, windowData);
                        entryLifecycleState.markStale(entry, sourceReason, {
                            surfaceVisible: false,
                            screenState: 'hidden',
                        });
                        forgetEntrySourceRunIfAvailable(entry);
                        if (entry.recordId) {
                            retireWindowEntryForBitmapMutation(entry, sourceReason, {
                                windowType: describeWindowOwnerType(owner, bitmap, windowData),
                                screenState,
                                allowDetachedReattach: allowDetachedReattach === true,
                                detachedRecoveryPlan,
                            });
                        }
                        try { windowData.texts.delete(key); } catch (_) {}
                    }
                    if (windowData.renderReadinessSchedule && typeof windowData.renderReadinessSchedule.delete === 'function') {
                        try { windowData.renderReadinessSchedule.delete(key); } catch (_) {}
                    }
                });
                if (removed.length) windowData.contentsRevision = (windowData.contentsRevision || 0) + 1;
                return removed.length;
            }

    function retireWindowEntryForBitmapMutation(entry, reason, details = null) {
                if (!entry || !entry.recordId) return false;
                const surfaceInvalidated = reason === 'clear-contents' || reason === 'clearRect-contents';
                const eventDetails = Object.assign({}, details || {});
                if (surfaceInvalidated) {
                    eventDetails.surfaceInvalidated = true;
                    eventDetails.translationPreserved = true;
                }
                const unresolvedCommands = getUnresolvedRenderCommandsForEntry(entry);
                if (unresolvedCommands.length) {
                    const renderOutcome = surfaceInvalidated
                        ? 'aborted-by-surface-invalidation'
                        : 'aborted-by-bitmap-invalidation';
                    eventDetails.renderOutcome = renderOutcome;
                    eventDetails.renderCommandRecovery = Object.freeze({
                        outcome: renderOutcome,
                        terminal: true,
                        commandIds: unresolvedCommands.map(getRenderCommandId).filter(Boolean),
                    });
                    eventDetails.unresolvedRenderCommands = unresolvedCommands.map(summarizeRenderCommandForInvalidation);
                    rejectUnresolvedRenderCommandsForInvalidation(entry, unresolvedCommands, renderOutcome, eventDetails);
                }
                lifecycleService.retireItem(entry, 'disappeared', {
                    eventType: surfaceInvalidated ? 'item.surface_invalidated' : 'item.disappeared',
                    message: reason || '',
                    recordDetached: shouldRememberDetachedEntryWithoutActiveRecord(eventDetails),
                    details: eventDetails,
                });
                return forgetEntryRecord(entry, reason, eventDetails);
            }

    function getUnresolvedRenderCommandsForEntry(entry) {
                if (!entry || !entry.recordId || !lifecycleService
                    || typeof lifecycleService.getUnresolvedRenderCommandsForItem !== 'function') {
                    return [];
                }
                const commands = lifecycleService.getUnresolvedRenderCommandsForItem(entry);
                return Array.isArray(commands) ? commands.filter(Boolean) : [];
            }

    function rejectUnresolvedRenderCommandsForInvalidation(entry, commands, reason, details = null) {
                if (!entry || !Array.isArray(commands) || !commands.length) return 0;
                const pending = entry.renderTransaction || null;
                const pendingCommandId = pending && pending.commandId ? String(pending.commandId) : '';
                let rejected = 0;
                if (pendingCommandId && commands.some((command) => getRenderCommandId(command) === pendingCommandId)) {
                    const result = rejectPendingRender(entry, reason, details);
                    if (result && result.handled === true) rejected += 1;
                }
                if (!lifecycleService || typeof lifecycleService.recordRenderRejected !== 'function') return rejected;
                commands.forEach((command) => {
                    const commandId = getRenderCommandId(command);
                    if (!commandId || commandId === pendingCommandId) return;
                    lifecycleService.recordRenderRejected(entry, {
                        commandId,
                        strategy: String(command && command.strategy || 'windowTextRedraw'),
                        commandGeneration: Number(command && (command.generation || command.commandGeneration)) || 0,
                        reason,
                        details: Object.assign({}, details || {}, {
                            commandStatus: String(command && command.status || ''),
                            commandRetryCount: Number(command && command.retryCount) || 0,
                        }),
                    });
                    rejected += 1;
                });
                return rejected;
            }

    function summarizeRenderCommandForInvalidation(command) {
                return {
                    commandId: getRenderCommandId(command),
                    status: String(command && command.status || ''),
                    strategy: String(command && command.strategy || ''),
                    generation: Number(command && (command.generation || command.commandGeneration)) || 0,
                    targetSurfaceId: String(command && command.targetSurfaceId || ''),
                };
            }

    function getRenderCommandId(command) {
                return String(command && (command.commandId || command.id) || '');
            }

    function canRecoverDetachedWindowEntryAfterMutation(entry, options = {}) {
                const plan = planDetachedWindowEntryRecoveryAfterMutation(entry, options);
                return !!(plan && plan.status === 'planned');
            }

    function planDetachedWindowEntryRecoveryAfterMutation(entry, options = {}) {
                const method = String(options && options.methodName || options && options.reason || '');
                if (!isPendingWindowEntryTranslation(entry)) return rejectCopiedTargetReadinessPlan(entry, 'not-pending-translation');
                if (method === 'blt') return createSelfBltRetargetReadinessPlan(entry);
                if (!isCopiedSourceInvalidationMethod(method)) return rejectCopiedTargetReadinessPlan(entry, 'not-copied-source-invalidation');
                const screenState = String(options && options.screenState || '');
                const readinessPlan = createCopiedTargetRecoveryPlan(entry, {
                    pendingInvalidation: true,
                    screenState,
                });
                if (!readinessPlan || readinessPlan.status !== 'planned') return readinessPlan;
                if (screenState === 'visible') return rejectCopiedTargetReadinessPlan(entry, 'window-visible');
                return readinessPlan;
            }

    function createSelfBltRetargetReadinessPlan(entry) {
                const plan = {
                    planId: createLifecycleRecoveryPlanId(),
                    type: 'windowSelfBltRetargetReadiness',
                    status: 'planned',
                    reason: '',
                    entry,
                    copiedTargets: 0,
                    hasCopiedTargets: false,
                    steps: {
                        retargetDetachedEntry: true,
                    },
                    proof: {
                        pendingTranslation: true,
                    },
                };
                plan.diagnostics = createLifecycleRecoveryDiagnostics(plan);
                return plan;
            }

    function isPendingWindowEntryTranslation(entry) {
                return !!(entry
                    && lifecycleService
                    && typeof lifecycleService.isRecordRequestActive === 'function'
                    && lifecycleService.isRecordRequestActive(entry));
            }

    function isCopiedSourceInvalidationMethod(methodName) {
                switch (String(methodName || '')) {
                case 'clear':
                case 'clearRect':
                case 'resize':
                case 'fillRect':
                case 'fillAll':
                case 'gradientFillRect':
                case 'strokeRect':
                case 'drawCircle':
                case 'adjustTone':
                case 'rotateHue':
                case 'blur':
                    return true;
                default:
                    return false;
                }
            }

    function createCopiedTargetRecoveryPlan(entry, options = {}) {
                return bitmapRenderPlanner.createWindowSourceEntryCopiedTargetRecoveryPlan({
                    entry,
                    collectProjectedTargets: materializeCopiedRenderTargetsForEntry,
                    pendingInvalidation: options && options.pendingInvalidation === true,
                    screenState: options && options.screenState || '',
                });
            }

    function rejectCopiedTargetReadinessPlan(entry, reason) {
                const plan = {
                    planId: createLifecycleRecoveryPlanId(),
                    type: 'windowCopiedTargetRecovery',
                    status: 'rejected',
                    reason: reason || 'rejected',
                    materializedTargets: [],
                    entry,
                    copiedTargets: 0,
                    hasCopiedTargets: false,
                    steps: {},
                    proof: {},
                };
                plan.diagnostics = createLifecycleRecoveryDiagnostics(plan);
                return plan;
            }

    function createLifecycleRecoveryDiagnostics(plan) {
                if (!plan) return null;
                return {
                    planId: plan.planId || '',
                    type: plan.type || '',
                    status: plan.status || '',
                    reason: plan.reason || '',
                    copiedTargets: Number(plan.copiedTargets) || 0,
                    materializedTargets: Array.isArray(plan.materializedTargets) ? plan.materializedTargets.length : 0,
                    hasCopiedTargets: plan.hasCopiedTargets === true,
                    steps: {
                        acceptPendingInvalidation: plan.steps && plan.steps.acceptPendingInvalidation === true,
                        keepDetachedTranslation: plan.steps && plan.steps.keepDetachedTranslation === true,
                        retargetDetachedEntry: plan.steps && plan.steps.retargetDetachedEntry === true,
                    },
                    proof: {
                        requiresCopiedTarget: plan.proof && plan.proof.requiresCopiedTarget === true,
                        sourceContentsRole: plan.proof && plan.proof.sourceContentsRole || '',
                        pendingInvalidation: plan.proof && plan.proof.pendingInvalidation === true,
                        pendingTranslation: plan.proof && plan.proof.pendingTranslation === true,
                        screenState: plan.proof && plan.proof.screenState || '',
                    },
                };
            }

    function canRetargetDetachedWindowEntryAfterSelfBlt(entryRect, bitmap, targetRect, options = {}) {
                const sourceBitmap = options && options.sourceBitmap ? options.sourceBitmap : null;
                const sourceRect = options && cloneMutationRect(options.sourceRect);
                if (!sourceBitmap || sourceBitmap !== bitmap || !rectHasArea(sourceRect)) return false;
                if (!rectHasArea(targetRect) || !rectHasArea(entryRect)) return false;
                const clippedEntryRect = clipRectToBitmap(entryRect, bitmap);
                if (!clippedEntryRect) return false;
                const sourceWidth = Number(sourceRect.x2) - Number(sourceRect.x1);
                const sourceHeight = Number(sourceRect.y2) - Number(sourceRect.y1);
                const targetWidth = Number(targetRect.x2) - Number(targetRect.x1);
                const targetHeight = Number(targetRect.y2) - Number(targetRect.y1);
                if (sourceWidth !== targetWidth || sourceHeight !== targetHeight) return false;
                return rectanglesOverlap(sourceRect, clippedEntryRect);
            }

    function retargetDetachedWindowEntryForSelfBlt(entry, entryRect, sourceRect, targetRect) {
                const source = cloneMutationRect(sourceRect);
                const target = cloneMutationRect(targetRect);
                if (!entry || !rectHasArea(entryRect) || !rectHasArea(source) || !rectHasArea(target)) return false;
                const deltaX = Number(target.x1) - Number(source.x1);
                const deltaY = Number(target.y1) - Number(source.y1);
                if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY)) return false;
                const position = entry.position && typeof entry.position === 'object'
                    ? entry.position
                    : { x: 0, y: 0 };
                entry.position = {
                    x: finiteNumber(position.x, 0) + deltaX,
                    y: finiteNumber(position.y, 0) + deltaY,
                };
                entry.bounds = {
                    x1: Number(entryRect.x1) + deltaX,
                    y1: Number(entryRect.y1) + deltaY,
                    x2: Number(entryRect.x2) + deltaX,
                    y2: Number(entryRect.y2) + deltaY,
                };
                delete entry.key;
                delete entry.slotKey;
                return true;
            }

    function wasEntryObservedInCurrentRefresh(entry, owner, windowData) {
                return !!(lifecycleService
                    && typeof lifecycleService.wasEntryObservedInRefresh === 'function'
                    && lifecycleService.wasEntryObservedInRefresh(entry, owner, windowData));
            }

    function isWindowRefreshMutation(owner, bitmap, windowData) {
                return isRefreshActiveForWindow(owner, windowData);
            }

    function isRefreshActiveForWindow(owner, windowData) {
                if (lifecycleService && typeof lifecycleService.getRefreshState === 'function') {
                    const refreshState = lifecycleService.getRefreshState(owner, windowData);
                    if (refreshState && refreshState.active === true) return true;
                }
                return false;
            }

    function deriveMutationEntryRect(entry) {
                if (!entry) return null;
                if (rectHasArea(entry.renderedBounds)) return cloneMutationRect(entry.renderedBounds);
                if (rectHasArea(entry.bounds)) return cloneMutationRect(entry.bounds);
                const x = finiteNumber(entry.position && entry.position.x, 0);
                const y = finiteNumber(entry.position && entry.position.y, 0);
                const params = entry.originalParams || {};
                const width = positiveNumber(params.maxWidth, String(entry.visibleText || entry.rawText || '').length * 12, 1);
                const height = positiveNumber(params.lineHeight, 24);
                return rectFromDimensions(x, y, width, height);
            }

    function describeWindowOwnerType(owner, bitmap, windowData) {
                const windowType = windowData && windowData.windowType ? String(windowData.windowType) : '';
                if (windowType) return windowType;
                if (owner) return 'window';
                if (bitmap) return 'bitmap';
                return 'surface';
            }

    function clipRectToBitmap(rect, bitmap) {
                if (!rectHasArea(rect) || !bitmap) return null;
                const bitmapRect = rectFromDimensions(0, 0, bitmap.width, bitmap.height);
                const clipped = {
                    x1: Math.max(Number(rect.x1), Number(bitmapRect.x1)),
                    y1: Math.max(Number(rect.y1), Number(bitmapRect.y1)),
                    x2: Math.min(Number(rect.x2), Number(bitmapRect.x2)),
                    y2: Math.min(Number(rect.y2), Number(bitmapRect.y2)),
                };
                return rectHasArea(clipped) ? clipped : null;
            }

    function rectFromDimensions(x, y, width, height) {
                const x1 = finiteNumber(x, 0);
                const y1 = finiteNumber(y, 0);
                const x2 = x1 + finiteNumber(width, 0);
                const y2 = y1 + finiteNumber(height, 0);
                return {
                    x1: Math.min(x1, x2),
                    y1: Math.min(y1, y2),
                    x2: Math.max(x1, x2),
                    y2: Math.max(y1, y2),
                };
            }

    function cloneMutationRect(rect) {
                if (!rect || typeof rect !== 'object') return null;
                const x1 = finiteNumber(rect.x1, NaN);
                const y1 = finiteNumber(rect.y1, NaN);
                const x2 = finiteNumber(rect.x2, NaN);
                const y2 = finiteNumber(rect.y2, NaN);
                if (![x1, y1, x2, y2].every(Number.isFinite)) return null;
                return {
                    x1: Math.min(x1, x2),
                    y1: Math.min(y1, y2),
                    x2: Math.max(x1, x2),
                    y2: Math.max(y1, y2),
                };
            }

    function rectHasArea(rect) {
                return !!(rect
                    && Number.isFinite(Number(rect.x1))
                    && Number.isFinite(Number(rect.y1))
                    && Number.isFinite(Number(rect.x2))
                    && Number.isFinite(Number(rect.y2))
                    && Number(rect.x2) > Number(rect.x1)
                    && Number(rect.y2) > Number(rect.y1));
            }

    function rectanglesOverlap(a, b) {
                if (!rectHasArea(a) || !rectHasArea(b)) return false;
                return Number(a.x1) < Number(b.x2)
                    && Number(a.x2) > Number(b.x1)
                    && Number(a.y1) < Number(b.y2)
                    && Number(a.y2) > Number(b.y1);
            }

    function getWindowOwnerScreenState(owner, windowData) {
                if (!owner) return 'removed';
                if (owner.visible === false) return 'hidden';
                const openness = Number(owner.openness);
                const hasOpenArea = Number.isFinite(openness)
                    ? openness > 0
                    : (typeof owner.isOpen === 'function' ? owner.isOpen() : true);
                const contentsOpacity = Number(owner.contentsOpacity);
                const textOpacityVisible = !Number.isFinite(contentsOpacity) || contentsOpacity > 0;
                const isOpenState = windowData && Object.prototype.hasOwnProperty.call(windowData, 'isOpen')
                    ? windowData.isOpen !== false
                    : true;
                if (!hasOpenArea || !isOpenState) return 'closed';
                if (!textOpacityVisible) return 'transparent';
                return 'visible';
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

    function beginEntryNativeSourceDraw(entry, reason = 'native-source-draw') {
                if (!entry || entry.skipReason || !entry.translationSource) {
                    return createSourceDrawTransitionResult('ignored', 'source-draw-not-trackable', null, entry);
                }
                const lifecycle = ensureEntryRenderLifecycle(entry);
                const originBoundary = entry.drawOrigin
                    && entry.drawOrigin.drawBoundary
                    && typeof entry.drawOrigin.drawBoundary === 'object'
                    ? entry.drawOrigin.drawBoundary
                    : null;
                const transition = renderTransaction.observeSourceDraw(Object.assign({}, originBoundary || {}, {
                    adapterId: originBoundary && originBoundary.adapterId ? originBoundary.adapterId : ADAPTER_ID,
                    itemId: entry.recordId || (originBoundary && originBoundary.itemId) || '',
                    recordId: entry.recordId || (originBoundary && originBoundary.recordId) || '',
                    surfaceId: entry.surfaceId || (originBoundary && originBoundary.surfaceId) || '',
                    identitySurfaceId: entry.identitySurfaceId || (originBoundary && originBoundary.identitySurfaceId) || '',
                    slotKey: entry.slotKey || (originBoundary && originBoundary.slotKey) || '',
                    generation: Number(entry.surfaceRevision) || Number(originBoundary && originBoundary.generation) || 0,
                    reason: String(reason || 'native-source-draw'),
                    details: Object.assign({}, originBoundary && originBoundary.details || {}, {
                        method: entry.type || '',
                    }),
                }));
                lifecycle.sourceDraw = transition.state;
                return createSourceDrawTransitionResult('observed', reason, transition, entry);
            }

    function completeEntryNativeSourceDraw(entry, reason = 'native-source-draw-complete') {
                if (!entry || !entry.renderLifecycle || !entry.renderLifecycle.sourceDraw) {
                    return createSourceDrawTransitionResult('ignored', 'source-draw-missing', null, entry);
                }
                const transition = renderTransaction.commitSourceDraw(entry.renderLifecycle.sourceDraw, {
                    reason: String(reason || 'native-source-draw-complete'),
                    details: {
                        method: entry.type || '',
                    },
                });
                entry.renderLifecycle.sourceDraw = transition.state;
                if (entry.recordId && isEntryActive(entry)) {
                    updateOrchestratorItem(entry, {
                        status: getEntryStatus(entry, 'detected'),
                        translation: entry.renderedText || '',
                        translationReceived: entry.providerText || '',
                        translationDrawn: entry.renderedText || '',
                        drawBoundary: transition.state,
                    }, 'item.source_draw_committed', {
                        phase: transition.state && transition.state.phase ? transition.state.phase : '',
                        previousPhase: transition.previousPhase || '',
                        reason: String(reason || 'native-source-draw-complete'),
                    });
                }
                return createSourceDrawTransitionResult('committed', reason, transition, entry);
            }

    function createSourceDrawTransitionResult(status, reason, transition = null, entry = null) {
                const state = transition && transition.state ? transition.state : null;
                return Object.freeze({
                    status,
                    accepted: status === 'observed' || status === 'committed',
                    reason: String(reason || status || ''),
                    phase: state && state.phase ? state.phase : '',
                    previousPhase: transition && transition.previousPhase ? transition.previousPhase : '',
                    sourceDraw: state,
                    recordId: entry && entry.recordId ? String(entry.recordId) : '',
                    surfaceId: entry && entry.surfaceId ? String(entry.surfaceId) : '',
                    slotKey: entry && entry.slotKey ? String(entry.slotKey) : '',
                    generation: state && Number.isFinite(Number(state.generation)) ? Number(state.generation) : 0,
                });
            }

    function ensureEntryRenderLifecycle(entry) {
                if (!entry.renderLifecycle || typeof entry.renderLifecycle !== 'object') {
                    entry.renderLifecycle = {};
                }
                return entry.renderLifecycle;
            }
    
    function resolveWindowData(entry) {
                if (!entry) return null;
                if (entry.windowData) return entry.windowData;
                const owner = entry.ownerWindow || null;
                try {
                    return owner ? surfaceService.getWindowData(owner) : null;
                } catch (_) {
                    return null;
                }
            }
    
    function resolveTargetWindow(entry, windowData) {
                if (typeof pruneDetachedRegisteredWindows === 'function') {
                    try { pruneDetachedRegisteredWindows(); } catch (_) {}
                }
                if (entry && entry.ownerWindow && (!windowData || surfaceService.getWindowData(entry.ownerWindow) === windowData)) {
                    return entry.ownerWindow;
                }
                return surfaceService.findWindowByData(windowData);
            }
    
    function isWindowReadyForRedraw(windowInstance, contents) {
                if (!windowInstance || !contents) return false;
                const visible = windowInstance.visible !== false;
                const isOpen = typeof windowInstance.isOpen === 'function' ? windowInstance.isOpen() : true;
                const fullyOpen = typeof windowInstance.openness === 'number' ? windowInstance.openness >= 255 : true;
                return visible && (isOpen || fullyOpen);
            }
    
    function refreshEntryBounds(windowInstance, entry, textForMeasure) {
                try {
                    entry.bounds = estimateEntryBounds(
                        windowInstance,
                        entry.type,
                        textForMeasure,
                        entry.position && entry.position.x,
                        entry.position && entry.position.y,
                        textForMeasure,
                        entry.originalParams
                    );
                } catch (_) {
                    entry.bounds = null;
                }
                return entry.bounds;
            }
    
        return { findExistingEntry, retireEntriesInExactSlot, retireEntriesForReplacementDraw, markEntryStale, rememberDetachedEntry, takeDetachedEntry, peekDetachedEntry, forgetEntryRecord, cancelEntryTranslation, markRecordDisappeared, recordDecision, scheduleRenderRetry, clearPendingInvalidation, getCurrentEntry, getTextEntryKey, dropScheduledRenderRetry, invalidateEntriesForBitmapMutation, beginEntryNativeSourceDraw, completeEntryNativeSourceDraw, resolveWindowData, resolveTargetWindow, isWindowReadyForRedraw, refreshEntryBounds };
    }
            return { create: createEntryLifecycleController };
        },
    });

})();
