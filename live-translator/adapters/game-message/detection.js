// Game message adapter support: detection.
// Owns one part of Window_Message/Game_Message integration behind a shared adapter scope.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'adapters.gameMessage.detection',
        factory() {

    function createController(scope = {}) {
        const { MESSAGE_RENDER_STRATEGY, MESSAGE_ACTIVE_PRIORITY, FORESIGHT_BASE_PRIORITY, diag, preview, telemetry, adapterContract } = scope;
        const { markDedicatedMessageWindow } = scope.controllerFacades.install;
        const { createEscapeAwarePayload } = scope.controllerFacades.text;
        const { isSessionCurrent, resetStreamState, beginMessageStreamPreview, setMessageTranslationSession, markMessageTranslationRequested, getMessageRenderSession, setMessageRequestSession } = scope.controllerFacades.session;
        const { getVerifiedMessageOrigin } = scope.controllerFacades.foresightHooks;
        const { createForesightPayload, requestForesightTranslation, pruneForesightRecords, getForesightSourceKey, applyStreamDelta } = scope.controllerFacades.foresightRecords;
        const { detachCurrentMessageRecord } = scope.controllerFacades.clear;
        const { detectMessageRecord, detectSkippedMessageRecord, describeMessageEligibility, getWindowType, setRecordPriority } = scope.controllerFacades.records;
        const { clearCurrentRequestToken, markRenderFailed, isAdapterContractFailure, errorLog } = scope.controllerFacades.render;

        /**
         * Observe and request translation for one complete narrative message.
         */
        function processCompleteMessage(windowInstance, message, sessionId) {
            markDedicatedMessageWindow(windowInstance);
            // Cached renders can arrive synchronously while native message setup is still unwinding.
            windowInstance._trProcessCompleteMessageDepth = (windowInstance._trProcessCompleteMessageDepth || 0) + 1;
            try {
                const payload = (message && typeof message === 'object' && ('resolved' in message || 'visible' in message))
                    ? message
                    : createEscapeAwarePayload(message, 'processComplete', {
                        messageOrigin: getVerifiedMessageOrigin(windowInstance),
                    });
                const eligibility = describeMessageEligibility(payload);
                if (!payload || !payload.visible) {
                    diag('[GameMessage] Skipping translation: empty message');
                    return;
                }

                const normalizedSource = payload.normalizedTranslationSource || String(payload.translationSource || '').trim();
                if (!eligibility.eligible) {
                    diag(`[GameMessage] Skipping translation: "${preview(payload.visible)}"`);
                    detectSkippedMessageRecord(windowInstance, payload, sessionId, eligibility.reason || 'translation skipped', {
                        reason: eligibility.reason || 'translation skipped',
                        category: eligibility.category || '',
                        length: normalizedSource.length,
                    });
                    return;
                }

                if (telemetry && typeof telemetry.logTextDetected === 'function') {
                    telemetry.logTextDetected('message', payload.visible, 0, 0, {
                        windowType: getWindowType(windowInstance),
                    });
                }

                detachCurrentMessageRecord(windowInstance, 'message-translation-replaced');
                setMessageTranslationSession(windowInstance, sessionId);
                markMessageTranslationRequested(windowInstance);
                const record = detectMessageRecord(windowInstance, payload, sessionId);
                if (!record) {
                    resetStreamState(windowInstance);
                    return;
                }
                const recordId = record.id || '';
                beginMessageStreamPreview(windowInstance, sessionId);

                const requestToken = { __messageRenderRequestToken: true };
                setMessageRequestSession(windowInstance, requestToken, sessionId, recordId, MESSAGE_ACTIVE_PRIORITY);

                let requested = false;
                try {
                    const streamEnabled = scope.disableStreaming !== true;
                    const requestOptions = {
                        hook: 'message',
                        stream: streamEnabled,
                        priority: MESSAGE_ACTIVE_PRIORITY,
                        renderStrategy: MESSAGE_RENDER_STRATEGY,
                        metadata: {
                            sessionId,
                            windowType: getWindowType(windowInstance),
                            detachedCacheable: true,
                        },
                    };
                    if (streamEnabled) {
                        requestOptions.onDelta = (partial) => applyStreamDelta(windowInstance, payload, sessionId, partial);
                    }
                    requested = adapterContract.requestItemTranslation(record, requestOptions);
                    if (!requested || requested.handled !== true) {
                        clearCurrentRequestToken(windowInstance, requestToken);
                        markRenderFailed(record, 'translation request failed', {
                            sessionId,
                            windowType: getWindowType(windowInstance),
                        });
                        return;
                    }
                } catch (error) {
                    clearCurrentRequestToken(windowInstance, requestToken);
                    if (isAdapterContractFailure(error)) throw error;
                    markRenderFailed(record, error && error.message ? error.message : String(error || 'translation request failed'), {
                        sessionId,
                        windowType: getWindowType(windowInstance),
                    });
                    errorLog('[GameMessage] Translation request failed', error);
                    return;
                }

                const renderSession = getMessageRenderSession(windowInstance);
                if (renderSession.requestToken === requestToken
                    && renderSession.recordId === recordId
                    && renderSession.recordSessionId === sessionId
                    && isSessionCurrent(windowInstance, sessionId)) {
                    setMessageRequestSession(windowInstance, requestToken, sessionId, recordId, MESSAGE_ACTIVE_PRIORITY);
                }
                setRecordPriority(record, MESSAGE_ACTIVE_PRIORITY, 'message-visible');
                scheduleForesightTranslations(windowInstance, payload, sessionId);
            } finally {
                windowInstance._trProcessCompleteMessageDepth = Math.max(0, (windowInstance._trProcessCompleteMessageDepth || 1) - 1);
            }
        }

        /**
         * Pre-translate immediately upcoming linear Show Text commands.
         */
        function scheduleForesightTranslations(windowInstance, currentPayload, sessionId) {
            if (!scope.foresightEnabled || !windowInstance || !currentPayload) return 0;
            pruneForesightRecords();
            const blocks = collectUpcomingMessageBlocks(windowInstance, currentPayload);
            if (!blocks.length) return 0;

            let scheduled = 0;
            const seenSources = new Set([getForesightSourceKey(currentPayload)]);
            blocks.forEach((block, index) => {
                const priorityOffset = Number.isFinite(Number(block && block.priorityOffset))
                    ? Math.max(0, Math.floor(Number(block.priorityOffset)))
                    : scheduled;
                const priority = FORESIGHT_BASE_PRIORITY - priorityOffset;
                if (!block || priority < 1) return;
                const payload = createForesightPayload(windowInstance, block);
                const sourceKey = getForesightSourceKey(payload);
                if (!payload || !sourceKey || seenSources.has(sourceKey)) return;
                seenSources.add(sourceKey);
                if (requestForesightTranslation(windowInstance, payload, priority, {
                    index,
                    sessionId,
                    interpreterId: block.interpreterId || '',
                    listId: block.listId || '',
                    commonEventId: block.commonEventId,
                    commonEventName: block.commonEventName || '',
                    nestedListType: block.nestedListType || '',
                    nestedListName: block.nestedListName || '',
                    nestedListPath: block.nestedListPath || '',
                    nestedListIndex: block.nestedListIndex,
                    branchDepth: block.branchDepth,
                    branchPath: block.branchPath,
                    priorityOffset: block.priorityOffset,
                    diagnostics: block.foresightDiagnostics || null,
                    budget: block.foresightBudget || (block.foresightDiagnostics && block.foresightDiagnostics.budget) || null,
                    messageStartIndex: block.startIndex,
                    messageNextIndex: block.nextIndex,
                })) {
                    scheduled += 1;
                }
            });
            return scheduled;
        }

        /**
         * Find message blocks that can run after the current click without branching.
         */
        function collectUpcomingMessageBlocks(windowInstance, currentPayload) {
            if (!scope.foresightEnabled || !scope.foresightScanner || typeof scope.foresightScanner.collectUpcomingMessageBlocks !== 'function') return [];
            return scope.foresightScanner.collectUpcomingMessageBlocks({
                currentMessageOrigin: currentPayload && currentPayload.messageOrigin,
            });
        }

        return {
            processCompleteMessage,
            scheduleForesightTranslations,
            collectUpcomingMessageBlocks,
        };
    }

            return { create: createController };
        },
    });
})();
