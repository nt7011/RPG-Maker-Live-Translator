// Game message adapter support: records.
// Owns one part of Window_Message/Game_Message integration behind a shared adapter scope.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    const requireRuntimeModule = globalScope.LiveTranslatorRequire;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before adapters/game-message/records.js.');
    }
    if (typeof requireRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module require is unavailable before adapters/game-message/records.js.');
    }
    const renderTransaction = requireRuntimeModule('runtime.renderTransaction');

    function createController(scope = {}) {
        const { MESSAGE_ADAPTER_ID, MESSAGE_RENDER_STRATEGY, MESSAGE_ACTIVE_PRIORITY, MESSAGE_BACKGROUND_PRIORITY, stripControls, adapterContract, messageRecordsById, renderTargets, detachedRecords, bitmapGlyphSources } = scope;
        const { resolveMessageStartCoordinates } = scope.controllerFacades.install;
        const { consumeForesightRecord } = scope.controllerFacades.foresightRecords;
        const { attachMessageRecordSession, getMessageRenderSession, setMessageRenderRetained, getCurrentMessageSessionId } = scope.controllerFacades.session;
        const { applyRenderCommand, getLifecycleRecord, getRenderGeneration, isRenderTargetCurrent, handleRenderRejected, retireDetachedRecord, handleRequestFailed, handleRequestSkipped, getMessageScreenState } = scope.controllerFacades.render;

        /**
         * Subscribe once to orchestrator events needed by this adapter.
         */
        function installOrchestratorSubscription() {
            adapterContract.subscribeRecords({
                token: MESSAGE_RENDER_STRATEGY,
                records: renderTargets,
                renderStrategy: MESSAGE_RENDER_STRATEGY,
                getLifecycleRecord: getLifecycleRecord,
                getRenderGeneration: getRenderGeneration,
                isRenderTargetCurrent: isRenderTargetCurrent,
                onRenderQueued: applyRenderCommand,
                onRenderRejected: handleRenderRejected,
                onFailed(target, event, route) {
                    handleRequestFailed(target, event, route.recordId);
                },
                onSkipped(target, event, route) {
                    handleRequestSkipped(target, event, route.recordId);
                },
                onMissingRecord(route, event, command) {
                    const recordId = route && route.recordId ? route.recordId : '';
                    if (!recordId) return;
                    if (route.eventType === 'item.render_queued') {
                        retireDetachedRecord(recordId, 'message-detached-completed', {
                            commandId: command && command.id ? command.id : '',
                        });
                    } else if (route.eventType === 'item.failed') {
                        retireDetachedRecord(recordId, 'message-detached-failed', event && event.details || null);
                    } else if (route.eventType === 'item.skipped') {
                        retireDetachedRecord(recordId, 'message-detached-skipped', event && event.details || null);
                    }
                },
            });
        }

        /**
         * Create and report a message text observation to the orchestrator.
         */
        function detectMessageRecord(windowInstance, payload, sessionId) {
            const observation = createObservation(windowInstance, payload, sessionId, 'detected');
            const foresightRecord = consumeForesightRecord(payload);
            let record = null;
            if (foresightRecord && foresightRecord.recordId) {
                observation.id = foresightRecord.recordId;
                observation.metadata = Object.assign({}, observation.metadata || {}, {
                    foresightConsumed: true,
                    foresightPriority: foresightRecord.priority,
                    foresightRecordId: foresightRecord.recordId,
                });
                record = foresightRecord.record || null;
            }
            record = syncMessageRecord(record || createMessageRecord(observation, payload, sessionId), observation, payload, sessionId, {
                windowInstance,
                windowType: getWindowType(windowInstance),
            });
            const observed = observeMessageRecord(record, 'item.detected');
            if (!observed || !observed.id) return '';
            const recordId = observed.id;
            if (record && record.id !== recordId) record.id = recordId;
            attachMessageRecordSession(windowInstance, record, payload, sessionId, observation);
            rememberRenderTarget(windowInstance, record, payload, sessionId);
            return record;
        }

        /**
         * Report a locally skipped message, used only for empty normalized source.
         */
        function detectSkippedMessageRecord(windowInstance, payload, sessionId, reason, details = null) {
            const observation = createObservation(windowInstance, payload, sessionId, 'skipped');
            const record = createMessageRecord(observation, payload, sessionId, {
                windowInstance,
                windowType: getWindowType(windowInstance),
            });
            const observed = observeMessageRecord(record, 'item.skipped');
            if (!observed || !observed.id) return '';
            updateItem(record, { status: 'skipped' }, 'item.skipped', Object.assign({
                reason,
                sessionId,
                windowType: getWindowType(windowInstance),
            }, details || {}));
            return record.id || '';
        }

        function describeMessageEligibility(payload) {
            return adapterContract.describeTextEligibility({
                sourceAdapter: MESSAGE_ADAPTER_ID,
                hook: 'message',
                surfaceType: 'message',
                rawText: payload && payload.resolved ? payload.resolved : '',
                visibleText: payload && payload.visible ? payload.visible : '',
                original: payload && payload.visible ? payload.visible : '',
                translationSource: payload && payload.translationSource ? payload.translationSource : '',
                normalizedSource: payload && payload.normalizedTranslationSource ? payload.normalizedTranslationSource : '',
            });
        }

        /**
         * Build the canonical observation shape for one message session.
         */
        function createObservation(windowInstance, payload, sessionId, status) {
            const coords = resolveMessageStartCoordinates(windowInstance);
            const screenState = getMessageScreenState(windowInstance);
            const onScreen = screenState === 'visible';
            const windowType = getWindowType(windowInstance);
            const recordId = createRecordId(windowInstance, sessionId, status === 'skipped' ? 'skip' : '');
            const surfaceId = `message:${getWindowId(windowInstance)}`;
            const slotKey = `session:${sessionId || 0}`;
            return {
                id: recordId,
                sourceAdapter: MESSAGE_ADAPTER_ID,
                hook: 'message',
                hookLabel: 'Game Message',
                surfaceId,
                slotKey,
                surfaceType: 'message',
                status,
                rawText: payload && payload.resolved ? payload.resolved : '',
                convertedText: payload && payload.resolved ? payload.resolved : '',
                visibleText: payload && payload.visible ? payload.visible : '',
                original: payload && payload.visible ? payload.visible : '',
                translationSource: payload && payload.translationSource ? payload.translationSource : '',
                normalizedSource: payload && payload.normalizedTranslationSource ? payload.normalizedTranslationSource : '',
                priority: status === 'skipped' ? undefined : MESSAGE_ACTIVE_PRIORITY,
                generation: sessionId || 0,
                renderStrategy: MESSAGE_RENDER_STRATEGY,
                drawBoundary: createMessageDrawBoundary({
                    recordId,
                    surfaceId,
                    slotKey,
                    sessionId,
                    status,
                    onScreen,
                    screenState,
                    windowType,
                }),
                onScreen,
                screenState,
                visible: onScreen,
                x: coords.x,
                y: coords.y,
                bounds: { x: coords.x, y: coords.y, width: 0, height: 0 },
                windowType,
                metadata: {
                    sessionId,
                    windowType,
                    screenState,
                },
            };
        }

        function createMessageDrawBoundary(input = {}) {
            const source = input && typeof input === 'object' ? input : {};
            const beforeNativePaint = source.onScreen === true && source.status !== 'skipped';
            return renderTransaction.createSourceDrawBoundary({
                beforeNativePaint,
                adapterId: MESSAGE_ADAPTER_ID,
                itemId: source.recordId || '',
                recordId: source.recordId || '',
                surfaceId: source.surfaceId || '',
                slotKey: source.slotKey || '',
                generation: Number(source.sessionId) || 0,
                reason: beforeNativePaint ? 'message-source-draw-observed' : 'message-source-draw-committed',
                details: {
                    surfaceType: 'message',
                    status: source.status || '',
                    screenState: source.screenState || '',
                    windowType: source.windowType || '',
                },
            });
        }

        function createMessageRecord(observation, payload, sessionId, options = {}) {
            return syncMessageRecord({
                id: observation && observation.id ? String(observation.id) : '',
            }, observation, payload, sessionId, options);
        }

        function syncMessageRecord(record, observation, payload, sessionId, options = {}) {
            const target = record && typeof record === 'object' ? record : {};
            target.id = observation && observation.id ? String(observation.id) : (target.id || '');
            target.observation = observation || target.observation || null;
            target.payload = payload || target.payload || null;
            target.sessionId = sessionId || 0;
            target.windowInstance = options.windowInstance || target.windowInstance || null;
            target.windowType = options.windowType || target.windowType || 'Window_Message';
            target.updatedAt = Date.now();
            return target;
        }

        /**
         * Build a stable record id for one message window/session.
         */
        function createRecordId(windowInstance, sessionId, suffix = '') {
            const base = `message:${getWindowId(windowInstance)}:${sessionId || 0}`;
            return suffix ? `${base}:${suffix}` : base;
        }

        /**
         * Return or assign a lightweight id for one message window.
         */
        function getWindowId(windowInstance) {
            if (!windowInstance) return 'fallback';
            if (!windowInstance._uniqueId) {
                try { windowInstance._uniqueId = Math.random().toString(36).substring(2, 11); } catch (_) {}
            }
            return windowInstance._uniqueId || 'message-window';
        }

        /**
         * Return a diagnostic type for one message window.
         */
        function getWindowType(windowInstance) {
            return windowInstance && windowInstance.constructor && windowInstance.constructor.name
                ? windowInstance.constructor.name
                : 'Window_Message';
        }

        /**
         * Observe text through the orchestrator and isolate diagnostics failures.
         */
        function observeMessageRecord(record, eventType) {
            if (!record || !record.observation) return null;
            const observed = adapterContract.observeRecord(record, record.observation, { eventType }, {
                idField: 'id',
                registry: messageRecordsById,
            });
            if (observed && observed.id) {
                record.observation.id = record.id;
            }
            return observed;
        }

        /**
         * Patch an orchestrator item.
         */
        function updateItem(record, patch, eventType, details = null) {
            const target = resolveMessageRecord(record);
            if (!target) return null;
            return adapterContract.updateItem(target, patch || {}, { eventType, details });
        }

        /**
         * Record a message redraw decision without changing item lifecycle.
         */
        function recordDecision(record, type, message = '', details = null) {
            const target = resolveMessageRecord(record);
            if (!target) return null;
            return adapterContract.recordDecision(target, type, message, details);
        }

        function recordRenderAccepted(record, decision = {}) {
            const target = resolveMessageRecord(record);
            if (!target || typeof adapterContract.recordRenderAccepted !== 'function') return null;
            return adapterContract.recordRenderAccepted(target, decision);
        }

        function recordRenderDeferred(record, decision = {}) {
            const target = resolveMessageRecord(record);
            if (!target || typeof adapterContract.recordRenderDeferred !== 'function') return null;
            return adapterContract.recordRenderDeferred(target, decision);
        }

        function recordRenderRejected(record, decision = {}) {
            const target = resolveMessageRecord(record);
            if (!target || typeof adapterContract.recordRenderRejected !== 'function') return null;
            return adapterContract.recordRenderRejected(target, decision);
        }

        /**
         * Move an active message translation to background priority without canceling it.
         */
        function backgroundItem(record, reason, details = {}) {
            const target = resolveMessageRecord(record);
            if (!target) return null;
            return adapterContract.backgroundItem(target, Object.assign({
                priority: MESSAGE_BACKGROUND_PRIORITY,
                reason,
                screenState: 'background',
                detachedCacheable: true,
            }, details || {}));
        }

        /**
         * Change both orchestrator item priority and active subscriber priority.
         */
        function setRecordPriority(record, priority, reason) {
            const target = resolveMessageRecord(record);
            if (!target) return false;
            const result = adapterContract.setItemTranslationPriority(target, priority, reason);
            return !!(result && result.changed === true);
        }

        /**
         * Cancel an orchestrator-owned translation subscriber.
         */
        function cancelRecordTranslation(record, reason) {
            const target = resolveMessageRecord(record);
            return !!(adapterContract
                && typeof adapterContract.cancelItemTranslation === 'function'
                && target
                && adapterContract.cancelItemTranslation(target, reason).changed === true);
        }

        /**
         * Update orchestrator visibility for a still-attached message.
         */
        function setRecordVisibility(record, visible, details = {}) {
            const target = resolveMessageRecord(record);
            if (!target) return null;
            return adapterContract.setItemVisibility(target, visible === true, details);
        }

        /**
         * Retire an orchestrator item once no render target or subscriber remains.
         */
        function retireItem(record, status, reason, details = {}, options = {}) {
            const target = resolveMessageRecord(record);
            if (!target) return null;
            const retired = adapterContract.retireItem(target, status || 'disappeared', Object.assign({}, options || {}, {
                eventType: options.eventType || `item.${status || 'disappeared'}`,
                message: reason || '',
                details,
                recordDetached: options.recordDetached === true,
            }));
            if (target.id && options.recordDetached !== true) {
                messageRecordsById.delete(String(target.id));
            }
            return retired;
        }

        function resolveMessageRecord(target) {
            if (!target) return null;
            if (typeof target === 'object') {
                if (target.record && typeof target.record === 'object') return target.record;
                if (target.id || target.recordId || target.itemId) return target;
                return null;
            }
            const recordId = String(target || '');
            if (!recordId) return null;
            const renderTarget = renderTargets.get(recordId);
            if (renderTarget && renderTarget.record) return renderTarget.record;
            const detached = detachedRecords.get(recordId);
            if (detached && detached.record) return detached.record;
            return messageRecordsById.get(recordId) || null;
        }

        /**
         * Store the active object identity required to validate future render commands.
         */
        function rememberRenderTarget(windowInstance, record, payload, sessionId) {
            const targetRecord = resolveMessageRecord(record);
            const recordId = targetRecord && targetRecord.id ? String(targetRecord.id) : '';
            if (!windowInstance || !recordId) return;
            renderTargets.set(recordId, {
                record: targetRecord,
                windowInstance,
                payload,
                sessionId,
                windowType: getWindowType(windowInstance),
            });
            setMessageRenderRetained(windowInstance, false, '');
            detachedRecords.delete(recordId);
            rememberBitmapGlyphSource(recordId, payload, sessionId, windowInstance);
            forgetPendingBitmapGlyphSource(windowInstance);
        }

        /**
         * Detach a render target while preserving enough data for diagnostics.
         */
        function forgetRenderTarget(windowInstance, reason, details = {}) {
            const renderSession = getMessageRenderSession(windowInstance);
            const recordId = renderSession.recordId || '';
            if (!recordId) return '';
            const record = resolveMessageRecord(renderSession.record || recordId);
            const payload = renderSession.payload || null;
            const sessionId = renderSession.recordSessionId || 0;
            renderTargets.delete(recordId);
            forgetBitmapGlyphSource(recordId);
            detachedRecords.set(recordId, Object.assign({
                record,
                payload,
                sessionId,
                windowType: getWindowType(windowInstance),
                reason,
                detachedAt: Date.now(),
            }, details || {}));
            return recordId;
        }

        /**
         * Keep active message text available for bitmap glyph ownership checks.
         */
        function rememberBitmapGlyphSource(key, payload, sessionId, windowInstance) {
            if (!key || !payload) return false;
            const searchText = buildBitmapGlyphSearchText(payload);
            if (!searchText) return false;
            releaseBitmapGlyphSource(key, 'message-glyph-source-replaced');
            const ownershipClaim = claimMessageGlyphSource(searchText, key, sessionId, windowInstance);
            bitmapGlyphSources.set(String(key), {
                searchText,
                sessionId: sessionId || 0,
                windowId: getWindowId(windowInstance),
                ownershipClaim,
            });
            return true;
        }

        function rememberPendingBitmapGlyphSource(windowInstance, payload) {
            if (!windowInstance || !payload) return false;
            return rememberBitmapGlyphSource(getPendingBitmapGlyphSourceKey(windowInstance), payload, getCurrentMessageSessionId(windowInstance), windowInstance);
        }

        function forgetPendingBitmapGlyphSource(windowInstance) {
            const key = getPendingBitmapGlyphSourceKey(windowInstance);
            if (!key) return false;
            return releaseBitmapGlyphSource(key, 'pending-message-glyph-forgotten');
        }

        function forgetBitmapGlyphSource(recordId) {
            if (!recordId) return false;
            return releaseBitmapGlyphSource(String(recordId), 'message-glyph-forgotten');
        }

        function getPendingBitmapGlyphSourceKey(windowInstance) {
            if (!windowInstance) return '';
            return `pending:${getWindowId(windowInstance)}:${getCurrentMessageSessionId(windowInstance)}`;
        }

        function claimMessageGlyphSource(searchText, key, sessionId, windowInstance) {
            if (!adapterContract || typeof adapterContract.claimText !== 'function') return null;
            const claim = adapterContract.claimText({
                target: windowInstance || null,
                surfaceId: `message:${getWindowId(windowInstance)}:glyphs`,
                surfaceType: 'message',
                mode: 'messageGlyphSource',
                role: 'message-glyph-source',
                text: searchText,
                searchText,
                slotKey: String(key || ''),
                metadata: {
                    sessionId: sessionId || 0,
                    windowId: getWindowId(windowInstance),
                },
            });
            return claim && claim.status === 'claimed' && claim.token ? claim.token : null;
        }

        function releaseBitmapGlyphSource(key, reason) {
            const normalizedKey = String(key || '');
            if (!normalizedKey) return false;
            const source = bitmapGlyphSources.get(normalizedKey);
            if (source && source.ownershipClaim && adapterContract && typeof adapterContract.releaseTextClaim === 'function') {
                adapterContract.releaseTextClaim(source.ownershipClaim, reason || 'message-glyph-released');
            }
            return bitmapGlyphSources.delete(normalizedKey);
        }

        function buildBitmapGlyphSearchText(payload) {
            if (!payload) return '';
            return [
                payload.visible,
                payload.resolved,
                payload.translationSource,
                payload.normalizedTranslationSource,
            ].map(normalizeGlyphSearchText).filter(Boolean).join('\n');
        }

        function normalizeGlyphSearchText(text) {
            return stripControls(String(text ?? '')).replace(/\s+/g, '');
        }

        return {
            installOrchestratorSubscription,
            detectMessageRecord,
            detectSkippedMessageRecord,
            describeMessageEligibility,
            createObservation,
            createMessageRecord,
            syncMessageRecord,
            createRecordId,
            getWindowId,
            getWindowType,
            observeMessageRecord,
            updateItem,
            recordDecision,
            recordRenderAccepted,
            recordRenderDeferred,
            recordRenderRejected,
            backgroundItem,
            setRecordPriority,
            cancelRecordTranslation,
            setRecordVisibility,
            retireItem,
            resolveMessageRecord,
            rememberRenderTarget,
            forgetRenderTarget,
            rememberBitmapGlyphSource,
            rememberPendingBitmapGlyphSource,
            forgetPendingBitmapGlyphSource,
            forgetBitmapGlyphSource,
            getPendingBitmapGlyphSourceKey,
            claimMessageGlyphSource,
            releaseBitmapGlyphSource,
            buildBitmapGlyphSearchText,
            normalizeGlyphSearchText,
        };
    }

    defineRuntimeModule('adapters.gameMessage.records', { create: createController });
})();
