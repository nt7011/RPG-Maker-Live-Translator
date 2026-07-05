// Sprite text adapter support: parent run records.
// Documents the parent glyph-run responsibility without growing the facade.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'adapters.spriteText.parentRunRecords',
        factory() {

    function createController(scope = {}) {
        const renderTransaction = scope.renderTransaction;
        const { getSpriteObservationStatus, hasRenderedTranslation, isRecordActive, isRecordRequestActive } = scope.controllerFacades.entries;
        const { applyEligibilityToSpriteRecord, describeSpriteRecordEligibility, getBitmapState, logTextDetected, restoreTranslatedText, safePrepareText, updateItem } = scope.controllerFacades.state;
        const {
            claimGlyphGroupForRun,
            clearParentRunSlot,
            createParentRunSlotKey,
            isActiveParentRunSlot,
            parentRunLayerKey,
            registerParentRunSlot,
            removeParentRun,
        } = scope.controllerFacades.parentRunLifecycle;
        const { renderParentRunOverlay } = scope.controllerFacades.parentRunOverlay;
        const { createObservationSignature, isParentRunScreenVisible, markRecordVisibilitySynced, shouldPublishObservation } = scope.controllerFacades.visibility;
        const {
            errorMessage,
            getParentId,
            isAdapterContractFailure,
            isValidRect,
            sanitizeVisibleText,
            stringify,
            warn,
        } = scope.controllerFacades.utils;

        /**
         * Create or refresh a parent glyph run.
         */
        function createOrUpdateParentRun(parent, group, runMap) {
            const rawText = group.map((item) => item.rawText).join('');
            const trimmedText = sanitizeVisibleText(rawText);
            if (!trimmedText) return null;
            const key = group.map((item) => item.spriteState.id).join('|');
            const existing = runMap.get(key);
            const bounds = group.reduce((acc, item) => ({
                x1: Math.min(acc.x1, item.x),
                y1: Math.min(acc.y1, item.y),
                x2: Math.max(acc.x2, item.x + item.width),
                y2: Math.max(acc.y2, item.y + item.height),
            }), { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity });
            if (!isValidRect(bounds)) return null;
            const fontSignature = group[0] ? group[0].fontSignature : '';
            const layerKey = parentRunLayerKey(group);
            const slotKey = createParentRunSlotKey(group, bounds);
        
            if (existing && existing.rawText === rawText) {
                if (existing.slotKey && existing.slotKey !== slotKey) clearParentRunSlot(existing);
                existing.group = group;
                existing.bounds = bounds;
                existing.fontSignature = fontSignature;
                existing.layerKey = layerKey;
                existing.slotKey = slotKey;
                existing.drawBoundary = createParentRunDrawBoundary(existing, group, slotKey);
                existing.lastSeenAt = Date.now();
                claimGlyphGroupForRun(group, existing);
                registerParentRunSlot(existing);
                applyEligibilityToSpriteRecord(existing);
                scope.trackedParentRuns.add(existing);
                return existing;
            }
            if (existing) removeParentRun(existing, 'replaced');
        
            const textSource = safePrepareText(rawText);
            const codecState = textSource.codecState;
            const translationSource = stringify(textSource.translationSource);
            const runId = `str-${(++scope.nextRunId).toString(36)}`;
            const run = {
                id: runId,
                key,
                parent,
                group,
                rawText,
                trimmedText,
                codecState,
                translationSource,
                normalizedSource: textSource.normalizedSource,
                bounds,
                fontSignature,
                layerKey,
                slotKey,
                drawState: group[0] ? group[0].drawState : null,
                lineHeight: Math.max(...group.map((item) => Number(item.lineHeight) || 0), 1),
                renderedText: '',
                overlaySprite: null,
                overlayBitmap: null,
                recordId: `${scope.ADAPTER_ID}:run:${runId}`,
                recordKind: 'run',
                surfaceRevision: scope.nextRunId,
                createdAt: Date.now(),
                lastSeenAt: Date.now(),
                stale: false,
            };
            run.drawBoundary = createParentRunDrawBoundary(run, group, slotKey);
            applyEligibilityToSpriteRecord(run);
            runMap.set(key, run);
            scope.recordsByItemId.set(run.recordId, run);
            claimGlyphGroupForRun(group, run);
            scope.trackedParentRuns.add(run);
            registerParentRunSlot(run);
            logTextDetected(run, 'sprite-run');
            return run;
        }

        /**
         * Report a parent glyph run to TextOrchestrator.
         */
        function observeRun(run, status) {
            if (!run || run.stale || !isActiveParentRunSlot(run)) return null;
            const visible = isParentRunScreenVisible(run);
            const payload = {
                id: run.recordId,
                sourceAdapter: scope.ADAPTER_ID,
                hook: scope.HOOK_NAME,
                hookLabel: 'Sprite Text',
                surfaceId: `sprite-parent:${getParentId(run.parent)}`,
                slotKey: run.slotKey,
                surfaceType: scope.SURFACE_TYPE,
                status: status || getSpriteObservationStatus(run, 'detected'),
                rawText: run.rawText,
                visibleText: run.trimmedText,
                original: run.trimmedText,
                translationSource: run.translationSource,
                normalizedSource: run.normalizedSource,
                priority: scope.SPRITE_PRIORITY,
                generation: run.surfaceRevision,
                renderStrategy: scope.RENDER_STRATEGY,
                drawBoundary: createRunDrawBoundary(run),
                visible,
                screenState: visible ? 'visible' : 'hidden',
                bounds: run.bounds,
                metadata: {
                    mode: 'sprite-run',
                    glyphs: run.group ? run.group.length : 0,
                    slotKey: run.slotKey || '',
                },
            };
            if (!shouldPublishObservation(run, payload)) return payload;
            const observed = scope.adapterContract.observeRecord(run, payload, { eventType: `item.${payload.status}` }, {
                registry: scope.recordsByItemId,
            });
            if (observed) {
                run._trLastObservationSignature = createObservationSignature(payload);
                markRecordVisibilitySynced(run, payload.visible, payload.screenState, payload.priority);
            }
            return payload;
        }

        function createParentRunDrawBoundary(run, group, slotKey) {
            const source = findParentRunSourceBoundary(group);
            if (!source) return null;
            const sourceBoundaryIds = collectParentRunBoundaryIds(group);
            const details = Object.assign({}, source.details && typeof source.details === 'object' ? source.details : {}, {
                sourceBoundaryIds,
                sourceBoundaryCount: sourceBoundaryIds.length,
            });
            const generation = Number(run && run.surfaceRevision) || Number(source.generation) || 0;
            return renderTransaction.createSourceDrawBoundary(Object.assign({}, source, {
                id: `${run.recordId}:draw:${generation}`,
                adapterId: scope.ADAPTER_ID,
                itemId: run.recordId || source.itemId || '',
                recordId: run.recordId || source.recordId || '',
                surfaceId: `sprite-parent:${getParentId(run.parent)}`,
                slotKey: slotKey || run.slotKey || source.slotKey || '',
                generation,
                details,
            }));
        }

        function createRunDrawBoundary(run) {
            const source = run && run.drawBoundary && typeof run.drawBoundary === 'object'
                ? run.drawBoundary
                : null;
            if (!source) return null;
            const generation = Number(run.surfaceRevision) || Number(source.generation) || 0;
            return renderTransaction.createSourceDrawBoundary(Object.assign({}, source, {
                itemId: run.recordId || source.itemId || '',
                recordId: run.recordId || source.recordId || '',
                surfaceId: `sprite-parent:${getParentId(run.parent)}`,
                slotKey: run.slotKey || source.slotKey || '',
                generation,
            }));
        }

        function findParentRunSourceBoundary(group) {
            if (!Array.isArray(group)) return null;
            for (let index = 0; index < group.length; index += 1) {
                const boundary = readGlyphBoundary(group[index]);
                if (boundary) return boundary;
            }
            return null;
        }

        function collectParentRunBoundaryIds(group) {
            if (!Array.isArray(group)) return [];
            return group
                .map((item) => {
                    const boundary = readGlyphBoundary(item);
                    return boundary && boundary.id ? String(boundary.id) : '';
                })
                .filter((id, index, ids) => id && ids.indexOf(id) === index);
        }

        function readGlyphBoundary(item) {
            const entry = item && item.entry;
            if (entry && entry.drawBoundary && typeof entry.drawBoundary === 'object') return entry.drawBoundary;
            if (entry && entry.group && entry.group.drawBoundary && typeof entry.group.drawBoundary === 'object') {
                return entry.group.drawBoundary;
            }
            if (item && item.drawBoundary && typeof item.drawBoundary === 'object') return item.drawBoundary;
            return null;
        }

        /**
         * Keep inactive hidden glyph runs out of active intel until seen.
         */
        function observeRunWhenVisibleOrActive(run, status) {
            if (!run || run.stale) return null;
            if (!isRecordActive(run) && !isParentRunScreenVisible(run)) return null;
            return observeRun(run, status);
        }

        /**
         * Ask the orchestrator to translate one parent glyph run.
         */
        function requestRunTranslation(run) {
            if (!run || run.stale || isRecordRequestActive(run) || hasRenderedTranslation(run)) return false;
            if (!run.normalizedSource || !isActiveParentRunSlot(run)) return false;
            if (!isRecordActive(run)) {
                if (!isParentRunScreenVisible(run)) return false;
                observeRun(run, getSpriteObservationStatus(run, 'detected'));
                if (!isRecordActive(run)) return false;
            }
            const eligibility = describeSpriteRecordEligibility(run);
            if (!eligibility.eligible) {
                run.skipReason = eligibility.reason || 'translation skipped';
                updateItem(run, { status: 'skipped' }, 'item.skipped', {
                    reason: run.skipReason,
                    category: eligibility.category,
                    mode: 'sprite-run',
                });
                return false;
            }
            try {
                const requested = scope.adapterContract.requestItemTranslation(run, {
                    hook: scope.HOOK_NAME,
                    priority: scope.SPRITE_PRIORITY,
                    renderStrategy: scope.RENDER_STRATEGY,
                    metadata: {
                        mode: 'sprite-run',
                        glyphs: run.group ? run.group.length : 0,
                        slotKey: run.slotKey || '',
                    },
                });
                if (!requested || requested.handled !== true) {
                    updateItem(run, { status: 'failed' }, 'item.failed', { reason: 'translation request failed', mode: 'sprite-run' });
                    return false;
                }
                return true;
            } catch (error) {
                if (isAdapterContractFailure(error)) throw error;
                updateItem(run, { status: 'failed' }, 'item.failed', { reason: errorMessage(error), mode: 'sprite-run' });
                warn('[SpriteText] Failed to request glyph run translation.', error);
                return false;
            }
        }

        /**
         * Complete a parent glyph run from a render command.
         */
        function completeRunFromCommand(run, command) {
            const translated = stringify(command.text);
            const restored = restoreTranslatedText(translated, run.codecState, run.rawText);
            const visible = sanitizeVisibleText(restored);
            if (!visible || visible === run.trimmedText) {
                const reason = visible ? 'translated text matched original' : 'restored text empty';
                updateItem(run, { status: 'skipped' }, 'item.skipped', {
                    reason,
                    translationReceived: translated,
                    mode: 'sprite-run',
                });
                return createRenderDecision('committed', reason, {
                    translationReceived: translated,
                    mode: 'sprite-run',
                });
            }
            run.renderedText = restored;
            if (!renderParentRunOverlay(run, command.metadata && command.metadata.sourceHint || 'translation')) {
                run.renderedText = '';
                return createRenderDecision('rejected', 'sprite-run-render-failed', {
                    translationReceived: translated,
                    mode: 'sprite-run',
                });
            }
            updateItem(run, {
                status: 'completed',
                translation: restored,
                translationDrawn: restored,
            }, 'item.rendered', {
                mode: 'sprite-run',
                translationReceived: translated,
                translationDrawn: restored,
            });
            return createRenderDecision('committed', 'sprite-run-rendered', {
                translationReceived: translated,
                translationDrawn: restored,
                mode: 'sprite-run',
            });
        }

        function createRenderDecision(status, reason, details = null) {
            return {
                status,
                reason,
                details: details && typeof details === 'object' ? details : {},
            };
        }

        /**
         * Validate that a contract-gated target still matches a live parent glyph run.
         */
        function isRunCommandCurrent(run) {
            if (!run || run.stale || !isActiveParentRunSlot(run)) return false;
            return Array.isArray(run.group) && run.group.every((item) => {
                const entry = item && item.entry;
                const spriteState = item && item.spriteState;
                const bitmapState = spriteState && spriteState.bitmap ? getBitmapState(spriteState.bitmap) : null;
                return entry && !entry.stale && bitmapState && bitmapState.revision === entry.bitmapRevision;
            });
        }

        return { createOrUpdateParentRun, observeRun, observeRunWhenVisibleOrActive, requestRunTranslation, completeRunFromCommand, isRunCommandCurrent };
    }

            return { createController };
        },
    });
})();
