// Bitmap surface ledger.
//
// This module is the canonical store for physical bitmap facts: text draw
// attempts, committed draw units, pixel mutations, and copy lineage. It is
// intentionally independent from adapters. Hooks and services write facts here;
// ownership, translation lifecycle, and rendering policy are handled elsewhere.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'runtime.bitmap.surfaceLedger',
        requires: {
            rectGeometry: 'runtime.bitmap.rectGeometry',
            copyEdgeGeometry: 'runtime.bitmap.copyEdgeGeometry',
            surfaceDamage: 'runtime.bitmap.surfaceDamage',
            copyEdgeState: 'runtime.bitmap.copyEdgeState',
            copiedTextProjection: 'runtime.bitmap.copiedTextProjection',
        },
        factory({ rectGeometry, copyEdgeGeometry, surfaceDamage, copyEdgeState, copiedTextProjection }) {
            const cloneRect = rectGeometry.cloneRect;
            const sameRect = rectGeometry.sameRect;
            const rectsOverlap = rectGeometry.rectsOverlap;
            const computeAxisScale = copyEdgeGeometry.computeAxisScale;
            const findSurfaceDamage = surfaceDamage.findSurfaceDamage;
            const createCopyEdgeState = copyEdgeState.createCopyEdgeState;
            const markCopyEdgeInvalidated = copyEdgeState.markCopyEdgeInvalidated;
            const markCopyEdgeDamaged = copyEdgeState.markCopyEdgeDamaged;
            const copyCopiedTextProjectionRecord = copiedTextProjection.copyCopiedTextProjectionRecord;

            function createSurfaceLedger(options = {}) {
                const settings = options && typeof options === 'object' ? options : {};
                const maxDrawUnitsPerSurface = readPositiveInteger(settings.maxDrawUnitsPerSurface, 8192);
                const maxTextRunsPerSurface = readPositiveInteger(settings.maxTextRunsPerSurface, 8192);
                const maxMutationHistoryPerSurface = readPositiveInteger(settings.maxMutationHistoryPerSurface, 2048);
                const maxReplayOpsPerSurface = readPositiveInteger(settings.maxReplayOpsPerSurface, 4096);
                const surfaces = new WeakMap();
                const surfacesById = new Map();
                let nextSurfaceId = 0;
                let nextIntentId = 0;
                let nextUnitId = 0;
                let nextRunId = 0;
                let nextMutationId = 0;
                let nextCopyEdgeId = 0;
                let nextReplayOpId = 0;
                const textDrawHandles = new WeakMap();
                const mutationHandles = new WeakMap();

                function canStoreSurface(bitmap) {
                    const type = typeof bitmap;
                    return bitmap !== null && (type === 'object' || type === 'function');
                }

                function getSurfaceRecord(bitmap) {
                    if (!canStoreSurface(bitmap)) return null;
                    try { return surfaces.get(bitmap) || null; } catch (_) { return null; }
                }

                function hasSurfaceRecord(bitmap) {
                    return !!getSurfaceRecord(bitmap);
                }

                function getOrCreateSurfaceRecord(bitmap, input = {}) {
                    if (!canStoreSurface(bitmap)) return null;
                    let record = getSurfaceRecord(bitmap);
                    if (!record) {
                        record = createSurfaceRecord(bitmap, input);
                        surfaces.set(bitmap, record);
                        rememberSurfaceRecord(record);
                    } else {
                        updateSurfaceMetadata(record, input);
                    }
                    return record;
                }

                function createSurfaceRecord(bitmap, input = {}) {
                    const source = input && typeof input === 'object' ? input : {};
                    return {
                        surfaceId: stringify(source.surfaceId || `bms-${(++nextSurfaceId).toString(36)}`),
                        bitmap,
                        ownerKind: stringify(source.ownerKind || ''),
                        ownerRef: source.ownerRef || null,
                        surfaceType: stringify(source.surfaceType || 'bitmap'),
                        revision: nonNegativeInteger(source.revision, 0),
                        generation: nonNegativeInteger(source.generation, 0),
                        destroyed: source.destroyed === true,
                        drawIntents: [],
                        pendingIntents: new Map(),
                        drawUnits: [],
                        textRuns: [],
                        replayOps: [],
                        copyEdgesOut: [],
                        copyEdgesIn: [],
                        mutationHistory: [],
                        restoreMaterials: [],
                    };
                }

                function updateSurfaceMetadata(record, input = {}) {
                    if (!record || !input || typeof input !== 'object') return record;
                    if (input.ownerKind !== undefined) record.ownerKind = stringify(input.ownerKind);
                    if (input.ownerRef !== undefined) record.ownerRef = input.ownerRef || null;
                    if (input.surfaceType !== undefined) record.surfaceType = stringify(input.surfaceType || 'bitmap');
                    if (input.destroyed === true) record.destroyed = true;
                    return record;
                }

                function rememberSurfaceRecord(record) {
                    if (!record || !record.surfaceId) return;
                    surfacesById.set(record.surfaceId, record);
                }

                function getSurfaceRecordById(surfaceId) {
                    const id = stringify(surfaceId || '');
                    return id ? surfacesById.get(id) || null : null;
                }

                function beginTextDraw(bitmap, input = {}) {
                    const record = getOrCreateSurfaceRecord(bitmap, input);
                    if (!record || record.destroyed) return null;
                    const source = input && typeof input === 'object' ? input : {};
                    const intent = {
                        intentId: `bmi-${(++nextIntentId).toString(36)}`,
                        surfaceId: record.surfaceId,
                        methodName: normalizeTextMethodName(source.methodName),
                        text: stringify(source.text !== undefined ? source.text : source.rawText),
                        x: finiteNumber(source.x, 0),
                        y: finiteNumber(source.y, 0),
                        maxWidth: nonNegativeNumber(source.maxWidth, 0),
                        lineHeight: positiveNumber(source.lineHeight, source.fontSize, 24),
                        align: normalizeCanvasTextAlign(source.align),
                        drawState: copyPlainObject(source.drawState),
                        preNativeBackdropToken: stringify(source.preNativeBackdropToken || ''),
                        nativeReplaceable: source.nativeReplaceable !== false,
                        boundary: clonePlainValue(source.boundary || null),
                        createdAtRevision: record.revision,
                        status: 'pending',
                    };
                    intent.nativeArgs = normalizeTextDrawNativeArgs(source, intent);
                    record.drawIntents.push(intent);
                    record.pendingIntents.set(intent.intentId, intent);
                    return createIntentHandle(record, intent);
                }

                function commitTextDraw(intentHandle, input = {}) {
                    const internals = textDrawHandles.get(intentHandle) || null;
                    const intent = internals && internals.intent || null;
                    const record = internals && internals.record || null;
                    if (!record || !intent || intent.status !== 'pending') return null;
                    const source = input && typeof input === 'object' ? input : {};
                    intent.status = 'committed';
                    record.pendingIntents.delete(intent.intentId);
                    record.revision += 1;

                    const geometry = createGeometry(intent, source);
                    const textRunId = `bmt-${(++nextRunId).toString(36)}`;
                    const unit = {
                        unitId: `bmu-${(++nextUnitId).toString(36)}`,
                        intentId: intent.intentId,
                        surfaceId: record.surfaceId,
                        revision: record.revision,
                        order: positiveInteger(source.order, record.drawUnits.length + 1),
                        methodName: intent.methodName,
                        text: intent.text,
                        geometry,
                        drawStateId: stringify(source.drawStateId || ''),
                        drawState: copyPlainObject(source.drawState || intent.drawState),
                        measuredWidth: nonNegativeNumber(source.measuredWidth, geometry.width),
                        backdropToken: stringify(source.backdropToken || intent.preNativeBackdropToken || ''),
                        sourceCommitted: true,
                        boundary: clonePlainValue(source.boundary || intent.boundary || null),
                        drawRun: clonePlainValue(source.drawRun || null),
                        nativeUnitId: stringify(source.nativeUnitId || source.id || ''),
                        textRunId,
                    };
                    record.drawUnits.push(unit);
                    pruneArray(record.drawUnits, maxDrawUnitsPerSurface);

                    const run = createTextRun(record, unit, source, textRunId);
                    record.textRuns.push(run);
                    pruneArray(record.textRuns, maxTextRunsPerSurface);
                    return copyDrawUnit(unit);
                }

                function abortTextDraw(intentHandle, reason = 'native-failure') {
                    const internals = textDrawHandles.get(intentHandle) || null;
                    const intent = internals && internals.intent || null;
                    const record = internals && internals.record || null;
                    if (!record || !intent || intent.status !== 'pending') return false;
                    intent.status = 'aborted';
                    intent.abortReason = stringify(reason || 'native-failure');
                    record.pendingIntents.delete(intent.intentId);
                    return true;
                }

                function recordCommittedDraw(bitmap, input = {}) {
                    const intentHandle = beginTextDraw(bitmap, Object.assign({}, input, {
                        nativeReplaceable: false,
                    }));
                    if (!intentHandle) return null;
                    return commitTextDraw(intentHandle, input);
                }

                function beginMutation(bitmap, input = {}) {
                    const record = getOrCreateSurfaceRecord(bitmap, input);
                    if (!record) return null;
                    const source = input && typeof input === 'object' ? input : {};
                    const mutation = {
                        mutationId: `bmm-${(++nextMutationId).toString(36)}`,
                        surfaceId: record.surfaceId,
                        methodName: stringify(source.methodName || 'mutation') || 'mutation',
                        targetRect: cloneRect(source.targetRect || source.rect || null),
                        sourceSurfaceId: '',
                        sourceRect: cloneRect(source.sourceRect || null),
                        targetRectAfterCopy: cloneRect(source.targetRectAfterCopy || source.targetRect || source.rect || null),
                        targetRestoreMaterialId: stringify(source.targetRestoreMaterialId || ''),
                        targetRestoreRect: cloneRect(source.targetRestoreRect || null),
                        targetRestoreRevisionBefore: normalizeOptionalRevision(source.targetRestoreRevisionBefore),
                        beforeRevision: record.revision,
                        afterRevision: record.revision,
                        participants: cloneStringList(source.participants),
                        status: 'pending',
                        full: source.full === true,
                    };
                    return createMutationHandle(record, mutation, source);
                }

                function commitMutation(mutationHandle, input = {}) {
                    const internals = mutationHandles.get(mutationHandle) || null;
                    const mutation = internals && internals.mutation || null;
                    const record = internals && internals.record || null;
                    if (!record || !mutation || mutation.status !== 'pending') return null;
                    const source = input && typeof input === 'object' ? input : {};
                    const methodName = stringify(source.methodName || mutation.methodName || 'mutation') || 'mutation';
                    mutation.methodName = methodName;
                    mutation.targetRect = cloneRect(source.targetRect || source.rect || mutation.targetRect);
                    mutation.sourceRect = cloneRect(source.sourceRect || mutation.sourceRect);
                    mutation.targetRectAfterCopy = cloneRect(source.targetRectAfterCopy || source.targetRect || source.rect || mutation.targetRectAfterCopy);
                    mutation.targetRestoreMaterialId = stringify(source.targetRestoreMaterialId || mutation.targetRestoreMaterialId || '');
                    mutation.targetRestoreRect = cloneRect(source.targetRestoreRect || mutation.targetRestoreRect || null);
                    mutation.targetRestoreRevisionBefore = normalizeOptionalRevision(
                        source.targetRestoreRevisionBefore !== undefined
                            ? source.targetRestoreRevisionBefore
                            : mutation.targetRestoreRevisionBefore
                    );
                    mutation.participants = cloneStringList(source.participants || mutation.participants);
                    mutation.full = source.full === true || mutation.full === true;
                    record.revision += 1;
                    if (methodName === 'resize' || source.newGeneration === true) record.generation += 1;
                    if (methodName === 'destroy' || source.destroyed === true) {
                        record.destroyed = true;
                        record.generation += 1;
                    }
                    mutation.afterRevision = record.revision;
                    mutation.status = 'committed';

                    const replayOp = recordReplayOp(record, mutation, source);
                    if (replayOp) mutation.replayOpId = replayOp.replayOpId;
                    const edge = source.recordCopyEdge === false
                        ? null
                        : appendCopyEdgeToMutation(record, mutation, source);
                    if (edge) mutation.copyEdgeId = edge.edgeId;
                    record.mutationHistory.push(copyMutation(mutation));
                    pruneArray(record.mutationHistory, maxMutationHistoryPerSurface);
                    markProjectionDamagedByMutation(mutation.mutationId);
                    return copyMutation(mutation);
                }

                function abortMutation(mutationHandle, reason = 'native-failure') {
                    const internals = mutationHandles.get(mutationHandle) || null;
                    const mutation = internals && internals.mutation || null;
                    if (!mutation || mutation.status !== 'pending') return false;
                    mutation.status = 'aborted';
                    mutation.abortReason = stringify(reason || 'native-failure');
                    return true;
                }

                function recordMutation(bitmap, input = {}) {
                    const handle = beginMutation(bitmap, input);
                    if (!handle) return null;
                    return commitMutation(handle, input);
                }

                function recordCopyEdge(bitmap, input = {}) {
                    const record = getSurfaceRecord(bitmap);
                    if (!record) return null;
                    const source = input && typeof input === 'object' ? input : {};
                    const mutationId = stringify(source.mutationId || source.createdByMutationId || '');
                    if (!mutationId) return null;
                    const mutation = record.mutationHistory.find((candidate) => candidate && candidate.mutationId === mutationId) || null;
                    if (!mutation || mutation.status !== 'committed') return null;
                    const edge = appendCopyEdgeToMutation(record, mutation, source);
                    return edge ? copyCopyEdge(edge) : null;
                }

                function markCopyEdgeRecovered(input, recovery = {}) {
                    const edge = resolveCopyEdgeRecord(input);
                    if (!edge) return null;
                    const state = recoverProjectionEdge(edge, recovery);
                    return state ? copyCopyEdge(edge) : null;
                }

                function markProjectionDamagedByMutation(input) {
                    const mutation = resolveMutationRecord(input);
                    if (!mutation || mutation.status !== 'committed') return [];
                    const targetRecord = getSurfaceRecordById(mutation.surfaceId);
                    if (!targetRecord || !Array.isArray(targetRecord.copyEdgesIn)) return [];

                    const damage = createProjectionDamageFromMutation(mutation);
                    const changed = [];
                    targetRecord.copyEdgesIn.forEach((edge) => {
                        if (!shouldMutationDamageProjection(edge, targetRecord, mutation, damage)) return;
                        const projectionState = ensureProjectionStateRecord(edge);
                        const superseded = isProjectionSupersedingMutation(targetRecord, mutation, damage);
                        projectionState.status = superseded
                            ? 'superseded'
                            : 'damaged';
                        projectionState.damagedByMutationId = damage.mutationId;
                        projectionState.damagedAtRevision = damage.revision;
                        projectionState.damageReason = superseded ? 'target-content-superseded' : damage.reason;
                        projectionState.damageMethodName = damage.methodName;
                        projectionState.damageRect = cloneRect(damage.rect);
                        projectionState.damageFull = superseded || damage.full === true;
                        changed.push(getCopyEdgeState(edge));
                    });
                    return changed;
                }

                function markProjectionRecoveredByRestore(input, recovery = {}) {
                    const source = normalizeProjectionRecoveryInput(input, recovery);
                    const edge = resolveCopyEdgeRecord(source.edge || source.edgeId || source.projectionId || input);
                    if (!edge) return null;
                    return recoverProjectionEdge(edge, source);
                }

                function recoverProjectionEdge(edge, recovery = {}) {
                    const targetRecord = getSurfaceRecordById(edge.targetSurfaceId);
                    if (!targetRecord) return null;
                    if (recovery && recovery.targetBitmap) {
                        const recoveryTargetRecord = getSurfaceRecord(recovery.targetBitmap);
                        if (!recoveryTargetRecord || recoveryTargetRecord.surfaceId !== edge.targetSurfaceId) return null;
                    }
                    if (!hasRecoverableProjectionMaterial(edge)) return null;

                    const descriptor = createProjectionCopyEdgeDescriptor(edge);
                    const state = createCopyEdgeState(descriptor, 'current');
                    applySurfaceContinuityState(state, descriptor, targetRecord, 'target');
                    if (state.invalidated) return null;

                    const projectionState = ensureProjectionStateRecord(edge);
                    if (projectionState.status === 'superseded') return null;
                    projectionState.status = 'current';
                    projectionState.targetRevision = targetRecord.revision;
                    projectionState.targetGeneration = targetRecord.generation;
                    projectionState.recoveredByTransactionId = stringify(
                        recovery && (recovery.transactionId || recovery.restoreTransactionId || recovery.reason) || ''
                    );
                    projectionState.recoveredAtRevision = targetRecord.revision;
                    projectionState.recoveryReason = stringify(recovery && recovery.reason || '');
                    projectionState.damagedByMutationId = '';
                    projectionState.damagedAtRevision = undefined;
                    projectionState.damageReason = '';
                    projectionState.damageMethodName = '';
                    projectionState.damageRect = null;
                    projectionState.damageFull = false;
                    return getCopyEdgeState(edge);
                }

                function recordReplayOp(record, mutation, input = {}) {
                    const source = input && typeof input === 'object' ? input : {};
                    const raw = source.replayOp || source.recordOp || null;
                    if (!raw || typeof raw !== 'object') return null;
                    const replayOp = {
                        replayOpId: `bmr-${(++nextReplayOpId).toString(36)}`,
                        surfaceId: record.surfaceId,
                        mutationId: mutation.mutationId,
                        revision: record.revision,
                        methodName: stringify(raw.methodName || mutation.methodName),
                        rect: cloneRect(raw.rect || mutation.targetRect || null),
                        args: cloneArgList(raw.args, getSurfaceRecord),
                        traits: copyMutationTraits(raw.traits || null),
                    };
                    record.replayOps.push(replayOp);
                    pruneArray(record.replayOps, maxReplayOpsPerSurface);
                    return replayOp;
                }

                function copyMutationTraits(traits) {
                    if (!traits || typeof traits !== 'object') return null;
                    const output = {};
                    Object.keys(traits).forEach((key) => {
                        const value = traits[key];
                        if (key === 'sourceBitmap') {
                            const sourceRecord = getSurfaceRecord(value);
                            output.sourceSurfaceId = sourceRecord ? sourceRecord.surfaceId : '';
                            return;
                        }
                        const type = typeof value;
                        if (value === null || type === 'string' || type === 'number' || type === 'boolean') {
                            output[key] = value;
                        }
                    });
                    return output;
                }

                function appendCopyEdgeToMutation(targetRecord, mutation, input = {}) {
                    if (mutation && mutation.copyEdgeId) {
                        return targetRecord.copyEdgesIn.find((edge) => edge && edge.edgeId === mutation.copyEdgeId) || null;
                    }
                    const sourceBitmap = input && input.sourceBitmap;
                    const sourceRecord = getSurfaceRecord(sourceBitmap);
                    if (!sourceRecord || sourceRecord === targetRecord) return null;
                    const sourceRect = cloneRect(input.sourceRect || mutation.sourceRect);
                    const targetRect = cloneRect(input.targetRectAfterCopy || input.targetRect || input.rect || mutation.targetRectAfterCopy || mutation.targetRect);
                    if (!sourceRect || !targetRect) return null;
                    const edge = {
                        edgeId: `bme-${(++nextCopyEdgeId).toString(36)}`,
                        sourceSurfaceId: sourceRecord.surfaceId,
                        targetSurfaceId: targetRecord.surfaceId,
                        sourceRect,
                        targetRect,
                        scaleX: computeAxisScale(sourceRect.x1, sourceRect.x2, targetRect.x1, targetRect.x2),
                        scaleY: computeAxisScale(sourceRect.y1, sourceRect.y2, targetRect.y1, targetRect.y2),
                        sourceRevision: sourceRecord.revision,
                        targetRevision: targetRecord.revision,
                        sourceGeneration: sourceRecord.generation,
                        targetGeneration: targetRecord.generation,
                        createdByMutationId: mutation.mutationId,
                        targetRestoreMaterialId: stringify(input.targetRestoreMaterialId || mutation.targetRestoreMaterialId || ''),
                        targetRestoreRect: cloneRect(input.targetRestoreRect || mutation.targetRestoreRect || null),
                        targetRestoreRevisionBefore: normalizeOptionalRevision(
                            input.targetRestoreRevisionBefore !== undefined
                                ? input.targetRestoreRevisionBefore
                                : mutation.targetRestoreRevisionBefore
                        ),
                        sourceTextRuns: collectCopiedSourceTextRuns(sourceRecord, sourceRect, sourceRecord.revision),
                    };
                    edge.projectedTargetRecords = collectProjectedTargetRecords(input.projectedTargetRecords, edge);
                    edge.projectionState = createProjectionStateRecord(edge, {
                        status: 'current',
                        createdByMutationId: mutation.mutationId,
                    });
                    mutation.sourceSurfaceId = sourceRecord.surfaceId;
                    targetRecord.copyEdgesIn.push(edge);
                    sourceRecord.copyEdgesOut.push(edge);
                    mutation.copyEdgeId = edge.edgeId;
                    return edge;
                }

                function collectCopiedSourceTextRuns(sourceRecord, sourceRect, sourceRevision) {
                    const copyRect = cloneRect(sourceRect);
                    const runs = Array.isArray(sourceRecord && sourceRecord.textRuns)
                        ? sourceRecord.textRuns
                        : [];
                    if (!copyRect || !runs.length) return [];
                    const edgeRevision = normalizeOptionalRevision(sourceRevision);
                    return runs.filter((run) => {
                        if (!run || !rectsOverlap(copyRect, run.bounds)) return false;
                        const runRevision = normalizeOptionalRevision(run.revision);
                        return edgeRevision === undefined
                            || runRevision === undefined
                            || runRevision <= edgeRevision;
                    }).map(copyTextRun);
                }

                function collectProjectedTargetRecords(records, edge) {
                    const source = Array.isArray(records) ? records : [];
                    if (!source.length || !edge) return [];
                    return source.map((record) => copyProjectedTargetRecord(record, edge)).filter(Boolean);
                }

                function getSurfaceSnapshot(bitmap) {
                    const record = getSurfaceRecord(bitmap);
                    return record ? copySurfaceRecord(record) : null;
                }

                function getSurfaceIdentity(bitmap) {
                    const record = getSurfaceRecord(bitmap);
                    return record ? copySurfaceIdentity(record) : null;
                }

                function getSurfaceById(surfaceId, options = {}) {
                    const record = getSurfaceRecordById(surfaceId);
                    if (!record) return null;
                    if (record.destroyed && !(options && options.includeDestroyed === true)) return null;
                    return record.bitmap || null;
                }

                function ensureSurfaceRecord(bitmap, input = {}) {
                    const record = getOrCreateSurfaceRecord(bitmap, input);
                    return record ? copySurfaceRecord(record) : null;
                }

                function getDrawUnits(bitmap) {
                    const record = getSurfaceRecord(bitmap);
                    return record ? record.drawUnits.map(copyDrawUnit) : [];
                }

                function getTextRuns(bitmap) {
                    const record = getSurfaceRecord(bitmap);
                    return record ? record.textRuns.map(copyTextRun) : [];
                }

                function getCopyEdgesFrom(bitmap) {
                    const record = getSurfaceRecord(bitmap);
                    return record ? record.copyEdgesOut.map(copyCopyEdge) : [];
                }

                function getCopyEdgesTo(bitmap) {
                    const record = getSurfaceRecord(bitmap);
                    return record ? record.copyEdgesIn.map(copyCopyEdge) : [];
                }

                function getCopyEdgeState(input) {
                    const edge = resolveCopyEdgeRecord(input);
                    if (!edge) return createCopyEdgeState(null, 'invalidated', ['missing-edge']);

                    const descriptor = createProjectionCopyEdgeDescriptor(edge);
                    const state = createCopyEdgeState(descriptor, 'current');
                    const sourceRecord = getSurfaceRecordById(edge.sourceSurfaceId);
                    const targetRecord = getSurfaceRecordById(edge.targetSurfaceId);
                    if (!sourceRecord) markCopyEdgeInvalidated(state, 'missing-source-surface');
                    if (!targetRecord) markCopyEdgeInvalidated(state, 'missing-target-surface');
                    if (!sourceRecord || !targetRecord) return state;

                    applySurfaceContinuityState(state, descriptor, targetRecord, 'target');
                    if (state.invalidated) return state;

                    const projectionState = ensureProjectionStateRecord(edge);
                    if (projectionState.status === 'superseded') {
                        markCopyEdgeSuperseded(state, projectionState);
                        return state;
                    }
                    const explicitDamage = createProjectionDamageFromState(projectionState);
                    if (explicitDamage) markCopyEdgeDamaged(state, 'target', explicitDamage);
                    const targetDamage = findSurfaceDamage(targetRecord, {
                        sinceRevision: projectionState.targetRevision,
                        protectedRect: edge.targetRect,
                        ignoredMutationId: edge.createdByMutationId,
                    });
                    if (targetDamage) markCopyEdgeDamaged(state, 'target', targetDamage);
                    return state;
                }

                function getCopyEdgeSourceReplayState(input, options = {}) {
                    const edge = resolveCopyEdgeRecord(input);
                    if (!edge) return createCopyEdgeState(null, 'invalidated', ['missing-edge']);

                    const descriptor = createProjectionCopyEdgeDescriptor(edge);
                    const state = createCopyEdgeState(descriptor, 'current');
                    const sourceRecord = getSurfaceRecordById(edge.sourceSurfaceId);
                    if (!sourceRecord) {
                        markCopyEdgeInvalidated(state, 'missing-source-surface');
                        return state;
                    }

                    applySurfaceContinuityState(state, descriptor, sourceRecord, 'source');
                    if (state.invalidated) return state;

                    const sourceRect = cloneRect(options && (options.sourceRect || options.rect) || edge.sourceRect);
                    const projectionState = ensureProjectionStateRecord(edge);
                    const sourceDamage = findSurfaceDamage(sourceRecord, {
                        sinceRevision: projectionState.sourceRevision,
                        protectedRect: sourceRect,
                    });
                    if (sourceDamage) markCopyEdgeDamaged(state, 'source', sourceDamage);
                    return state;
                }

                function getRecoverableProjectionStatesForTarget(target, input = {}) {
                    const targetRecord = resolveSurfaceRecordInput(target, input);
                    if (!targetRecord || !Array.isArray(targetRecord.copyEdgesIn)) return [];
                    const targetRect = cloneRect(input && (input.targetRect || input.damageRect || input.rect) || null);
                    return targetRecord.copyEdgesIn.map((edge) => getCopyEdgeState(edge)).filter((state) => {
                        if (!isRecoverableProjectionState(state)) return false;
                        if (!targetRect) return true;
                        return rectsOverlap(targetRect, state && state.targetRect || null);
                    });
                }

                function upsertCopyEdgeProjectedTargetRecord(input = {}) {
                    const edge = resolveCopyEdgeRecord(resolveProjectedTargetRecordEdgeInput(input));
                    if (!edge) return null;
                    const source = input && (input.record || input.projectionRecord) || input;
                    const record = copyProjectedTargetRecord(source, edge);
                    if (!record) return null;
                    if (!Array.isArray(edge.projectedTargetRecords)) edge.projectedTargetRecords = [];
                    const index = findProjectedTargetRecordIndex(edge.projectedTargetRecords, record);
                    if (index >= 0) {
                        edge.projectedTargetRecords[index] = record;
                    } else {
                        edge.projectedTargetRecords.push(record);
                    }
                    return copyProjectedTargetRecord(record, edge);
                }

                function resolveProjectedTargetRecordEdgeInput(input = {}) {
                    if (!input || typeof input !== 'object') return input;
                    if (input.edge || input.edgeId) return input.edge || input.edgeId;
                    const record = input.record || input.projectionRecord;
                    return record && typeof record === 'object' ? record : input;
                }

                function resolveCopyEdgeRecord(input) {
                    if (!input) return null;
                    const edgeId = stringify(typeof input === 'string' ? input : input.edgeId || '');
                    if (edgeId) {
                        const edge = findCopyEdgeRecordById(edgeId);
                        if (edge) return edge;
                    }
                    const sourceSurfaceId = stringify(input.sourceSurfaceId || '');
                    const targetSurfaceId = stringify(input.targetSurfaceId || '');
                    if (!sourceSurfaceId || !targetSurfaceId) return null;
                    const targetRecord = getSurfaceRecordById(targetSurfaceId);
                    if (!targetRecord) return null;
                    return targetRecord.copyEdgesIn.find((edge) => edge
                        && stringify(edge.sourceSurfaceId || '') === sourceSurfaceId
                        && sameRect(edge.sourceRect, input.sourceRect)
                        && sameRect(edge.targetRect, input.targetRect)) || null;
                }

                function findCopyEdgeRecordById(edgeId) {
                    const id = stringify(edgeId || '');
                    if (!id) return null;
                    let found = null;
                    surfacesById.forEach((record) => {
                        if (found || !record || !Array.isArray(record.copyEdgesIn)) return;
                        found = record.copyEdgesIn.find((edge) => edge && edge.edgeId === id) || null;
                    });
                    return found;
                }

                function resolveMutationRecord(input) {
                    const mutationId = stringify(typeof input === 'string'
                        ? input
                        : input && input.mutationId || '');
                    if (!mutationId) return null;
                    let found = null;
                    surfacesById.forEach((record) => {
                        if (found || !record || !Array.isArray(record.mutationHistory)) return;
                        found = record.mutationHistory.find((mutation) => mutation
                            && stringify(mutation.mutationId || '') === mutationId) || null;
                    });
                    return found;
                }

                function resolveSurfaceRecordInput(target, input = {}) {
                    const surfaceId = stringify(
                        typeof target === 'string'
                            ? target
                            : input && (input.targetSurfaceId || input.surfaceId) || ''
                    );
                    if (surfaceId) return getSurfaceRecordById(surfaceId);
                    return getSurfaceRecord(target);
                }

                function normalizeProjectionRecoveryInput(input, recovery = {}) {
                    const source = input && typeof input === 'object' && typeof input !== 'function'
                        ? input
                        : {};
                    const overlay = recovery && typeof recovery === 'object' ? recovery : {};
                    return Object.assign({}, source, overlay, {
                        edge: source.edge || overlay.edge || null,
                        edgeId: stringify(source.edgeId || source.projectionId || overlay.edgeId || overlay.projectionId || ''),
                        projectionId: stringify(source.projectionId || source.edgeId || overlay.projectionId || overlay.edgeId || ''),
                        transactionId: stringify(source.transactionId || source.restoreTransactionId || overlay.transactionId || overlay.restoreTransactionId || ''),
                        restoreTransactionId: stringify(source.restoreTransactionId || source.transactionId || overlay.restoreTransactionId || overlay.transactionId || ''),
                        reason: stringify(source.reason || overlay.reason || ''),
                        targetBitmap: source.targetBitmap || overlay.targetBitmap || null,
                    });
                }

                function shouldMutationDamageProjection(edge, targetRecord, mutation, damage) {
                    if (!edge || !mutation || !damage) return false;
                    const mutationId = stringify(mutation.mutationId || '');
                    if (!mutationId || stringify(edge.createdByMutationId || '') === mutationId) return false;
                    const projectionState = ensureProjectionStateRecord(edge);
                    if (projectionState.status === 'superseded') return false;
                    const mutationRevision = normalizeOptionalRevision(mutation.afterRevision);
                    const targetRevision = normalizeOptionalRevision(projectionState.targetRevision);
                    if (mutationRevision !== undefined && targetRevision !== undefined && mutationRevision <= targetRevision) {
                        return false;
                    }
                    const expectedGeneration = normalizeOptionalRevision(projectionState.targetGeneration);
                    if (expectedGeneration !== undefined && nonNegativeInteger(targetRecord.generation, 0) !== expectedGeneration) {
                        return false;
                    }
                    if (damage.full === true || !damage.rect) return true;
                    return rectsOverlap(damage.rect, edge.targetRect);
                }

                function isProjectionSupersedingMutation(targetRecord, mutation, damage) {
                    const methodName = stringify(mutation && mutation.methodName || '');
                    if (methodName === 'destroy' || methodName === 'resize') return true;
                    if (damage && damage.full === true) return true;
                    if (methodName !== 'clear' && methodName !== 'clearRect') return false;
                    return mutationCoversWholeSurface(targetRecord, damage && damage.rect);
                }

                function mutationCoversWholeSurface(targetRecord, rect) {
                    const bounds = getSurfacePixelBounds(targetRecord);
                    const damageRect = cloneRect(rect);
                    if (!bounds || !damageRect) return false;
                    return damageRect.x1 <= bounds.x1
                        && damageRect.y1 <= bounds.y1
                        && damageRect.x2 >= bounds.x2
                        && damageRect.y2 >= bounds.y2;
                }

                function getSurfacePixelBounds(record) {
                    const bitmap = record && record.bitmap || null;
                    const width = readBitmapDimension(bitmap, 'width');
                    const height = readBitmapDimension(bitmap, 'height');
                    if (width <= 0 || height <= 0) return null;
                    return { x1: 0, y1: 0, x2: width, y2: height };
                }

                function readBitmapDimension(bitmap, key) {
                    const value = bitmap && (
                        bitmap[key]
                        || bitmap._canvas && bitmap._canvas[key]
                        || bitmap.canvas && bitmap.canvas[key]
                        || bitmap._context && bitmap._context.canvas && bitmap._context.canvas[key]
                        || bitmap.context && bitmap.context.canvas && bitmap.context.canvas[key]
                    );
                    const numeric = Number(value);
                    return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
                }

                function createProjectionDamageFromMutation(mutation) {
                    const full = mutation && mutation.full === true;
                    const rect = cloneRect(mutation && (mutation.targetRectAfterCopy || mutation.targetRect) || null);
                    return {
                        kind: 'mutation',
                        reason: full ? 'mutation-full' : (rect ? 'mutation-overlap' : 'mutation-unknown'),
                        revision: normalizeOptionalRevision(mutation && mutation.afterRevision),
                        rect,
                        full,
                        unknown: !full && !rect,
                        mutationId: stringify(mutation && mutation.mutationId || ''),
                        methodName: stringify(mutation && mutation.methodName || ''),
                    };
                }

                function createProjectionDamageFromState(projectionState) {
                    if (!projectionState || typeof projectionState !== 'object') return null;
                    if (projectionState.status === 'superseded') return null;
                    if (projectionState.status !== 'damaged' && !projectionState.damagedByMutationId) return null;
                    return {
                        kind: 'mutation',
                        reason: stringify(projectionState.damageReason || 'mutation-overlap') || 'mutation-overlap',
                        revision: normalizeOptionalRevision(projectionState.damagedAtRevision),
                        rect: cloneRect(projectionState.damageRect || null),
                        full: projectionState.damageFull === true,
                        unknown: projectionState.damageFull !== true && !projectionState.damageRect,
                        mutationId: stringify(projectionState.damagedByMutationId || ''),
                        methodName: stringify(projectionState.damageMethodName || ''),
                    };
                }

                function isRecoverableProjectionState(state) {
                    return !!(state
                        && state.damaged === true
                        && state.targetDamaged === true
                        && state.superseded !== true
                        && state.sourceDamaged !== true
                        && state.invalidated !== true);
                }

                function hasRecoverableProjectionMaterial(edge) {
                    if (!edge || !edge.sourceSurfaceId || !edge.targetSurfaceId) return false;
                    if (!rectHasPositiveArea(edge.sourceRect) || !rectHasPositiveArea(edge.targetRect)) return false;

                    // Projection recovery redraws target-owned copied text. Source replay
                    // may be unsafe, but the edge must still carry the text/projection
                    // facts needed to reconstruct the copied target without live source
                    // continuity.
                    return hasStoredProjectionTextRuns(edge.sourceTextRuns)
                        || hasStoredProjectedTargetRecords(edge.projectedTargetRecords);
                }

                function hasStoredProjectionTextRuns(runs) {
                    if (!Array.isArray(runs) || !runs.length) return false;
                    return runs.some((run) => !!(run
                        && (stringify(run.runId || '') || stringify(run.slotKey || ''))
                        && rectHasPositiveArea(run.bounds)));
                }

                function hasStoredProjectedTargetRecords(records) {
                    if (!Array.isArray(records) || !records.length) return false;
                    return records.some((record) => !!(record
                        && (stringify(record.sourceRunId || '') || stringify(record.sourceSlotKey || ''))
                        && rectHasPositiveArea(record.targetBounds || record.bounds)));
                }

                function rectHasPositiveArea(rect) {
                    const area = cloneRect(rect);
                    return !!(area
                        && Number(area.x2) > Number(area.x1)
                        && Number(area.y2) > Number(area.y1));
                }

                function markCopyEdgeSuperseded(state, projectionState) {
                    if (!state) return state;
                    state.status = 'superseded';
                    state.current = false;
                    state.valid = false;
                    state.invalidated = true;
                    state.superseded = true;
                    state.damaged = false;
                    const reason = stringify(projectionState && projectionState.damageReason || 'target-content-superseded')
                        || 'target-content-superseded';
                    if (state.reasons.indexOf(reason) < 0) state.reasons.push(reason);
                    return state;
                }

                function applySurfaceContinuityState(state, edge, record, role) {
                    if (!state || !edge || !record) return;
                    if (record.destroyed) {
                        markCopyEdgeInvalidated(state, `${role}-destroyed`);
                        return;
                    }
                    const expected = normalizeOptionalRevision(edge[`${role}Generation`]);
                    if (expected === undefined) return;
                    const current = nonNegativeInteger(record.generation, 0);
                    if (current !== expected) markCopyEdgeInvalidated(state, `${role}-generation-changed`);
                }

                function createIntentHandle(record, intent) {
                    const handle = {
                        intentId: intent.intentId,
                        surfaceId: record.surfaceId,
                        callNative: true,
                        nativeArgs: Array.isArray(intent.nativeArgs) ? intent.nativeArgs.slice() : [],
                        commitNativeSuccess(input = {}) {
                            return commitTextDraw(this, input);
                        },
                        abortNativeFailure(error) {
                            return abortTextDraw(this, error && error.message ? error.message : 'native-failure');
                        },
                        finishSuppressed(reason = 'suppressed') {
                            return abortTextDraw(this, reason);
                        },
                    };
                    textDrawHandles.set(handle, { record, intent });
                    return freezeApi(handle);
                }

                function normalizeTextDrawNativeArgs(source, intent) {
                    if (source && Array.isArray(source.nativeArgs)) return source.nativeArgs.slice();
                    if (source && Array.isArray(source.args)) return source.args.slice();
                    return [
                        intent.text,
                        intent.x,
                        intent.y,
                        intent.maxWidth,
                        intent.lineHeight,
                        intent.align,
                    ];
                }

                function createMutationHandle(record, mutation, input = {}) {
                    const nativeArgs = Array.isArray(input.args) ? input.args.slice() : [];
                    const handle = {
                        mutationId: mutation.mutationId,
                        surfaceId: record.surfaceId,
                        nativeArgs,
                        commitNativeSuccess(commitInput = {}) {
                            return commitMutation(this, Object.assign({}, input, commitInput));
                        },
                        abortNativeFailure(error) {
                            return abortMutation(this, error && error.message ? error.message : 'native-failure');
                        },
                    };
                    mutationHandles.set(handle, { record, mutation });
                    return freezeApi(handle);
                }

                return freezeApi({
                    hasSurfaceRecord,
                    getSurfaceSnapshot,
                    getSurfaceIdentity,
                    getSurfaceById,
                    ensureSurfaceRecord,
                    beginTextDraw,
                    commitTextDraw,
                    abortTextDraw,
                    recordCommittedDraw,
                    beginMutation,
                    commitMutation,
                    abortMutation,
                    recordMutation,
                    recordCopyEdge,
                    markCopyEdgeRecovered,
                    markProjectionDamagedByMutation,
                    markProjectionRecoveredByRestore,
                    getDrawUnits,
                    getTextRuns,
                    getCopyEdgesFrom,
                    getCopyEdgesTo,
                    getCopyEdgeState,
                    getCopyEdgeSourceReplayState,
                    upsertCopyEdgeProjectedTargetRecord,
                    getRecoverableProjectionStatesForTarget,
                });
            }

            function createGeometry(intent, input = {}) {
                const x = finiteNumber(input.x, intent.x);
                const y = finiteNumber(input.y, intent.y);
                const maxWidth = nonNegativeNumber(input.maxWidth, intent.maxWidth);
                const lineHeight = positiveNumber(input.lineHeight, intent.lineHeight, 24);
                const measuredWidth = nonNegativeNumber(input.measuredWidth, maxWidth);
                const width = Math.max(0, measuredWidth || maxWidth);
                return {
                    x,
                    y,
                    maxWidth,
                    lineHeight,
                    align: normalizeCanvasTextAlign(input.align || intent.align),
                    width,
                    rect: {
                        x1: x,
                        y1: y,
                        x2: x + width,
                        y2: y + lineHeight,
                    },
                };
            }

            function createTextRun(record, unit, input = {}, runId) {
                const slotKey = stringify(input.slotKey || [
                    unit.methodName,
                    unit.geometry.x,
                    unit.geometry.y,
                    unit.geometry.maxWidth,
                    unit.geometry.lineHeight,
                    unit.geometry.align,
                ].join(':'));
                return {
                    runId,
                    surfaceId: record.surfaceId,
                    revision: unit.revision,
                    slotKey,
                    text: unit.text,
                    visibleText: stringify(input.visibleText !== undefined ? input.visibleText : unit.text).trim(),
                    units: [unit.unitId],
                    bounds: cloneRect(unit.geometry.rect),
                    drawState: copyPlainObject(unit.drawState),
                    drawRun: clonePlainValue(unit.drawRun || null),
                    sourceCommitted: true,
                    ownershipStatus: stringify(input.ownershipStatus || ''),
                };
            }
            function copySurfaceRecord(record) {
                return {
                    surfaceId: record.surfaceId,
                    ownerKind: record.ownerKind,
                    surfaceType: record.surfaceType,
                    revision: record.revision,
                    generation: record.generation,
                    destroyed: record.destroyed === true,
                    drawIntents: record.drawIntents.map(copyDrawIntent),
                    pendingIntentIds: Array.from(record.pendingIntents.keys()),
                    drawUnits: record.drawUnits.map(copyDrawUnit),
                    textRuns: record.textRuns.map(copyTextRun),
                    replayOps: record.replayOps.map(copyReplayOp),
                    copyEdgesOut: record.copyEdgesOut.map(copyCopyEdge),
                    copyEdgesIn: record.copyEdgesIn.map(copyCopyEdge),
                    mutationHistory: record.mutationHistory.map(copyMutation),
                    restoreMaterials: record.restoreMaterials.map(clonePlainValue),
                };
            }

            function copySurfaceIdentity(record) {
                return {
                    surfaceId: record.surfaceId,
                    ownerKind: record.ownerKind,
                    surfaceType: record.surfaceType,
                    revision: record.revision,
                    generation: record.generation,
                    destroyed: record.destroyed === true,
                };
            }

            function copyDrawIntent(intent) {
                return {
                    intentId: intent.intentId,
                    surfaceId: intent.surfaceId,
                    methodName: intent.methodName,
                    text: intent.text,
                    x: intent.x,
                    y: intent.y,
                    maxWidth: intent.maxWidth,
                    lineHeight: intent.lineHeight,
                    align: intent.align,
                    drawState: copyPlainObject(intent.drawState),
                    preNativeBackdropToken: intent.preNativeBackdropToken,
                    nativeReplaceable: intent.nativeReplaceable === true,
                    boundary: clonePlainValue(intent.boundary),
                    createdAtRevision: intent.createdAtRevision,
                    status: intent.status,
                    abortReason: intent.abortReason || '',
                };
            }

            function copyDrawUnit(unit) {
                return {
                    unitId: unit.unitId,
                    intentId: unit.intentId,
                    surfaceId: unit.surfaceId,
                    revision: unit.revision,
                    order: unit.order,
                    methodName: unit.methodName,
                    text: unit.text,
                    geometry: clonePlainValue(unit.geometry),
                    drawStateId: unit.drawStateId,
                    drawState: copyPlainObject(unit.drawState),
                    measuredWidth: unit.measuredWidth,
                    backdropToken: unit.backdropToken,
                    sourceCommitted: unit.sourceCommitted === true,
                    boundary: clonePlainValue(unit.boundary),
                    drawRun: clonePlainValue(unit.drawRun),
                    nativeUnitId: unit.nativeUnitId,
                    textRunId: unit.textRunId,
                };
            }

            function copyTextRun(run) {
                return {
                    runId: run.runId,
                    surfaceId: run.surfaceId,
                    revision: run.revision,
                    slotKey: run.slotKey,
                    text: run.text,
                    visibleText: run.visibleText,
                    units: Array.isArray(run.units) ? run.units.slice() : [],
                    bounds: cloneRect(run.bounds),
                    drawState: copyPlainObject(run.drawState),
                    drawRun: clonePlainValue(run.drawRun),
                    sourceCommitted: run.sourceCommitted === true,
                    ownershipStatus: run.ownershipStatus,
                };
            }

            function copyTextRuns(runs) {
                return Array.isArray(runs) ? runs.map(copyTextRun) : [];
            }

            function copyProjectedTargetRecords(records, edge = null) {
                return Array.isArray(records)
                    ? records.map((record) => copyProjectedTargetRecord(record, edge)).filter(Boolean)
                    : [];
            }

            function copyProjectedTargetRecord(record, edge = null) {
                if (!record || typeof record !== 'object') return null;
                const sourceSurfaceId = stringify(record.sourceSurfaceId || record.surfaceId || edge && edge.sourceSurfaceId || '');
                const targetSurfaceId = stringify(record.targetSurfaceId || edge && edge.targetSurfaceId || '');
                const sourceRunId = stringify(record.sourceRunId || record.runId || '');
                const sourceSlotKey = stringify(record.sourceSlotKey || record.slotKey || '');
                if (!sourceSurfaceId || !targetSurfaceId || (!sourceRunId && !sourceSlotKey)) return null;
                const targetBounds = cloneRect(record.targetBounds || record.bounds || null);
                const sourceBounds = cloneRect(record.sourceBounds || null);
                if (!targetBounds) return null;
                return copyCopiedTextProjectionRecord(record, {
                    sourceSurfaceId,
                    sourceRunId,
                    sourceSlotKey,
                    targetSurfaceId,
                    targetBounds,
                    bounds: targetBounds,
                    sourceBounds,
                    copyEdgeId: stringify(edge && edge.edgeId || record.copyEdgeId || record.edgeId || ''),
                    edgeId: stringify(edge && edge.edgeId || record.edgeId || record.copyEdgeId || ''),
                    targetRestoreMaterialId: stringify(edge && edge.targetRestoreMaterialId || record.targetRestoreMaterialId || ''),
                    targetRestoreRect: cloneRect(edge && edge.targetRestoreRect || record.targetRestoreRect || null),
                    targetRestoreRevisionBefore: normalizeOptionalRevision(
                        edge && edge.targetRestoreRevisionBefore !== undefined
                            ? edge.targetRestoreRevisionBefore
                            : record.targetRestoreRevisionBefore
                    ),
                    targetRevision: normalizeOptionalRevision(edge && edge.targetRevision !== undefined ? edge.targetRevision : record.targetRevision),
                    drawGeometry: record.drawGeometry || record.drawParams || record.position || null,
                    sourceDrawOrder: nonNegativeInteger(record.sourceDrawOrder, nonNegativeInteger(record.drawOrder, 0)),
                });
            }

            function findProjectedTargetRecordIndex(records, record) {
                if (!Array.isArray(records) || !record) return -1;
                const projectionId = stringify(record.projectionId || '');
                if (projectionId) {
                    const projectionIndex = records.findIndex((candidate) => stringify(candidate && candidate.projectionId || '') === projectionId);
                    if (projectionIndex >= 0) return projectionIndex;
                }
                return records.findIndex((candidate) => isSameProjectedTargetRecord(candidate, record));
            }

            function isSameProjectedTargetRecord(candidate, record) {
                if (!candidate || !record) return false;
                if (stringify(candidate.targetSurfaceId || '') !== stringify(record.targetSurfaceId || '')) return false;
                if (!sameRect(candidate.targetBounds || candidate.bounds, record.targetBounds || record.bounds)) return false;
                const runId = stringify(record.sourceRunId || '');
                if (runId && stringify(candidate.sourceRunId || '') === runId) return true;
                const slotKey = stringify(record.sourceSlotKey || '');
                return !!(slotKey && stringify(candidate.sourceSlotKey || '') === slotKey);
            }

            function copyReplayOp(op) {
                return {
                    replayOpId: op.replayOpId,
                    surfaceId: op.surfaceId,
                    mutationId: op.mutationId,
                    revision: op.revision,
                    methodName: op.methodName,
                    rect: cloneRect(op.rect),
                    args: cloneArgList(op.args),
                    traits: clonePlainValue(op.traits),
                };
            }

            function copyMutation(mutation) {
                return {
                    mutationId: mutation.mutationId,
                    surfaceId: mutation.surfaceId,
                    methodName: mutation.methodName,
                    targetRect: cloneRect(mutation.targetRect),
                    sourceSurfaceId: mutation.sourceSurfaceId,
                    sourceRect: cloneRect(mutation.sourceRect),
                    targetRectAfterCopy: cloneRect(mutation.targetRectAfterCopy),
                    targetRestoreMaterialId: stringify(mutation.targetRestoreMaterialId || ''),
                    targetRestoreRect: cloneRect(mutation.targetRestoreRect),
                    targetRestoreRevisionBefore: normalizeOptionalRevision(mutation.targetRestoreRevisionBefore),
                    beforeRevision: mutation.beforeRevision,
                    afterRevision: mutation.afterRevision,
                    participants: cloneStringList(mutation.participants),
                    status: mutation.status,
                    full: mutation.full === true,
                    replayOpId: mutation.replayOpId || '',
                    copyEdgeId: mutation.copyEdgeId || '',
                    abortReason: mutation.abortReason || '',
                };
            }

            function copyCopyEdge(edge) {
                const projectionState = ensureProjectionStateRecord(edge);
                return {
                    edgeId: edge.edgeId,
                    sourceSurfaceId: edge.sourceSurfaceId,
                    targetSurfaceId: edge.targetSurfaceId,
                    sourceRect: cloneRect(edge.sourceRect),
                    targetRect: cloneRect(edge.targetRect),
                    scaleX: edge.scaleX,
                    scaleY: edge.scaleY,
                    sourceRevision: projectionState.sourceRevision,
                    targetRevision: projectionState.targetRevision,
                    sourceGeneration: projectionState.sourceGeneration,
                    targetGeneration: projectionState.targetGeneration,
                    createdByMutationId: edge.createdByMutationId,
                    targetRestoreMaterialId: stringify(edge.targetRestoreMaterialId || ''),
                    targetRestoreRect: cloneRect(edge.targetRestoreRect),
                    targetRestoreRevisionBefore: normalizeOptionalRevision(edge.targetRestoreRevisionBefore),
                    sourceTextRuns: copyTextRuns(edge.sourceTextRuns),
                    projectedTargetRecords: copyProjectedTargetRecords(edge.projectedTargetRecords, edge),
                    projectionState: copyProjectionStateRecord(projectionState),
                };
            }

            function createProjectionCopyEdgeDescriptor(edge) {
                const projectionState = ensureProjectionStateRecord(edge);
                return Object.assign({}, edge, {
                    sourceRevision: projectionState.sourceRevision,
                    targetRevision: projectionState.targetRevision,
                    sourceGeneration: projectionState.sourceGeneration,
                    targetGeneration: projectionState.targetGeneration,
                    projectionState: copyProjectionStateRecord(projectionState),
                });
            }

            function ensureProjectionStateRecord(edge) {
                if (!edge) return createProjectionStateRecord(null);
                if (!edge.projectionState || typeof edge.projectionState !== 'object') {
                    edge.projectionState = createProjectionStateRecord(edge);
                }
                return edge.projectionState;
            }

            function createProjectionStateRecord(edge, input = {}) {
                const source = input && typeof input === 'object' ? input : {};
                return {
                    projectionId: stringify(edge && edge.edgeId || ''),
                    edgeId: stringify(edge && edge.edgeId || ''),
                    status: stringify(source.status || 'current') || 'current',
                    sourceSurfaceId: stringify(edge && edge.sourceSurfaceId || ''),
                    targetSurfaceId: stringify(edge && edge.targetSurfaceId || ''),
                    sourceRect: cloneRect(edge && edge.sourceRect || null),
                    targetRect: cloneRect(edge && edge.targetRect || null),
                    baseSourceRevision: normalizeOptionalRevision(edge && edge.sourceRevision),
                    baseTargetRevision: normalizeOptionalRevision(edge && edge.targetRevision),
                    sourceRevision: normalizeOptionalRevision(source.sourceRevision !== undefined ? source.sourceRevision : edge && edge.sourceRevision),
                    targetRevision: normalizeOptionalRevision(source.targetRevision !== undefined ? source.targetRevision : edge && edge.targetRevision),
                    sourceGeneration: normalizeOptionalRevision(source.sourceGeneration !== undefined ? source.sourceGeneration : edge && edge.sourceGeneration),
                    targetGeneration: normalizeOptionalRevision(source.targetGeneration !== undefined ? source.targetGeneration : edge && edge.targetGeneration),
                    createdByMutationId: stringify(source.createdByMutationId || edge && edge.createdByMutationId || ''),
                    recoveredByTransactionId: stringify(source.recoveredByTransactionId || ''),
                    recoveredAtRevision: normalizeOptionalRevision(source.recoveredAtRevision),
                    recoveryReason: stringify(source.recoveryReason || ''),
                    damagedByMutationId: stringify(source.damagedByMutationId || ''),
                    damagedAtRevision: normalizeOptionalRevision(source.damagedAtRevision),
                    damageReason: stringify(source.damageReason || ''),
                    damageMethodName: stringify(source.damageMethodName || ''),
                    damageRect: cloneRect(source.damageRect || null),
                    damageFull: source.damageFull === true,
                };
            }

            function copyProjectionStateRecord(record) {
                if (!record || typeof record !== 'object') return null;
                return {
                    projectionId: stringify(record.projectionId || ''),
                    edgeId: stringify(record.edgeId || ''),
                    status: stringify(record.status || ''),
                    sourceSurfaceId: stringify(record.sourceSurfaceId || ''),
                    targetSurfaceId: stringify(record.targetSurfaceId || ''),
                    sourceRect: cloneRect(record.sourceRect),
                    targetRect: cloneRect(record.targetRect),
                    baseSourceRevision: normalizeOptionalRevision(record.baseSourceRevision),
                    baseTargetRevision: normalizeOptionalRevision(record.baseTargetRevision),
                    sourceRevision: normalizeOptionalRevision(record.sourceRevision),
                    targetRevision: normalizeOptionalRevision(record.targetRevision),
                    sourceGeneration: normalizeOptionalRevision(record.sourceGeneration),
                    targetGeneration: normalizeOptionalRevision(record.targetGeneration),
                    createdByMutationId: stringify(record.createdByMutationId || ''),
                    recoveredByTransactionId: stringify(record.recoveredByTransactionId || ''),
                    recoveredAtRevision: normalizeOptionalRevision(record.recoveredAtRevision),
                    recoveryReason: stringify(record.recoveryReason || ''),
                    damagedByMutationId: stringify(record.damagedByMutationId || ''),
                    damagedAtRevision: normalizeOptionalRevision(record.damagedAtRevision),
                    damageReason: stringify(record.damageReason || ''),
                    damageMethodName: stringify(record.damageMethodName || ''),
                    damageRect: cloneRect(record.damageRect || null),
                    damageFull: record.damageFull === true,
                };
            }

            function clonePlainValue(value, seen = null) {
                if (value === null || value === undefined) return null;
                if (Array.isArray(value)) return value.map((item) => clonePlainValue(item, seen));
                if (typeof value !== 'object') return value;
                if (value.surfaceId) return { surfaceId: stringify(value.surfaceId) };
                const visited = seen || new WeakSet();
                if (visited.has(value)) return '[cycle]';
                visited.add(value);
                const output = {};
                Object.keys(value).forEach((key) => {
                    const item = value[key];
                    if (typeof item === 'function') return;
                    output[key] = clonePlainValue(item, visited);
                });
                return output;
            }

            function cloneArgList(value, resolveSurfaceRecord = null) {
                if (!Array.isArray(value)) return [];
                return value.map((item) => cloneArgValue(item, resolveSurfaceRecord));
            }

            function cloneArgValue(value, resolveSurfaceRecord = null) {
                if (value === null || value === undefined) return value;
                const type = typeof value;
                if (type === 'string' || type === 'number' || type === 'boolean') return value;
                if (Array.isArray(value)) return value.map((item) => cloneArgValue(item, resolveSurfaceRecord));
                if (type === 'object') {
                    const record = typeof resolveSurfaceRecord === 'function'
                        ? resolveSurfaceRecord(value)
                        : null;
                    if (record && record.surfaceId) return { surfaceId: stringify(record.surfaceId) };
                    if (value.surfaceId) return { surfaceId: stringify(value.surfaceId) };
                    return '[object]';
                }
                return stringify(value);
            }

            function copyPlainObject(value) {
                return value && typeof value === 'object' && !Array.isArray(value)
                    ? clonePlainValue(value)
                    : {};
            }

            function cloneStringList(value) {
                if (!Array.isArray(value)) return [];
                return value.map((item) => stringify(item)).filter(Boolean);
            }

            function pruneArray(items, maxLength) {
                if (!Array.isArray(items) || items.length <= maxLength) return;
                items.splice(0, items.length - maxLength);
            }

            function normalizeTextMethodName(value) {
                const methodName = stringify(value || 'drawText');
                return methodName || 'drawText';
            }

            function normalizeCanvasTextAlign(align) {
                const value = stringify(align).toLowerCase();
                return ['left', 'right', 'center', 'start', 'end'].indexOf(value) >= 0 ? value : 'left';
            }

            function stringify(value) {
                try { return String(value ?? ''); } catch (_) { return ''; }
            }

            function finiteNumber(value, fallback) {
                const numeric = Number(value);
                return Number.isFinite(numeric) ? numeric : fallback;
            }

            function nonNegativeNumber(value, fallback) {
                const numeric = Number(value);
                return Number.isFinite(numeric) && numeric >= 0 ? numeric : fallback;
            }

            function normalizeOptionalRevision(value) {
                const numeric = Number(value);
                return Number.isFinite(numeric) && numeric >= 0 ? numeric : undefined;
            }

            function positiveNumber(...values) {
                for (const value of values) {
                    const numeric = Number(value);
                    if (Number.isFinite(numeric) && numeric > 0) return numeric;
                }
                return 1;
            }

            function positiveInteger(value, fallback) {
                const numeric = Number(value);
                return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : fallback;
            }

            function nonNegativeInteger(value, fallback) {
                const numeric = Number(value);
                return Number.isFinite(numeric) && numeric >= 0 ? Math.floor(numeric) : fallback;
            }

            function readPositiveInteger(value, fallback) {
                const numeric = Number(value);
                return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : fallback;
            }

            function freezeApi(api) {
                try { return Object.freeze(api); } catch (_) { return api; }
            }

            return {
                createSurfaceLedger,
            };
        },
    });
})();
