// Bitmap text adapter support: fallback run-record grouping.
// Each controller receives one adapter instance scope from bitmap-text.js.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'adapters.bitmapText.fallbackRunRecords',
        factory() {

    function createController(scope = {}) {
        const { ADAPTER_ID, ADAPTER_LABEL, SURFACE_TYPE, RENDER_STRATEGY, BITMAP_PRIORITY, DRAW_WRAPPER_TOKEN, MUTATION_WRAPPER_TOKEN, FRAME_FLUSH_TOKEN, SMALL_TEXT_TOKEN, NORMAL_CHAR_TOKEN, GAP_MIN, GAP_RATIO } = scope;
        const renderTransaction = scope.renderTransaction;
        const { observeEntry, requestEntryTranslation, isEntryActive, getEntryStatus, getEntryObservationStatus, retireEntry } = scope.controllerFacades.records;
        const { ensureBitmapState, getBitmapState, nextDrawOrder, recordNativeTextForReplay } = scope.controllerFacades.replay;
        const { sanitizeVisibleText, isStandaloneGlyphText, safePrepareText, describeEntryEligibility, recordDrawTrace, bitmapTraceDetails, cloneTraceRect, isValidRect, logTextDetected, updateItem, stringify, finiteNumber } = scope.controllerFacades.textUtils;

        function flushFallbackRunRecords(bitmap, runRecords, reason = 'manual') {
            if (!bitmap || !Array.isArray(runRecords) || !runRecords.length) return 0;
            const state = ensureBitmapState(bitmap);
            if (!state) return 0;
            const ready = runRecords.filter(finalizeRunRecordOwnership);
            if (!ready.length) return 0;
            return flushRunRecordGroups(bitmap, state, ready, reason);
        }
        
        function flushRunRecordGroups(bitmap, state, runRecords, reason = 'manual') {
            const groups = groupRunRecordsIntoLines(runRecords);
            const activationQueue = [];
            groups.forEach((group) => {
                const entry = createEntryFromGroup(bitmap, state, group);
                if (entry) registerBitmapEntry(state, entry, activationQueue);
            });
            activationQueue.forEach(requestEntryTranslation);
            scope.perf.count('bitmapText.flush.calls');
            scope.perf.count('bitmapText.flush.entries', activationQueue.length);
            scope.perf.top('bitmapText.flush.reason', reason || 'unknown');
            return activationQueue.length;
        }
        
        function finalizeRunRecordOwnership(runRecord) {
            if (!runRecord || !runRecord.ownershipToken) return false;
            if (!scope.adapterContract || typeof scope.adapterContract.finalizeTextClaim !== 'function') return false;
            const result = scope.adapterContract.finalizeTextClaim(runRecord.ownershipToken, {
                target: runRecord.bitmap,
                surfaceType: SURFACE_TYPE,
                mode: 'bitmapFallback',
                role: 'bitmap-run-record',
                text: runRecord.rawText,
                standaloneGlyph: isStandaloneGlyphText(sanitizeVisibleText(runRecord.visibleText || runRecord.rawText)),
            });
            if (result && result.status === 'claimed') return true;
            scope.perf.count('bitmapText.runRecord.ownershipRevoked');
            recordDrawTrace('bitmap.drawText.ownershipRevoked', runRecord.rawText, bitmapTraceDetails(
                runRecord.bitmap,
                runRecord.methodName,
                runRecord.rawText,
                runRecord.x,
                runRecord.y,
                {
                    ownerType: runRecord.ownerType || '',
                    reason: result && result.reason ? result.reason : 'ownership-revoked',
                    ownerAdapter: result && result.ownerAdapter ? result.ownerAdapter : '',
                }
            ));
            return false;
        }
        
        function groupRunRecordsIntoLines(runRecords) {
            const lines = new Map();
            runRecords.forEach((runRecord) => {
                if (!runRecord || !sanitizeVisibleText(runRecord.visibleText)) return;
                const key = `${Math.round(runRecord.y)}:${Math.round(runRecord.lineHeight)}:${runRecord.fontSignature || ''}`;
                if (!lines.has(key)) lines.set(key, []);
                lines.get(key).push(runRecord);
            });
        
            const groups = [];
            lines.forEach((lineRunRecords) => {
                lineRunRecords.sort((a, b) => a.x - b.x);
                let current = [];
                let last = null;
                lineRunRecords.forEach((runRecord) => {
                    if (!last || canMergeRunRecords(last, runRecord)) {
                        current.push(runRecord);
                    } else {
                        if (current.length) groups.push(current);
                        current = [runRecord];
                    }
                    last = runRecord;
                });
                if (current.length) groups.push(current);
            });
            return groups;
        }
        
        function canMergeRunRecords(left, right) {
            if (!left || !right) return false;
            if (left.fontSignature !== right.fontSignature) return false;
            if (left.align !== right.align) return false;
            const lineHeight = Math.max(1, Number(left.lineHeight || right.lineHeight) || 24);
            const gapLimit = Math.max(GAP_MIN, Math.ceil(lineHeight * GAP_RATIO));
            return getRunRecordBoundsX(right) - (getRunRecordBoundsX(left) + left.width) <= gapLimit;
        }
        
        function createEntryFromGroup(bitmap, state, group) {
            if (!bitmap || !state || !Array.isArray(group) || !group.length) return null;
            const bounds = group.reduce((acc, runRecord) => ({
                x1: Math.min(acc.x1, getRunRecordBoundsX(runRecord)),
                y1: Math.min(acc.y1, runRecord.y),
                x2: Math.max(acc.x2, getRunRecordBoundsX(runRecord) + Math.max(1, runRecord.width)),
                y2: Math.max(acc.y2, runRecord.y + Math.max(1, runRecord.lineHeight)),
            }), { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity });
            if (!isValidRect(bounds)) return null;
        
            const rawText = group.map((runRecord) => runRecord.rawText).join('');
            const visibleText = sanitizeVisibleText(group.map((runRecord) => runRecord.visibleText).join(''));
            if (!visibleText) return null;
        
            const dominant = group.reduce((best, runRecord) => {
                if (!best || Number(runRecord.width || 0) > Number(best.width || 0)) return runRecord;
                return best;
            }, null) || group[0];
            const maxWidth = Math.max(
                bounds.x2 - bounds.x1,
                ...group.map((runRecord) => Number(runRecord.maxWidth) || 0),
                1
            );
            const lineHeight = Math.max(...group.map((runRecord) => Number(runRecord.lineHeight) || 0), 1);
            const slotKey = [
                Math.round(group.length === 1 ? dominant.x : bounds.x1),
                Math.round(bounds.y1),
                Math.round(maxWidth),
                group.length === 1 ? dominant.align : 'left',
                dominant.fontSignature || '',
                dominant.ownerType || 'bitmap',
                dominant.methodName || 'drawText',
            ].join(':');
            const textSource = safePrepareText(rawText);
            const codecState = textSource.codecState;
            const translationSource = stringify(textSource.translationSource);
            const drawBoundary = cloneGroupDrawBoundary(group, dominant);
            const surfaceId = resolveGroupSurfaceId(group, state, drawBoundary);
        
            return {
                bitmap,
                state,
                key: slotKey,
                recordId: '',
                surfaceId,
                slotKey,
                rawText,
                visibleText,
                translationSource,
                normalizedSource: textSource.normalizedSource,
                codecState,
                renderedText: '',
                surfaceRevision: state.revision,
                sourceSurfaceId: firstStringFromGroup(group, 'sourceSurfaceId'),
                sourceRunId: firstStringFromGroup(group, 'sourceRunId'),
                sourceSlotKey: firstStringFromGroup(group, 'sourceSlotKey'),
                sourceUnitIds: collectSourceUnitIds(group),
                sourceSurfaceRevision: firstPositiveRevisionFromGroup(group),
                drawOrder: nextDrawOrder(state),
                drawParams: {
                    x: group.length === 1 ? dominant.x : bounds.x1,
                    y: bounds.y1,
                    maxWidth,
                    lineHeight,
                    align: group.length === 1 ? dominant.align : 'left',
                },
                bounds,
                drawState: dominant.drawState,
                backgroundPatches: group
                    .reduce((patches, runRecord) => {
                        if (!runRecord) return patches;
                        if (Array.isArray(runRecord.backgroundPatches) && runRecord.backgroundPatches.length) {
                            runRecord.backgroundPatches.forEach((patch) => patches.push(patch));
                        } else if (runRecord.backgroundPatch) {
                            patches.push(runRecord.backgroundPatch);
                        }
                        return patches;
                    }, [])
                    .filter((patch) => patch && patch.bitmap && patch.width > 0 && patch.height > 0),
                methodName: dominant.methodName || 'drawText',
                ownerType: dominant.ownerType || 'bitmap',
                sourceRunRecords: group,
                drawBoundary,
                ownershipToken: dominant.ownershipToken || (group[0] && group[0].ownershipToken) || null,
                createdAt: Date.now(),
                lastSeenAt: Date.now(),
                stale: false,
            };
        }
        
        function registerBitmapEntry(state, entry, activationQueue) {
            const existing = state.entries.get(entry.key);
            if (existing && existing.visibleText === entry.visibleText) {
                refreshExistingEntry(existing, entry);
                const eligibility = describeEntryEligibility(existing);
                let observationStatus = getEntryObservationStatus(existing, 'detected');
                if (!eligibility.eligible) {
                    existing.skipReason = eligibility.reason || 'translation skipped';
                    observationStatus = 'skipped';
                }
                observeEntry(existing, eligibility.eligible ? observationStatus : 'skipped');
                recordDrawTrace('bitmap.entry.existing', existing.rawText, bitmapTraceDetails(existing.bitmap, existing.methodName, existing.rawText, existing.drawParams && existing.drawParams.x, existing.drawParams && existing.drawParams.y, {
                    recordId: existing.recordId || '',
                    slotKey: existing.slotKey || '',
                    status: getEntryStatus(existing, observationStatus),
                    reason: eligibility.eligible ? '' : (existing.skipReason || 'translation skipped'),
                    category: eligibility.category || '',
                    ownerType: existing.ownerType || '',
                    sourceRunRecords: countSourceRunRecords(existing),
                    bounds: cloneTraceRect(existing.bounds),
                }));
                if (eligibility.eligible && getEntryStatus(existing, 'detected') === 'detected') activationQueue.push(existing);
                return existing;
            }
            if (existing) retireEntry(existing, 'bitmap-entry-replaced', 'stale');
        
            entry.recordId = `bitmap:${state.id}:${(++scope.nextEntryId).toString(36)}`;
            state.entries.set(entry.key, entry);
            const eligibility = describeEntryEligibility(entry);
            let observationStatus = 'detected';
            if (!eligibility.eligible) {
                entry.skipReason = eligibility.reason || 'translation skipped';
                observationStatus = 'skipped';
            }
            observeEntry(entry, observationStatus);
            recordNativeTextForReplay(entry);
            logTextDetected(entry);
            recordDrawTrace(eligibility.eligible ? 'bitmap.entry.detected' : 'bitmap.entry.skipped', entry.rawText, bitmapTraceDetails(entry.bitmap, entry.methodName, entry.rawText, entry.drawParams && entry.drawParams.x, entry.drawParams && entry.drawParams.y, {
                recordId: entry.recordId || '',
                slotKey: entry.slotKey || '',
                status: getEntryStatus(entry, observationStatus),
                reason: eligibility.eligible ? '' : (entry.skipReason || 'translation skipped'),
                category: eligibility.category || '',
                ownerType: entry.ownerType || '',
                sourceRunRecords: countSourceRunRecords(entry),
                bounds: cloneTraceRect(entry.bounds),
            }));
        
            if (eligibility.eligible && entry.normalizedSource) {
                activationQueue.push(entry);
            } else if (isEntryActive(entry) && (!eligibility.eligible || !entry.normalizedSource)) {
                updateItem(entry, { status: 'skipped' }, 'item.skipped', {
                    reason: entry.skipReason || (entry.normalizedSource ? 'translation skipped' : 'emptyNormalized'),
                    category: eligibility.category || '',
                });
            }
            return entry;
        }

        function getRunRecordBoundsX(runRecord) {
            return finiteNumber(runRecord && runRecord.boundsX, finiteNumber(runRecord && runRecord.x, 0));
        }
        
        function refreshExistingEntry(existing, fresh) {
            existing.rawText = fresh.rawText;
            existing.visibleText = fresh.visibleText;
            existing.translationSource = fresh.translationSource;
            existing.normalizedSource = fresh.normalizedSource;
            existing.codecState = fresh.codecState;
            existing.surfaceRevision = fresh.surfaceRevision;
            existing.sourceSurfaceId = fresh.sourceSurfaceId;
            existing.sourceRunId = fresh.sourceRunId;
            existing.sourceSlotKey = fresh.sourceSlotKey;
            existing.sourceUnitIds = fresh.sourceUnitIds;
            existing.sourceSurfaceRevision = fresh.sourceSurfaceRevision;
            existing.drawOrder = fresh.drawOrder;
            existing.drawParams = fresh.drawParams;
            existing.bounds = fresh.bounds;
            existing.drawState = fresh.drawState;
            existing.backgroundPatches = fresh.backgroundPatches;
            existing.methodName = fresh.methodName;
            existing.ownerType = fresh.ownerType;
            existing.sourceRunRecords = fresh.sourceRunRecords;
            existing.drawBoundary = fresh.drawBoundary;
            existing.ownershipToken = fresh.ownershipToken;
            existing.lastSeenAt = Date.now();
            existing.stale = false;
        }

        function countSourceRunRecords(entry) {
            return Array.isArray(entry && entry.sourceRunRecords) ? entry.sourceRunRecords.length : 0;
        }

        function cloneGroupDrawBoundary(group, dominant) {
            const source = dominant && dominant.drawBoundary && typeof dominant.drawBoundary === 'object'
                ? dominant.drawBoundary
                : (Array.isArray(group)
                    ? group.map((runRecord) => runRecord && runRecord.drawBoundary).find((boundary) => boundary && typeof boundary === 'object')
                    : null);
            return source ? renderTransaction.createSourceDrawBoundary(source) : null;
        }

        function resolveGroupSurfaceId(group, state, drawBoundary) {
            return firstStringFromGroup(group, 'sourceSurfaceId')
                || stringify(drawBoundary && drawBoundary.surfaceId || '')
                || stringify(state && state.id || '');
        }

        function firstStringFromGroup(group, key) {
            const list = Array.isArray(group) ? group : [];
            for (const runRecord of list) {
                const value = runRecord && runRecord[key];
                if (value !== undefined && value !== null && String(value)) return String(value);
            }
            return '';
        }

        function collectSourceUnitIds(group) {
            const ids = [];
            (Array.isArray(group) ? group : []).forEach((runRecord) => {
                const source = Array.isArray(runRecord && runRecord.sourceUnitIds) ? runRecord.sourceUnitIds : [];
                source.forEach((id) => {
                    const text = String(id || '');
                    if (text && ids.indexOf(text) < 0) ids.push(text);
                });
            });
            return ids;
        }

        function firstPositiveRevisionFromGroup(group) {
            const list = Array.isArray(group) ? group : [];
            for (const runRecord of list) {
                const revision = Number(runRecord && runRecord.sourceSurfaceRevision);
                if (Number.isFinite(revision) && revision > 0) return revision;
            }
            return 0;
        }

        return {
            flushFallbackRunRecords,
        };
    }

            return { create: createController };
        },
    });
})();
