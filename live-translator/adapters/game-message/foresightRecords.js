// Game message adapter support: foresightRecords.
// Owns one part of Window_Message/Game_Message integration behind a shared adapter scope.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before adapters/game-message/foresightRecords.js.');
    }

    function createController(scope = {}) {
        const { MESSAGE_RENDER_STRATEGY, FORESIGHT_RECORD_TTL_MS, globalScope, preview, stripControls, adapterContract, foresightRecordsBySource } = scope;
        const callScope = (name) => (...args) => scope[name](...args);
        const { createEscapeAwarePayload, restoreStreamingText, isCurrentTranslation, clearForesightSnapshot, createObservation, createMessageRecord, getWindowId, getWindowType, observeMessageRecord, retireItem, markRenderFailed, isAdapterContractFailure, redrawMessageText } = Object.fromEntries(['createEscapeAwarePayload', 'restoreStreamingText', 'isCurrentTranslation', 'clearForesightSnapshot', 'createObservation', 'createMessageRecord', 'getWindowId', 'getWindowType', 'observeMessageRecord', 'retireItem', 'markRenderFailed', 'isAdapterContractFailure', 'redrawMessageText'].map((name) => [name, callScope(name)]));

        function getGlobalGameMessage() {
            return globalScope.$gameMessage || null;
        }

        function integerIndex(value) {
            const numeric = Number(value);
            return Number.isInteger(numeric) ? numeric : null;
        }

        function createForesightPayload(windowInstance, block) {
            if (!block) return null;
            const resolved = convertMessageTextForForesight(windowInstance, block.rawText);
            return createEscapeAwarePayload(resolved, 'foresight', {
                rawText: block.rawText,
            });
        }

        function convertMessageTextForForesight(windowInstance, rawText) {
            const value = String(rawText || '');
            try {
                if (windowInstance && typeof windowInstance.convertEscapeCharacters === 'function') {
                    return windowInstance.convertEscapeCharacters(value);
                }
            } catch (_) {}
            return value;
        }

        function requestForesightTranslation(windowInstance, payload, priority, context = {}) {
            if (!scope.foresightEnabled) return false;
            const sourceKey = getForesightSourceKey(payload);
            if (!windowInstance || !payload || !sourceKey) return false;
            if (foresightRecordsBySource.has(sourceKey)) return false;

            const recordId = createForesightRecordId(windowInstance, payload);
            const slotKey = `foresight:${hashTextForId(sourceKey)}`;
            const metadata = {
                sessionId: context.sessionId || 0,
                windowType: getWindowType(windowInstance),
                detachedCacheable: true,
                foresight: true,
                foresightIndex: context.index || 0,
                foresightPriority: priority,
                foresightBudget: context.budget && typeof context.budget === 'object'
                    ? Object.assign({}, context.budget)
                    : null,
                interpreterId: context.interpreterId || '',
                listId: context.listId || '',
                commonEventId: context.commonEventId === null || context.commonEventId === undefined
                    ? null
                    : (Number.isFinite(Number(context.commonEventId)) ? Number(context.commonEventId) : null),
                commonEventName: context.commonEventName || '',
                nestedListType: context.nestedListType || '',
                nestedListName: context.nestedListName || '',
                nestedListPath: context.nestedListPath || '',
                nestedListIndex: context.nestedListIndex === null || context.nestedListIndex === undefined
                    ? null
                    : (Number.isFinite(Number(context.nestedListIndex)) ? Number(context.nestedListIndex) : null),
                branchDepth: Number.isFinite(Number(context.branchDepth)) ? Number(context.branchDepth) : 0,
                branchPath: Array.isArray(context.branchPath) ? context.branchPath.slice() : [],
                priorityOffset: Number.isFinite(Number(context.priorityOffset)) ? Number(context.priorityOffset) : 0,
                messageStartIndex: Number.isFinite(Number(context.messageStartIndex)) ? Number(context.messageStartIndex) : null,
                messageNextIndex: Number.isFinite(Number(context.messageNextIndex)) ? Number(context.messageNextIndex) : null,
            };
            if (context.diagnostics && typeof context.diagnostics === 'object') {
                if (shouldAttachForesightDiagnosticsMetadata()) {
                    metadata.foresightDiagnostics = Object.assign({}, context.diagnostics);
                }
            }
            const observation = createObservation(windowInstance, payload, 0, 'detected');
            observation.id = recordId;
            observation.slotKey = slotKey;
            observation.priority = priority;
            observation.generation = 0;
            observation.visible = false;
            observation.onScreen = false;
            observation.screenState = 'background';
            observation.metadata = Object.assign({}, observation.metadata || {}, metadata);
            const record = createMessageRecord(observation, payload, 0, {
                windowInstance,
                windowType: getWindowType(windowInstance),
            });

            const observed = observeMessageRecord(record, 'item.detected');
            if (!observed || !observed.id) return false;
            const observedRecordId = observed.id;

            try {
                adapterContract.requestItemTranslation(record, {
                    hook: 'message',
                    priority,
                    renderStrategy: MESSAGE_RENDER_STRATEGY,
                    metadata,
                });
            } catch (error) {
                if (isAdapterContractFailure(error)) throw error;
                markRenderFailed(record, error && error.message ? error.message : String(error || 'foresight request failed'), metadata);
                return false;
            }

            foresightRecordsBySource.set(sourceKey, {
                record,
                recordId: observedRecordId,
                sourceKey,
                priority,
                slotKey,
                createdAt: Date.now(),
            });
            // Foresight records are intentionally detached background work, not
            // visible message text disappearing from the screen. Use a distinct
            // event name so diagnostics show this as prefetch lifecycle.
            retireItem(record, 'disappeared', 'message-foresight-detached', metadata, {
                eventType: 'item.prefetch_detached',
                lifecycleIntent: 'prefetch-detached',
                recordDetached: true,
            });
            return true;
        }

        function cancelForesightTranslations(reason = 'foresight-canceled') {
            if (!scope.foresightEnabled || !foresightRecordsBySource.size) return 0;
            let canceled = 0;
            Array.from(foresightRecordsBySource.values()).forEach((record) => {
                if (!record || !record.recordId) return;
                retireItem(record.record || record.recordId, 'stale', reason, {
                    foresight: true,
                    priority: record.priority,
                    translationPreserved: true,
                }, {
                    eventType: 'item.prefetch_canceled',
                    lifecycleIntent: 'prefetch-lost',
                });
                canceled += 1;
            });
            foresightRecordsBySource.clear();
            clearForesightSnapshot();
            return canceled;
        }

        function consumeForesightRecord(payload) {
            if (!scope.foresightEnabled) return null;
            pruneForesightRecords();
            const sourceKey = getForesightSourceKey(payload);
            if (!sourceKey) return null;
            const record = foresightRecordsBySource.get(sourceKey) || null;
            if (record) foresightRecordsBySource.delete(sourceKey);
            return record;
        }

        function pruneForesightRecords() {
            if (!scope.foresightEnabled) return;
            const cutoff = Date.now() - FORESIGHT_RECORD_TTL_MS;
            Array.from(foresightRecordsBySource.entries()).forEach(([key, record]) => {
                if (!record || Number(record.createdAt) < cutoff) foresightRecordsBySource.delete(key);
            });
        }

        function getForesightSourceKey(payload) {
            return String((payload && (payload.normalizedTranslationSource || payload.translationSource || payload.visible)) || '').trim();
        }

        function createForesightRecordId(windowInstance, payload) {
            scope.nextForesightId += 1;
            return `message:${getWindowId(windowInstance)}:foresight:${hashTextForId(getForesightSourceKey(payload))}:${scope.nextForesightId.toString(36)}`;
        }

        function hashTextForId(value) {
            const text = String(value || '');
            let hash = 0;
            for (let index = 0; index < text.length; index += 1) {
                hash = ((hash << 5) - hash) + text.charCodeAt(index);
                hash |= 0;
            }
            return Math.abs(hash).toString(36) || '0';
        }

        function shouldAttachForesightDiagnosticsMetadata() {
            const policy = globalScope.LiveTranslatorDiagnosticsPolicy;
            if (policy && typeof policy.getSnapshotPolicy === 'function') {
                const snapshotPolicy = policy.getSnapshotPolicy({
                    globalScope,
                    settings: scope.settings || {},
                });
                return snapshotPolicy && snapshotPolicy.captureForesightMetadata === true;
            }
            if (policy && typeof policy.isDetailViewEnabled === 'function') {
                return policy.isDetailViewEnabled({
                    globalScope,
                    settings: scope.settings || {},
                }) === true;
            }
            const settings = scope.settings && typeof scope.settings === 'object' ? scope.settings : {};
            const diagnostics = settings.diagnostics && typeof settings.diagnostics === 'object'
                ? settings.diagnostics
                : null;
            if (diagnostics && Object.prototype.hasOwnProperty.call(diagnostics, 'performanceMode')) {
                return diagnostics.performanceMode !== true;
            }
            if (diagnostics && Object.prototype.hasOwnProperty.call(diagnostics, 'detailView')) {
                return diagnostics.detailView === true;
            }
            return true;
        }

        /**
         * Convert a streaming partial into a preview redraw candidate.
         */
        function applyStreamDelta(windowInstance, payload, sessionId, partial) {
            const requestToken = windowInstance && windowInstance._trMessageRequestToken;
            if (!isCurrentTranslation(windowInstance, sessionId, requestToken)) return;
            if (typeof partial !== 'string' || !partial) return;
            const restored = restoreStreamingText(partial, payload);
            if (!restored || restored === windowInstance._trStreamText) return;
            const restoredVisible = stripControls(restored || '').trim();
            if (!restoredVisible) return;
            windowInstance._trStreamText = restored;
            windowInstance._trStreamSessionId = sessionId;
            // Queue one visual-only preview redraw for the newest delta. Final
            // translation render still owns the real message lifecycle.
            redrawMessageText(windowInstance, restored, sessionId, {
                streamingPreview: true,
                deferUntilUpdate: true,
            });
        }

        return {
            getGlobalGameMessage,
            integerIndex,
            createForesightPayload,
            convertMessageTextForForesight,
            requestForesightTranslation,
            cancelForesightTranslations,
            consumeForesightRecord,
            pruneForesightRecords,
            getForesightSourceKey,
            createForesightRecordId,
            hashTextForId,
            applyStreamDelta,
        };
    }

    defineRuntimeModule('adapters.gameMessage.foresightRecords', { create: createController });
})();
