// Sprite text adapter support: entries.
// Keeps Sprite-owned bitmap text responsibilities small enough to audit in isolation.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before adapters/sprite-text/entries.js.');
    }

    function createController(scope = {}) {
        const callScope = (name) => (...args) => scope[name](...args);
        const {
            applyEligibilityToSpriteRecord,
            completeRunFromCommand,
            createObservationSignature,
            describeSpriteRecordEligibility,
            errorMessage,
            getBitmapState,
            isAdapterContractFailure,
            isRunCommandCurrent,
            isSpriteEntryScreenVisible,
            isValidRect,
            logTextDetected,
            markRecordVisibilitySynced,
            rectHasArea,
            removeParentRun,
            removeSpriteOverlay,
            renderSpriteOverlay,
            restoreTranslatedText,
            safePrepareText,
            sanitizeVisibleText,
            shouldPublishObservation,
            stringify,
            textUnitCount,
            updateItem,
            warn,
        } = Object.fromEntries([
            'applyEligibilityToSpriteRecord',
            'completeRunFromCommand',
            'createObservationSignature',
            'describeSpriteRecordEligibility',
            'errorMessage',
            'getBitmapState',
            'isAdapterContractFailure',
            'isRunCommandCurrent',
            'isSpriteEntryScreenVisible',
            'isValidRect',
            'logTextDetected',
            'markRecordVisibilitySynced',
            'rectHasArea',
            'removeParentRun',
            'removeSpriteOverlay',
            'renderSpriteOverlay',
            'restoreTranslatedText',
            'safePrepareText',
            'sanitizeVisibleText',
            'shouldPublishObservation',
            'stringify',
            'textUnitCount',
            'updateItem',
            'warn',
        ].map((name) => [name, callScope(name)]));

        /**
         * Group sprite bitmap text ops by line and compatible style.
         */
        function buildTextGroups(textOps) {
            const ops = collapseRepeatedTextOps(
                (Array.isArray(textOps) ? textOps : [])
                    .filter((op) => op && op.trimmedText && op.bounds && rectHasArea(op.bounds))
            );
            if (!ops.length) return [];
        
            const lines = new Map();
            ops.forEach((op) => {
                const key = `${Math.round(op.y)}:${Math.round(op.lineHeight)}:${op.fontSignature || ''}`;
                if (!lines.has(key)) lines.set(key, []);
                lines.get(key).push(op);
            });
        
            const groups = [];
            lines.forEach((lineOps) => {
                lineOps.sort((a, b) => (a.x !== b.x ? a.x - b.x : (a.drawOrder || 0) - (b.drawOrder || 0)));
                let current = [];
                let last = null;
                lineOps.forEach((op) => {
                    if (!last || canContinueTextGroup(last, op)) current.push(op);
                    else {
                        if (current.length) groups.push(current);
                        current = [op];
                    }
                    last = op;
                });
                if (current.length) groups.push(current);
            });
        
            return groups.map(createTextGroup).filter(Boolean);
        }

        function collapseRepeatedTextOps(ops) {
            if (!Array.isArray(ops) || !ops.length) return [];
            const latestBySlot = new Map();
            ops.slice()
                .sort((a, b) => (Number(a && a.drawOrder) || 0) - (Number(b && b.drawOrder) || 0))
                .forEach((op) => {
                    if (!op) return;
                    latestBySlot.set(createRepeatedTextSlotKey(op), op);
                });
            return Array.from(latestBySlot.values())
                .sort((a, b) => (Number(a && a.drawOrder) || 0) - (Number(b && b.drawOrder) || 0));
        }

        function createRepeatedTextSlotKey(op) {
            const bounds = op && op.bounds ? op.bounds : null;
            return [
                roundSlotNumber(op && op.x),
                roundSlotNumber(op && op.y),
                roundSlotNumber(op && op.maxWidth),
                roundSlotNumber(op && op.lineHeight),
                stringify(op && op.align),
                stringify(op && op.fontSignature),
                stringify(op && op.methodName),
                bounds ? roundSlotNumber(bounds.x1) : '',
                bounds ? roundSlotNumber(bounds.y1) : '',
                bounds ? roundSlotNumber(bounds.x2) : '',
                bounds ? roundSlotNumber(bounds.y2) : '',
            ].join(':');
        }

        function roundSlotNumber(value) {
            const numeric = Number(value);
            return Number.isFinite(numeric) ? Math.round(numeric * 100) / 100 : '';
        }
        
        /**
         * Decide whether two bitmap text ops form the same phrase.
         */
        function canContinueTextGroup(left, right) {
            if (!left || !right) return false;
            if (left.fontSignature !== right.fontSignature || left.align !== right.align) return false;
            const lineHeight = Math.max(1, Number(left.lineHeight || right.lineHeight) || 24);
            const gapLimit = Math.max(scope.GAP_MIN, Math.ceil(lineHeight * scope.GAP_RATIO));
            return right.x - (left.x + left.width) <= gapLimit;
        }
        
        /**
         * Convert a text-op group into a renderable logical text group.
         */
        function createTextGroup(ops) {
            if (!Array.isArray(ops) || !ops.length) return null;
            const bounds = ops.reduce((acc, op) => ({
                x1: Math.min(acc.x1, op.bounds.x1),
                y1: Math.min(acc.y1, op.bounds.y1),
                x2: Math.max(acc.x2, op.bounds.x2),
                y2: Math.max(acc.y2, op.bounds.y2),
            }), { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity });
            if (!isValidRect(bounds)) return null;
            const rawText = ops.map((op) => op.rawText).join('');
            const trimmedText = sanitizeVisibleText(rawText);
            if (!trimmedText) return null;
            const dominant = ops.reduce((best, op) => (!best || (op.width || 0) > (best.width || 0) ? op : best), null) || ops[0];
            const maxWidth = Math.max(bounds.x2 - bounds.x1, ...ops.map((op) => Number(op.maxWidth) || 0), 1);
            const lineHeight = Math.max(...ops.map((op) => Number(op.lineHeight) || 0), 1);
            const slotKey = [
                Math.round(bounds.x1),
                Math.round(bounds.y1),
                Math.round(maxWidth),
                dominant.align,
                dominant.fontSignature || '',
            ].join(':');
            return {
                key: `${slotKey}:${trimmedText}`,
                slotKey,
                ops,
                rawText,
                trimmedText,
                bounds,
                drawParams: {
                    x: ops.length === 1 ? dominant.x : bounds.x1,
                    y: bounds.y1,
                    maxWidth,
                    lineHeight,
                    align: ops.length === 1 ? dominant.align : 'left',
                },
                drawState: dominant.drawState,
                methodName: dominant.methodName || 'drawText',
                fontSignature: dominant.fontSignature,
                drawOrder: Math.min(...ops.map((op) => Number(op.drawOrder) || 0)),
            };
        }
        
        /**
         * Create or refresh a sprite-bitmap text entry.
         */
        function createOrUpdateEntry(spriteState, group, bitmapState) {
            const existing = spriteState.entries.get(group.key);
            if (existing && existing.rawText === group.rawText) {
                existing.group = group;
                existing.bitmapRevision = bitmapState.revision;
                existing.surfaceRevision = bitmapState.revision;
                existing.lastSeenAt = Date.now();
                existing.deferTracker = shouldDeferSpriteEntry(group);
                applyEligibilityToSpriteRecord(existing);
                scope.trackedSpriteStates.add(spriteState);
                observeEntryWhenVisibleOrActive(existing, getSpriteObservationStatus(existing, 'detected'));
                return existing;
            }
            if (existing) retireSpriteEntry(existing, 'replaced');
        
            const codecState = safePrepareText(group.rawText);
            const translationSource = stringify(codecState.translationText !== undefined
                ? codecState.translationText
                : group.rawText);
            const entry = {
                id: `ste-${(++scope.nextEntryId).toString(36)}`,
                key: group.key,
                slotKey: group.slotKey,
                spriteState,
                group,
                rawText: group.rawText,
                trimmedText: group.trimmedText,
                codecState,
                translationSource,
                normalizedSource: translationSource.trim(),
                bitmapRevision: bitmapState.revision,
                surfaceRevision: bitmapState.revision,
                renderedText: '',
                createdAt: Date.now(),
                lastSeenAt: Date.now(),
                recordId: `sprite:${spriteState.id}:${(++scope.nextEntryId).toString(36)}`,
                recordKind: 'entry',
                deferTracker: shouldDeferSpriteEntry(group),
                parentRunId: '',
                stale: false,
            };
            applyEligibilityToSpriteRecord(entry);
            spriteState.entries.set(group.key, entry);
            scope.recordsByItemId.set(entry.recordId, entry);
            scope.trackedSpriteStates.add(spriteState);
            observeEntryWhenVisibleOrActive(entry, getSpriteObservationStatus(entry, 'detected'));
            logTextDetected(entry, 'sprite-bitmap');
            return entry;
        }
        
        /**
         * Defer single glyphs so parent-run grouping can own complete words.
         */
        function shouldDeferSpriteEntry(group) {
            return !!(group && Array.isArray(group.ops) && group.ops.length === 1 && textUnitCount(group.trimmedText) === 1);
        }
        
        /**
         * Report or refresh a sprite-bitmap entry in TextOrchestrator.
         */
        function observeEntry(entry, status) {
            if (!entry || entry.stale || !entry.recordId || entry.deferTracker || entry.parentRunId) return null;
            const spriteState = entry.spriteState;
            const visible = isSpriteEntryScreenVisible(entry);
            const payload = {
                id: entry.recordId,
                sourceAdapter: scope.ADAPTER_ID,
                hook: scope.HOOK_NAME,
                hookLabel: 'Sprite Text',
                surfaceId: `sprite:${spriteState.id}`,
                slotKey: entry.slotKey,
                surfaceType: scope.SURFACE_TYPE,
                status: status || getSpriteObservationStatus(entry, 'detected'),
                rawText: entry.rawText,
                visibleText: entry.trimmedText,
                original: entry.trimmedText,
                translationSource: entry.translationSource,
                normalizedSource: entry.normalizedSource,
                priority: scope.SPRITE_PRIORITY,
                generation: entry.surfaceRevision,
                renderStrategy: scope.RENDER_STRATEGY,
                visible,
                screenState: visible ? 'visible' : 'hidden',
                bounds: entry.group.bounds,
                metadata: {
                    mode: 'sprite-bitmap',
                    spriteId: spriteState.id,
                    ownerType: spriteState.sprite && spriteState.sprite.constructor ? spriteState.sprite.constructor.name : 'Sprite',
                },
            };
            if (!shouldPublishObservation(entry, payload)) return payload;
            const observed = scope.adapterContract.observeRecord(entry, payload, { eventType: `item.${payload.status}` }, {
                registry: scope.recordsByItemId,
            });
            if (observed) {
                entry._trLastObservationSignature = createObservationSignature(payload);
                markRecordVisibilitySynced(entry, payload.visible, payload.screenState, payload.priority);
            }
            return payload;
        }
        
        /**
         * Keep inactive hidden sprite entries out of active diagnostics until seen.
         */
        function observeEntryWhenVisibleOrActive(entry, status) {
            if (!entry || entry.stale) return null;
            if (!isRecordActive(entry) && !isSpriteEntryScreenVisible(entry)) return null;
            return observeEntry(entry, status);
        }
        
        /**
         * Ask the orchestrator to translate one sprite-bitmap entry.
         */
        function requestEntryTranslation(entry) {
            if (!entry || entry.stale || entry.deferTracker || entry.parentRunId) return false;
            if (!entry.normalizedSource || isRecordRequestActive(entry) || hasRenderedTranslation(entry)) return false;
            if (!isRecordActive(entry)) {
                if (!isSpriteEntryScreenVisible(entry)) return false;
                observeEntry(entry, getSpriteObservationStatus(entry, 'detected'));
                if (!isRecordActive(entry)) return false;
            }
            const eligibility = describeSpriteRecordEligibility(entry);
            if (!eligibility.eligible) {
                entry.skipReason = eligibility.reason || 'translation skipped';
                updateItem(entry, { status: 'skipped' }, 'item.skipped', {
                    reason: entry.skipReason,
                    category: eligibility.category,
                    mode: 'sprite-bitmap',
                });
                return false;
            }
            try {
                const requested = scope.adapterContract.requestItemTranslation(entry, {
                    hook: scope.HOOK_NAME,
                    priority: scope.SPRITE_PRIORITY,
                    renderStrategy: scope.RENDER_STRATEGY,
                    metadata: {
                        mode: 'sprite-bitmap',
                        spriteId: entry.spriteState ? entry.spriteState.id : '',
                    },
                });
                if (!requested) {
                    updateItem(entry, { status: 'failed' }, 'item.failed', { reason: 'translation request failed', mode: 'sprite-bitmap' });
                    return false;
                }
                return true;
            } catch (error) {
                if (isAdapterContractFailure(error)) throw error;
                updateItem(entry, { status: 'failed' }, 'item.failed', { reason: errorMessage(error), mode: 'sprite-bitmap' });
                warn('[SpriteText] Failed to request sprite entry translation.', error);
                return false;
            }
        }
        
        /**
         * Retire one sprite-bitmap entry and cancel its orchestrator subscriber.
         */
        function retireSpriteEntry(entry, reason = 'stale', status = 'stale') {
            if (!entry || entry.stale) return false;
            entry.stale = true;
            if (entry.recordId) {
                scope.adapterContract.cancelItemTranslation(entry, reason, { abortJob: true });
                scope.adapterContract.retireItem(entry, status || 'stale', {
                    eventType: status === 'stale' ? 'item.stale' : `item.${status || 'stale'}`,
                    message: reason,
                    details: { mode: 'sprite-bitmap', spriteId: entry.spriteState ? entry.spriteState.id : '' },
                });
                scope.recordsByItemId.delete(entry.recordId);
            }
            if (entry.spriteState && entry.spriteState.entries.get(entry.key) === entry) {
                entry.spriteState.entries.delete(entry.key);
            }
            restoreEntrySource(entry);
            return true;
        }
        
        /**
         * Restore a sprite source when retiring the last completed entry.
         */
        function restoreEntrySource(entry) {
            const spriteState = entry && entry.spriteState;
            if (!spriteState) return;
            const hasCompleted = Array.from(spriteState.entries.values()).some((candidate) => {
                return candidate && candidate !== entry && hasRenderedTranslation(candidate);
            });
            if (!hasCompleted) removeSpriteOverlay(spriteState, 'entry-retired');
        }
        
        /**
         * Apply an orchestrator render command to an entry or glyph run.
         */
        function applyRenderCommand(record, command = {}) {
            if (!record) return false;
            if (record.recordKind === 'entry') return completeEntryFromCommand(record, command);
            if (record.recordKind === 'run') return completeRunFromCommand(record, command);
            return false;
        }
        
        function getRenderGeneration(record) {
            return record && record.surfaceRevision ? Number(record.surfaceRevision) : 0;
        }
        
        function isRenderTargetCurrent(record) {
            if (!record) return false;
            if (record.recordKind === 'entry') return isEntryCommandCurrent(record);
            if (record.recordKind === 'run') return isRunCommandCurrent(record);
            return false;
        }
        
        /**
         * Retire sprite records after a rejected render proves their source
         * pixels or glyph run can no longer accept the queued translation.
         */
        function handleRenderRejected(record, decision = {}) {
            if (!record || record.stale || shouldKeepRecordAfterRenderRejection(decision)) return;
            const reason = normalizeRenderRejectionReason(decision);
            const status = isRenderApplicationFailure(reason) ? 'failed' : 'stale';
            const details = {
                commandId: decision && decision.commandId ? decision.commandId : '',
                renderReason: reason,
            };
            if (record.recordKind === 'entry') {
                retireSpriteEntry(record, `sprite-render-${reason}`, status);
            } else if (record.recordKind === 'run') {
                removeParentRun(record, `sprite-render-${reason}`, details, status);
            }
        }
        
        /**
         * Complete a sprite-bitmap entry from a render command and rebuild overlay.
         */
        function completeEntryFromCommand(entry, command) {
            const translated = stringify(command.text);
            const restored = restoreTranslatedText(translated, entry.codecState, entry.rawText);
            const visible = sanitizeVisibleText(restored);
            if (!visible || visible === entry.trimmedText) {
                updateItem(entry, { status: 'skipped' }, 'item.skipped', {
                    reason: visible ? 'translated text matched original' : 'restored text empty',
                    translationReceived: translated,
                    mode: 'sprite-bitmap',
                });
                return true;
            }
        
            entry.renderedText = restored;
            if (!renderSpriteOverlay(entry.spriteState, command.metadata && command.metadata.sourceHint || 'translation')) {
                entry.renderedText = '';
                return false;
            }
            updateItem(entry, {
                status: 'completed',
                translation: restored,
                translationDrawn: restored,
            }, 'item.rendered', {
                mode: 'sprite-bitmap',
                translationReceived: translated,
                translationDrawn: restored,
            });
            return true;
        }
        
        /**
         * Validate a contract-gated render target against the live sprite entry.
         */
        function isEntryCommandCurrent(entry) {
            if (!entry || entry.stale || !entry.spriteState || !entry.spriteState.bitmap) return false;
            if (entry.spriteState.entries.get(entry.key) !== entry) return false;
            const bitmapState = getBitmapState(entry.spriteState.bitmap);
            if (!bitmapState || bitmapState.revision !== entry.bitmapRevision) return false;
            return true;
        }
        
        /**
         * Mark a record terminal after orchestrator skip/failure.
         */
        function markRecordTerminal(record, status, reason) {
            if (!record || record.stale) return;
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
        
        function isRecordActive(record) {
            return !!(record
                && record.recordId
                && scope.adapterContract
                && typeof scope.adapterContract.isRecordActive === 'function'
                && scope.adapterContract.isRecordActive(record));
        }
        
        function getRecordStatus(record, fallback = '') {
            if (!record || !scope.adapterContract || typeof scope.adapterContract.getRecordStatus !== 'function') return fallback || '';
            return scope.adapterContract.getRecordStatus(record, fallback || '');
        }
        
        function isRecordRequestActive(record) {
            return !!(record
                && scope.adapterContract
                && typeof scope.adapterContract.isRecordRequestActive === 'function'
                && scope.adapterContract.isRecordRequestActive(record));
        }
        
        function hasRenderedTranslation(record) {
            return !!(record && !record.stale && record.renderedText);
        }
        
        function getSpriteObservationStatus(record, fallback = 'detected') {
            if (!record) return fallback;
            const current = getRecordStatus(record, '');
            if (current === 'pending' || current === 'translating') return current;
            if (hasRenderedTranslation(record)) return 'completed';
            if (record.skipReason) return 'skipped';
            if (current === 'detected' || current === 'completed' || current === 'skipped' || current === 'failed') return current;
            return fallback;
        }

        return { buildTextGroups, canContinueTextGroup, createTextGroup, createOrUpdateEntry, shouldDeferSpriteEntry, observeEntry, observeEntryWhenVisibleOrActive, requestEntryTranslation, retireSpriteEntry, restoreEntrySource, applyRenderCommand, getRenderGeneration, isRenderTargetCurrent, handleRenderRejected, completeEntryFromCommand, isEntryCommandCurrent, markRecordTerminal, shouldKeepRecordAfterRenderRejection, isRenderApplicationFailure, normalizeRenderRejectionReason, isRecordActive, getRecordStatus, isRecordRequestActive, hasRenderedTranslation, getSpriteObservationStatus };
    }

    defineRuntimeModule('adapters.spriteText.entries', { createController });
})();
