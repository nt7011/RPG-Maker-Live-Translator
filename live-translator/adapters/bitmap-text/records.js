// Bitmap text adapter support: records.
// Each controller receives one adapter instance scope from bitmap-text.js.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'adapters.bitmapText.records',
        requires: {
            bitmapRenderPlannerModule: 'runtime.bitmap.renderPlanner',
            copiedTargetProofSummary: 'runtime.bitmap.copiedTargetProofSummary',
            sourceRunIdentity: 'runtime.bitmap.sourceRunIdentity',
        },
        factory({ bitmapRenderPlannerModule, copiedTargetProofSummary, sourceRunIdentity }) {
    function createController(scope = {}) {
        const { ADAPTER_ID, ADAPTER_LABEL, SURFACE_TYPE, RENDER_STRATEGY, BITMAP_PRIORITY } = scope;
        const renderTransaction = scope.renderTransaction;
        const { materializeCopiedBitmapTargetRedraws, redrawCopiedBitmapTargets } = scope.controllerFacades.copiedTargets;
        const { executeBitmapFallbackRender } = scope.controllerFacades.fallbackRenderer;
        const { sanitizeVisibleText, describeEntryEligibility, recordDrawTrace, bitmapTraceDetails, cloneTraceRect, updateItem, isAdapterContractFailure, warn, stringify, errorMessage } = scope.controllerFacades.textUtils;
        const bitmapRenderPlanner = scope.bitmapRenderPlanner
            && typeof scope.bitmapRenderPlanner.createBitmapSourceEntryCopiedTargetRenderPlan === 'function'
            && typeof scope.bitmapRenderPlanner.createBitmapSourceEntryCopiedTargetRecoveryPlan === 'function'
            ? scope.bitmapRenderPlanner
            : bitmapRenderPlannerModule.create();
        const {
            collectSourceRunIds,
            collectSourceSlotKeys,
            sourceRunIdentitiesMatch,
        } = sourceRunIdentity;

        function observeEntry(entry, status) {
            if (!entry || !entry.recordId) return null;
            const payload = {
                id: entry.recordId,
                sourceAdapter: ADAPTER_ID,
                hook: ADAPTER_ID,
                hookLabel: ADAPTER_LABEL,
                surfaceId: entry.surfaceId,
                slotKey: entry.slotKey,
                surfaceType: SURFACE_TYPE,
                status: status || getEntryObservationStatus(entry, 'detected'),
                rawText: entry.rawText,
                visibleText: entry.visibleText,
                original: entry.visibleText,
                translationSource: entry.translationSource,
                normalizedSource: entry.normalizedSource,
                priority: BITMAP_PRIORITY,
                generation: entry.surfaceRevision,
                renderStrategy: RENDER_STRATEGY,
                drawBoundary: createEntryDrawBoundary(entry),
                visible: true,
                screenState: 'visible',
                bounds: entry.bounds,
                metadata: {
                    ownerType: entry.ownerType,
                    methodName: entry.methodName,
                    sourceRunRecords: countSourceRunRecords(entry),
                    drawOrder: entry.drawOrder || 0,
                },
            };
            const observed = scope.adapterContract.observeRecord(entry, payload, { eventType: `item.${payload.status}` }, {
                registry: scope.entriesByItemId,
                ownership: entry.ownershipToken,
                ownershipRequired: true,
            });
            indexEntrySourceRun(entry);
            return observed;
        }

        function createEntryDrawBoundary(entry) {
            const source = entry && entry.drawBoundary && typeof entry.drawBoundary === 'object'
                ? entry.drawBoundary
                : null;
            if (!source) return null;
            return renderTransaction.createSourceDrawBoundary(Object.assign({}, source, {
                itemId: entry.recordId || source.itemId || '',
                recordId: entry.recordId || source.recordId || '',
                surfaceId: entry.surfaceId || source.surfaceId || '',
                slotKey: entry.slotKey || source.slotKey || '',
                generation: Number(entry.surfaceRevision) || Number(source.generation) || 0,
            }));
        }

        function countSourceRunRecords(entry) {
            return Array.isArray(entry && entry.sourceRunRecords) ? entry.sourceRunRecords.length : 0;
        }
        
        function requestEntryTranslation(entry) {
            if (!entry || entry.stale || !entry.recordId || !entry.normalizedSource) return false;
            if (isEntryRequestActive(entry) || isEntryCompleted(entry)) return false;
            if (!isEntryActive(entry)) {
                observeEntry(entry, getEntryObservationStatus(entry, 'detected'));
                if (!isEntryActive(entry)) return false;
            }
            if (getEntryStatus(entry) === 'skipped') return false;
            const eligibility = describeEntryEligibility(entry);
            if (!eligibility.eligible) {
                entry.skipReason = eligibility.reason || 'translation skipped';
                updateItem(entry, { status: 'skipped' }, 'item.skipped', {
                    reason: entry.skipReason,
                    category: eligibility.category,
                });
                return false;
            }
            recordDrawTrace('bitmap.entry.requested', entry.rawText, bitmapTraceDetails(entry.bitmap, entry.methodName, entry.rawText, entry.drawParams && entry.drawParams.x, entry.drawParams && entry.drawParams.y, {
                recordId: entry.recordId || '',
                slotKey: entry.slotKey || '',
                status: 'pending',
                ownerType: entry.ownerType || '',
                sourceRunRecords: countSourceRunRecords(entry),
                bounds: cloneTraceRect(entry.bounds),
            }));
            try {
                const requested = scope.adapterContract.requestItemTranslation(entry, {
                    hook: ADAPTER_ID,
                    priority: BITMAP_PRIORITY,
                    renderStrategy: RENDER_STRATEGY,
                    metadata: {
                        ownerType: entry.ownerType,
                        methodName: entry.methodName,
                    },
                });
                if (!requested || requested.handled !== true) {
                    updateItem(entry, { status: 'failed' }, 'item.failed', { reason: 'translation request failed' });
                    return false;
                }
                scope.perf.count('bitmapText.translation.requested');
                return true;
            } catch (error) {
                if (isAdapterContractFailure(error)) throw error;
                updateItem(entry, { status: 'failed' }, 'item.failed', { reason: errorMessage(error) });
                warn('[BitmapText] Failed to request translation.', error);
                return false;
            }
        }
        
        function applyRenderCommand(entry, command = {}, route = {}) {
            const translated = stringify(command.text);
            const restored = restoreTranslatedEntryText(entry, translated);
            const visible = sanitizeVisibleText(restored);
            if (!visible || visible === entry.visibleText) {
                const reason = visible ? 'translated-text-matched-original' : 'restored-text-empty';
                updateItem(entry, { status: 'skipped' }, 'item.skipped', {
                    reason,
                    translationReceived: translated,
                });
                return createBitmapRenderCommit('rejected', reason, entry, command, route, {
                    translationReceived: translated,
                    translationDrawn: '',
                    restoredText: restored || '',
                });
            }
        
            const copiedTargetRenderPlan = bitmapRenderPlanner.createBitmapSourceEntryCopiedTargetRenderPlan({
                entry,
                text: restored,
                collectProjectedTargets: materializeCopiedBitmapTargetRedraws,
                detachedEntry: isCopiedTargetDetachedEntry(entry),
            });
            const copiedTargetRenderPlanIntel = copiedTargetRenderPlan && copiedTargetRenderPlan.intel || null;
            let redrawIntel = null;
            if (!isCopiedTargetDetachedEntry(entry)) {
                redrawIntel = executeBitmapFallbackRender(entry, restored, command);
            }
            entry.renderedText = restored;
            const copiedTargetCompositionProofs = [];
            const copiedTargetRedraws = copiedTargetRenderPlan && copiedTargetRenderPlan.status === 'planned'
                ? redrawCopiedBitmapTargets(entry, restored, Object.assign({}, copiedTargetRenderPlan.redrawOptions || {}, {
                    compositionProofs: copiedTargetCompositionProofs,
                }))
                : 0;
            const copiedTargetProof = copiedTargetProofSummary.createCopiedTargetProofSummary(
                copiedTargetCompositionProofs,
                copiedTargetRedraws
            );
            if (isCopiedTargetDetachedEntry(entry) && copiedTargetRedraws <= 0) {
                const reason = 'copied-bitmap-target-missing';
                retireEntry(entry, reason, 'stale');
                return createBitmapRenderCommit('rejected', reason, entry, command, route, {
                    translationReceived: translated,
                    translationDrawn: '',
                    copiedTargetRedraws,
                    copiedTargetProof,
                    copiedTargetRenderPlan: copiedTargetRenderPlanIntel,
                });
            }
            updateItem(entry, {
                status: 'completed',
                translation: restored,
                translationDrawn: restored,
            }, 'item.rendered', {
                translationReceived: translated,
                translationDrawn: restored,
                sourceHint: command.metadata && command.metadata.sourceHint,
                copiedTargetRedraws,
                copiedTargetProof,
                detachedCopiedTarget: isCopiedTargetDetachedEntry(entry) === true,
                copiedTargetRenderPlan: copiedTargetRenderPlanIntel,
            });
            return createBitmapRenderCommit('committed', 'bitmap-redraw-applied', entry, command, route, {
                translationReceived: translated,
                translationDrawn: restored,
                sourceHint: command.metadata && command.metadata.sourceHint,
                ownerType: entry.ownerType,
                methodName: entry.methodName,
                copiedTargetRedraws,
                copiedTargetProof,
                detachedCopiedTarget: isCopiedTargetDetachedEntry(entry) === true,
                copiedTargetRenderPlan: copiedTargetRenderPlanIntel,
                redraw: redrawIntel,
            });
        }

        function createBitmapRenderCommit(status, reason, entry, command = {}, route = {}, details = {}) {
            const payload = {
                status,
                mode: 'bitmap-redraw',
                reason: reason || status || 'bitmap-redraw',
                adapterId: ADAPTER_ID,
                itemId: entry && entry.recordId || '',
                recordId: entry && entry.recordId || '',
                surfaceId: entry && entry.surfaceId || '',
                slotKey: entry && entry.slotKey || '',
                strategy: route && route.strategy || command.strategy || RENDER_STRATEGY,
                commandId: command && command.commandId || '',
                commandGeneration: Number(route && route.commandGeneration) || Number(command && command.generation) || 0,
                generation: entry && entry.surfaceRevision || 0,
                translationReceived: details.translationReceived || '',
                translationDrawn: details.translationDrawn || '',
                drawBoundary: entry && entry.renderLifecycle && entry.renderLifecycle.sourceDraw
                    ? entry.renderLifecycle.sourceDraw
                    : (command && command.metadata && command.metadata.drawBoundary || null),
                details,
            };
            return renderTransaction && typeof renderTransaction.createRenderCommit === 'function'
                ? renderTransaction.createRenderCommit(payload)
                : payload;
        }

        function getRenderGeneration(entry) {
            return entry && entry.surfaceRevision ? Number(entry.surfaceRevision) : 0;
        }
        
        function isRenderTargetCurrent(entry) {
            if (!entry || entry.stale || !entry.bitmap || !entry.state) return false;
            if (isCopiedTargetDetachedEntry(entry)) {
                const recoveryPlan = planBitmapCopiedTargetRecovery(entry);
                return !!(recoveryPlan && recoveryPlan.status === 'planned');
            }
            if (entry.state.entries.get(entry.key) !== entry) return false;
            return true;
        }
        
        function handleRenderRejected(entry, decision = {}) {
            if (!entry || entry.stale || shouldKeepRecordAfterRenderRejection(decision)) return;
            const reason = normalizeRenderRejectionReason(decision);
            retireEntry(
                entry,
                `bitmap-render-${reason}`,
                isRenderApplicationFailure(reason) ? 'failed' : 'stale'
            );
        }
        
        function restoreTranslatedEntryText(entry, translated) {
            try {
                const restored = scope.restoreText(translated, entry.codecState || {});
                return typeof restored === 'string' ? restored : entry.rawText;
            } catch (error) {
                warn('[BitmapText] Failed to restore control-code placeholders.', error);
                return translated;
            }
        }
        
        function markEntryTerminal(entry, status, reason) {
            if (!entry || entry.stale) return;
        }
        
        function isEntryActive(entry) {
            return !!(entry
                && entry.recordId
                && scope.adapterContract
                && typeof scope.adapterContract.isRecordActive === 'function'
                && scope.adapterContract.isRecordActive(entry));
        }
        
        function getEntryStatus(entry, fallback = '') {
            if (!entry || !scope.adapterContract || typeof scope.adapterContract.getRecordStatus !== 'function') return fallback || '';
            return scope.adapterContract.getRecordStatus(entry, fallback || '');
        }
        
        function isEntryRequestActive(entry) {
            return !!(entry
                && scope.adapterContract
                && typeof scope.adapterContract.isRecordRequestActive === 'function'
                && scope.adapterContract.isRecordRequestActive(entry));
        }
        
        function isEntryCompleted(entry) {
            return getEntryStatus(entry) === 'completed';
        }
        
        function getEntryObservationStatus(entry, fallback = 'detected') {
            if (!entry) return fallback;
            const current = getEntryStatus(entry, '');
            if (current === 'pending' || current === 'translating') return current;
            if (entry.renderedText) return 'completed';
            if (entry.skipReason) return 'skipped';
            if (current === 'detected' || current === 'completed' || current === 'skipped' || current === 'failed') return current;
            return fallback;
        }

        // Projected copied-target restoration starts from ledger source-run
        // identity, so the entry lookup index must follow record lifecycle.
        function findEntryBySourceRun(input = {}) {
            const lookup = createSourceRunLookup(input);
            const keys = createSourceRunIndexKeys(lookup);
            if (!keys.length) return null;
            const index = getSourceRunEntryIndex(false);
            if (!index) return null;
            const visited = new Set();
            for (let keyIndex = 0; keyIndex < keys.length; keyIndex += 1) {
                const bucket = index.get(keys[keyIndex]);
                if (!bucket || typeof bucket.forEach !== 'function') continue;
                let found = null;
                bucket.forEach((entry) => {
                    if (found || !entry || visited.has(entry)) return;
                    visited.add(entry);
                    if (entry.stale) {
                        forgetEntrySourceRun(entry);
                        return;
                    }
                    if (lookup.sourceBitmap && entry.bitmap && entry.bitmap !== lookup.sourceBitmap) return;
                    if (matchesEntrySourceRunLookup(entry, lookup)) found = entry;
                });
                if (found) return found;
            }
            return null;
        }

        function indexEntrySourceRun(entry) {
            if (!entry || entry.stale) return;
            forgetEntrySourceRun(entry);
            const keys = createSourceRunIndexKeys(createEntrySourceRunIdentity(entry));
            if (!keys.length) return;
            const index = getSourceRunEntryIndex(true);
            const keyStore = getSourceRunEntryKeyStore(true);
            if (!index || !keyStore) return;
            keys.forEach((key) => {
                let bucket = index.get(key);
                if (!bucket) {
                    bucket = new Set();
                    index.set(key, bucket);
                }
                bucket.add(entry);
            });
            keyStore.set(entry, keys);
        }

        function forgetEntrySourceRun(entry) {
            if (!entry) return;
            const index = getSourceRunEntryIndex(false);
            const keyStore = getSourceRunEntryKeyStore(false);
            if (!index || !keyStore) return;
            const keys = keyStore.get(entry);
            if (Array.isArray(keys)) {
                keys.forEach((key) => {
                    const bucket = index.get(key);
                    if (!bucket || typeof bucket.delete !== 'function') return;
                    bucket.delete(entry);
                    if (bucket.size === 0) index.delete(key);
                });
            }
            if (typeof keyStore.delete === 'function') keyStore.delete(entry);
        }

        function createEntrySourceRunIdentity(entry) {
            const boundary = entry && entry.drawBoundary && typeof entry.drawBoundary === 'object'
                ? entry.drawBoundary
                : null;
            const sourceRunId = firstSourceRunString(
                entry && entry.sourceRunId,
                boundary && boundary.runId
            );
            const sourceSlotKey = firstSourceRunString(
                entry && entry.sourceSlotKey,
                boundary && boundary.slotKey,
                entry && entry.slotKey
            );
            return {
                sourceBitmap: entry && entry.bitmap || null,
                sourceSurfaceId: firstSourceRunString(
                    entry && entry.sourceSurfaceId,
                    boundary && boundary.surfaceId,
                    entry && entry.surfaceId
                ),
                sourceRunId,
                sourceRunIds: collectSourceRunStrings(
                    entry && entry.sourceRunIds,
                    boundary && boundary.sourceRunIds,
                    boundary && boundary.ledgerRunIds,
                    sourceRunId
                ),
                sourceSlotKey,
                sourceSlotKeys: collectSourceRunStrings(
                    entry && entry.sourceSlotKeys,
                    boundary && boundary.sourceSlotKeys,
                    boundary && boundary.slotKeys,
                    sourceSlotKey
                ),
            };
        }

        function createSourceRunLookup(input = {}) {
            const request = input && typeof input === 'object' ? input : {};
            const projection = request.projection && typeof request.projection === 'object'
                ? request.projection
                : {};
            const sourceTextRun = request.sourceTextRun && typeof request.sourceTextRun === 'object'
                ? request.sourceTextRun
                : (projection && projection.sourceTextRun && typeof projection.sourceTextRun === 'object'
                    ? projection.sourceTextRun
                    : {});
            const sourceRunId = firstSourceRunString(
                request.sourceRunId,
                projection.sourceRunId,
                sourceTextRun.runId,
                sourceTextRun.sourceRunId
            );
            const sourceSlotKey = firstSourceRunString(
                request.sourceSlotKey,
                projection.sourceSlotKey,
                sourceTextRun.slotKey,
                sourceTextRun.sourceSlotKey
            );
            return {
                sourceBitmap: request.sourceBitmap || projection.sourceBitmap || sourceTextRun.sourceBitmap || null,
                sourceSurfaceId: firstSourceRunString(
                    request.sourceSurfaceId,
                    projection.sourceSurfaceId,
                    sourceTextRun.surfaceId,
                    sourceTextRun.sourceSurfaceId
                ),
                sourceRunId,
                sourceRunIds: collectSourceRunStrings(
                    request.sourceRunIds,
                    projection.sourceRunIds,
                    sourceTextRun.sourceRunIds,
                    sourceTextRun.runIds,
                    request.sourceRunId,
                    projection.sourceRunId,
                    sourceTextRun.runId,
                    sourceTextRun.sourceRunId
                ),
                sourceSlotKey,
                sourceSlotKeys: collectSourceRunStrings(
                    request.sourceSlotKeys,
                    projection.sourceSlotKeys,
                    sourceTextRun.sourceSlotKeys,
                    sourceTextRun.slotKeys,
                    request.sourceSlotKey,
                    projection.sourceSlotKey,
                    sourceTextRun.slotKey,
                    sourceTextRun.sourceSlotKey
                ),
            };
        }

        function createSourceRunIndexKeys(identity) {
            const sourceSurfaceId = normalizeSourceRunString(identity && identity.sourceSurfaceId);
            if (!sourceSurfaceId) return [];
            const keys = [];
            collectSourceRunIds(identity).forEach((sourceRunId) => {
                keys.push(`run:${sourceSurfaceId}:${sourceRunId}`);
            });
            collectSourceSlotKeys(identity).forEach((sourceSlotKey) => {
                keys.push(`slot:${sourceSurfaceId}:${sourceSlotKey}`);
            });
            return keys;
        }

        function matchesEntrySourceRunLookup(entry, lookup) {
            const identity = createEntrySourceRunIdentity(entry);
            if (lookup.sourceSurfaceId && identity.sourceSurfaceId !== lookup.sourceSurfaceId) return false;
            return sourceRunIdentitiesMatch(identity, lookup);
        }

        function getSourceRunEntryIndex(create) {
            if (!scope.sourceRunEntriesByKey && create) scope.sourceRunEntriesByKey = new Map();
            const index = scope.sourceRunEntriesByKey;
            return index && typeof index.get === 'function' && typeof index.set === 'function'
                ? index
                : null;
        }

        function getSourceRunEntryKeyStore(create) {
            if (!scope.sourceRunEntryKeys && create) scope.sourceRunEntryKeys = new WeakMap();
            const keyStore = scope.sourceRunEntryKeys;
            return keyStore && typeof keyStore.get === 'function' && typeof keyStore.set === 'function'
                ? keyStore
                : null;
        }

        function firstSourceRunString(...values) {
            for (let index = 0; index < values.length; index += 1) {
                const value = normalizeSourceRunString(values[index]);
                if (value) return value;
            }
            return '';
        }

        function collectSourceRunStrings(...values) {
            const result = [];
            const seen = new Set();
            const pushValue = (value) => {
                if (Array.isArray(value)) {
                    value.forEach(pushValue);
                    return;
                }
                const normalized = normalizeSourceRunString(value);
                if (!normalized || seen.has(normalized)) return;
                seen.add(normalized);
                result.push(normalized);
            };
            values.forEach(pushValue);
            return result;
        }

        function normalizeSourceRunString(value) {
            const normalized = stringify(value);
            return normalized ? normalized : '';
        }
        
        function retireEntry(entry, reason = 'bitmap-entry-stale', status = 'stale', details = null) {
            if (!entry || entry.stale) return false;
            forgetEntrySourceRun(entry);
            entry.stale = true;
            if (entry.recordId && isEntryActive(entry)) {
                const eventDetails = Object.assign({
                    ownerType: entry.ownerType,
                    methodName: entry.methodName,
                }, details || {});
                scope.adapterContract.retireItem(entry, status || 'stale', {
                    eventType: status === 'stale' ? 'item.stale' : `item.${status}`,
                    message: reason,
                    policy: {
                        kind: 'retired',
                        translationAction: 'cancel',
                    },
                    details: eventDetails,
                });
            }
            if (entry.recordId) scope.entriesByItemId.delete(entry.recordId);
            if (entry.ownershipToken && scope.adapterContract && typeof scope.adapterContract.releaseTextClaim === 'function') {
                scope.adapterContract.releaseTextClaim(entry.ownershipToken, reason || 'bitmap-entry-stale');
                entry.ownershipToken = null;
            }
            if (entry.state && entry.state.entries.get(entry.key) === entry) entry.state.entries.delete(entry.key);
            return true;
        }

        function detachEntryForCopiedTargets(entry, reason = 'bitmap-source-invalidated') {
            if (!entry || entry.stale) return false;
            const recoveryPlan = planBitmapCopiedTargetRecovery(entry);
            if (!recoveryPlan || recoveryPlan.status !== 'planned') return false;
            const recoveryPlanIntel = recoveryPlan.intel || null;
            const unresolvedCommands = getUnresolvedRenderCommandsForEntry(entry);
            const renderRecovery = unresolvedCommands.length
                ? createRenderCommandRecoveryDetails(
                    unresolvedCommands,
                    'retargeted-to-copied-surface',
                    false
                )
                : null;
            recordCopiedTargetDetachment(entry, reason || 'bitmap-source-invalidated', recoveryPlanIntel);
            if (entry.state && entry.state.entries && entry.state.entries.get(entry.key) === entry) {
                entry.state.entries.delete(entry.key);
            }
            if (entry.ownershipToken && scope.adapterContract && typeof scope.adapterContract.releaseTextClaim === 'function') {
                scope.adapterContract.releaseTextClaim(entry.ownershipToken, reason || 'bitmap-source-invalidated');
                entry.ownershipToken = null;
            }
            if (entry.recordId && isEntryActive(entry) && scope.adapterContract && typeof scope.adapterContract.backgroundItem === 'function') {
                const backgroundDetails = {
                    reason: reason || 'bitmap-source-invalidated',
                    screenState: 'copied-bitmap-target',
                    copiedTargets: Number(recoveryPlan.copiedTargets) || 0,
                    copiedTargetRecoveryPlan: recoveryPlanIntel,
                    sourceSurfaceId: entry.sourceSurfaceId || entry.surfaceId || '',
                    sourceRunId: entry.sourceRunId || '',
                    sourceSlotKey: entry.sourceSlotKey || '',
                    sourceSurfaceRevision: entry.sourceSurfaceRevision || 0,
                    ownerType: entry.ownerType || '',
                    methodName: entry.methodName || '',
                };
                if (renderRecovery) Object.assign(backgroundDetails, renderRecovery);
                scope.adapterContract.backgroundItem(entry, backgroundDetails);
            }
            return true;
        }

        function rejectUnresolvedRenderCommandsForInvalidation(entry, reason = 'bitmap-entry-invalidated') {
            // Bitmap invalidation can tear down local entry state, but the
            // orchestrator owns render command state and must receive the
            // explicit terminal outcome before the local record is retired.
            const unresolvedCommands = getUnresolvedRenderCommandsForEntry(entry);
            if (!unresolvedCommands.length) return null;
            const outcome = resolveBitmapInvalidationRenderOutcome(reason);
            const recovery = createRenderCommandRecoveryDetails(unresolvedCommands, outcome, true);
            if (scope.adapterContract && typeof scope.adapterContract.recordRenderRejected === 'function') {
                unresolvedCommands.forEach((command) => {
                    const commandId = getRenderCommandId(command);
                    if (!commandId) return;
                    scope.adapterContract.recordRenderRejected(entry, {
                        commandId,
                        strategy: String(command && command.strategy || RENDER_STRATEGY),
                        commandGeneration: Number(command && (command.generation || command.commandGeneration)) || 0,
                        reason: outcome,
                        details: Object.assign({
                            ownerType: entry && entry.ownerType || '',
                            methodName: entry && entry.methodName || '',
                            invalidationReason: reason || '',
                        }, recovery),
                    });
                });
            }
            return recovery;
        }

        function getUnresolvedRenderCommandsForEntry(entry) {
            if (!entry || !entry.recordId || !scope.adapterContract
                || typeof scope.adapterContract.getUnresolvedRenderCommandsForItem !== 'function') {
                return [];
            }
            const commands = scope.adapterContract.getUnresolvedRenderCommandsForItem(entry);
            return Array.isArray(commands) ? commands.filter(Boolean) : [];
        }

        function createRenderCommandRecoveryDetails(commands, outcome, terminal) {
            const summaries = commands.map(summarizeRenderCommandForRecovery);
            return {
                renderOutcome: outcome,
                renderCommandRecovery: {
                    outcome,
                    terminal: terminal === true,
                    commandIds: summaries.map((command) => command.commandId).filter(Boolean),
                },
                unresolvedRenderCommands: summaries,
            };
        }

        function summarizeRenderCommandForRecovery(command) {
            return {
                commandId: getRenderCommandId(command),
                status: String(command && command.status || ''),
                strategy: String(command && command.strategy || ''),
                generation: Number(command && (command.generation || command.commandGeneration)) || 0,
                targetSurfaceId: String(command && command.targetSurfaceId || ''),
            };
        }

        function getRenderCommandId(command) {
            return String(command && command.commandId || '');
        }

        function resolveBitmapInvalidationRenderOutcome(reason) {
            const normalized = String(reason || '');
            if (normalized.indexOf('clear') >= 0 || normalized.indexOf('destroy') >= 0 || normalized.indexOf('resize') >= 0) {
                return 'aborted-by-surface-invalidation';
            }
            return 'aborted-by-bitmap-invalidation';
        }

        function isCopiedTargetDetachedEntry(entry) {
            const detachment = getCopiedTargetDetachment(entry);
            return !!(detachment && detachment.detached === true);
        }

        function recordCopiedTargetDetachment(entry, reason, recoveryPlanIntel) {
            if (!entry) return;
            const lifecycle = entry.renderLifecycle && typeof entry.renderLifecycle === 'object'
                ? entry.renderLifecycle
                : (entry.renderLifecycle = {});
            lifecycle.copiedTargetDetachment = {
                detached: true,
                reason: reason || 'bitmap-source-invalidated',
                at: Date.now(),
                recoveryPlan: recoveryPlanIntel || null,
            };
        }

        function getCopiedTargetDetachment(entry) {
            const lifecycle = entry && entry.renderLifecycle && typeof entry.renderLifecycle === 'object'
                ? entry.renderLifecycle
                : null;
            return lifecycle && lifecycle.copiedTargetDetachment && typeof lifecycle.copiedTargetDetachment === 'object'
                ? lifecycle.copiedTargetDetachment
                : null;
        }

        function planBitmapCopiedTargetRecovery(entry) {
            return bitmapRenderPlanner.createBitmapSourceEntryCopiedTargetRecoveryPlan({
                entry,
                collectProjectedTargets: materializeCopiedBitmapTargetRedraws,
            });
        }

        function shouldKeepRecordAfterRenderRejection(decision = {}) {
            const reason = normalizeRenderRejectionReason(decision);
            if (reason !== 'generation-mismatch') return false;
            const targetGeneration = Number(decision.details && decision.details.targetGeneration);
            const commandGeneration = Number(decision.commandGeneration);
            return Number.isFinite(targetGeneration)
                && Number.isFinite(commandGeneration)
                && targetGeneration > commandGeneration;
        }
        
        function isRenderApplicationFailure(reason) {
            return reason === 'adapter-render-error' || reason === 'adapter-declined';
        }
        
        function normalizeRenderRejectionReason(decision = {}) {
            const reason = String(decision && decision.reason || '').trim();
            return reason || 'render-rejected';
        }

        return { observeEntry, requestEntryTranslation, applyRenderCommand, getRenderGeneration, isRenderTargetCurrent, handleRenderRejected, restoreTranslatedEntryText, markEntryTerminal, isEntryActive, getEntryStatus, isEntryRequestActive, isEntryCompleted, findEntryBySourceRun, getEntryObservationStatus, retireEntry, detachEntryForCopiedTargets, rejectUnresolvedRenderCommandsForInvalidation, getUnresolvedRenderCommandsForEntry, shouldKeepRecordAfterRenderRejection, isRenderApplicationFailure, normalizeRenderRejectionReason };
    }

            return { create: createController };
        },
    });
})();
