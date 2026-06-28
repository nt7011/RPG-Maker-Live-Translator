// Copied-text projection payload synchronization.
//
// Copy edges are created when pixels move, while translated display text often
// resolves later. This service attaches that late display payload to the
// existing copy edge so target recovery can render copied text without relying
// on adapter-local source entry lifetime.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'runtime.bitmap.copiedTextProjectionSync',
        requires: {
            copiedTextProjection: 'runtime.bitmap.copiedTextProjection',
        },
        factory({ copiedTextProjection }) {

            const createCopiedTextProjectionPayload = copiedTextProjection.createCopiedTextProjectionPayload;
            const copyCopiedTextProjectionRecord = copiedTextProjection.copyCopiedTextProjectionRecord;

            function createCopiedTextProjectionSync(deps = {}) {
                const upsertCopyEdgeProjectedTargetRecord = typeof deps.upsertCopyEdgeProjectedTargetRecord === 'function'
                    ? deps.upsertCopyEdgeProjectedTargetRecord
                    : null;
                if (!upsertCopyEdgeProjectedTargetRecord) {
                    throw new Error('[LiveTranslator] runtime.bitmap.copiedTextProjectionSync requires upsertCopyEdgeProjectedTargetRecord.');
                }
                const reportError = typeof deps.reportError === 'function'
                    ? deps.reportError
                    : () => {};

                function recordCopiedTextTargetPayload(input = {}) {
                    const source = input && (input.source || input.entry || input.textRun) || {};
                    const targets = normalizeTargets(input && (input.targets || input.materializedTargets || input.target));
                    const display = createDisplayPayload(source, input);
                    const summary = {
                        attempted: targets.length,
                        recorded: 0,
                        skipped: 0,
                        records: [],
                        payloadStatus: display.payloadStatus,
                        payloadReason: display.payloadReason,
                    };
                    if (!targets.length) return summary;
                    if (display.payloadStatus !== 'ready' || !display.displayText) {
                        summary.skipped = targets.length;
                        return freezeSummary(summary);
                    }
                    targets.forEach((target) => {
                        const record = createProjectedTargetRecord(source, target, display, input);
                        if (!record) {
                            summary.skipped += 1;
                            return;
                        }
                        try {
                            const stored = upsertCopyEdgeProjectedTargetRecord({
                                edgeId: record.edgeId || record.copyEdgeId || '',
                                record,
                            });
                            if (stored) {
                                summary.recorded += 1;
                                summary.records.push(stored);
                            } else {
                                summary.skipped += 1;
                            }
                        } catch (error) {
                            summary.skipped += 1;
                            reportError('copiedTextProjectionSync.upsert', error, { record });
                        }
                    });
                    return freezeSummary(summary);
                }

                return freezeApi({
                    recordCopiedTextTargetPayload,
                });
            }

            function createDisplayPayload(source, input = {}) {
                const display = input && input.display && typeof input.display === 'object'
                    ? input.display
                    : {};
                const displayText = firstText(input.displayText, display.text, input.text);
                const displayTextSource = stringify(input.displayTextSource || display.source || '');
                const sourceText = firstText(
                    input.sourceText,
                    source && source.sourceText,
                    source && source.visibleText,
                    source && source.rawText,
                    source && source.text
                );
                const renderedText = displayTextSource === 'native'
                    ? firstText(input.renderedText, source && source.renderedText)
                    : firstText(
                        input.renderedText,
                        displayText,
                        source && source.renderedText,
                        source && source.translationDrawn,
                        source && source.translation
                    );
                return createCopiedTextProjectionPayload({
                    renderedText,
                    displayText,
                    displayTextSource,
                    sourceText,
                }, {
                    allowNativeFallback: displayTextSource === 'native',
                });
            }

            function createProjectedTargetRecord(source, target, display, input = {}) {
                if (!target || typeof target !== 'object') return null;
                const edgeId = stringify(target.edgeId || target.copyEdgeId || input.edgeId || input.copyEdgeId || '');
                const targetRestoreMaterial = target.targetRestoreMaterial && typeof target.targetRestoreMaterial === 'object'
                    ? target.targetRestoreMaterial
                    : {};
                return copyCopiedTextProjectionRecord({
                    providerToken: stringify(input.providerToken || target.providerToken || ''),
                    sourceAdapter: stringify(input.sourceAdapter || target.sourceAdapter || source && source.sourceAdapter || ''),
                    entryId: stringify(input.entryId || target.entryId || createSourceEntryId(source)),
                    sourceSurfaceId: stringify(target.sourceSurfaceId || input.sourceSurfaceId || source && source.sourceSurfaceId || ''),
                    sourceRunId: stringify(target.sourceRunId || input.sourceRunId || source && source.sourceRunId || ''),
                    sourceSlotKey: stringify(target.sourceSlotKey || input.sourceSlotKey || source && source.sourceSlotKey || ''),
                    sourceBounds: target.sourceBounds || input.sourceBounds || source && (source.bounds || source.sourceBounds) || null,
                    targetSurfaceId: stringify(target.targetSurfaceId || input.targetSurfaceId || ''),
                    targetBounds: target.targetBounds || target.bounds || input.targetBounds || input.bounds || null,
                    bounds: target.targetBounds || target.bounds || input.targetBounds || input.bounds || null,
                    copyEdgeId: edgeId,
                    edgeId,
                    targetRestoreMaterialId: stringify(
                        target.targetRestoreMaterialId
                        || targetRestoreMaterial.materialId
                        || input.targetRestoreMaterialId
                        || ''
                    ),
                    targetRestoreRect: target.targetRestoreRect || targetRestoreMaterial.rect || input.targetRestoreRect || null,
                    targetRestoreRevisionBefore: target.targetRestoreRevisionBefore !== undefined
                        ? target.targetRestoreRevisionBefore
                        : (targetRestoreMaterial.targetRevisionBefore !== undefined
                            ? targetRestoreMaterial.targetRevisionBefore
                            : input.targetRestoreRevisionBefore),
                    targetRevision: target.targetRevision !== undefined ? target.targetRevision : input.targetRevision,
                    renderedText: display.renderedText,
                    displayText: display.displayText,
                    displayTextSource: display.displayTextSource,
                    sourceText: display.sourceText,
                    drawGeometry: target.drawGeometry || target.drawParams || input.drawGeometry || input.drawParams || source && source.drawParams || null,
                    drawState: target.drawState || input.drawState || source && source.drawState || null,
                    sourceDrawOrder: source && source.drawOrder !== undefined ? source.drawOrder : (target.sourceDrawOrder || input.sourceDrawOrder),
                    textType: stringify(input.textType || target.textType || source && (source.textType || source.entryType) || ''),
                    methodName: stringify(input.methodName || target.methodName || source && source.methodName || ''),
                });
            }

            function normalizeTargets(value) {
                if (Array.isArray(value)) return value.filter(Boolean);
                return value ? [value] : [];
            }

            function createSourceEntryId(source) {
                if (!source || typeof source !== 'object') return '';
                return stringify(source.recordId || source.itemId || source.id || source.key || '');
            }

            function freezeSummary(summary) {
                summary.records = summary.records.map((record) => copyCopiedTextProjectionRecord(record)).filter(Boolean);
                return freezeApi(summary);
            }

            function firstText(...values) {
                for (let index = 0; index < values.length; index += 1) {
                    if (values[index] === undefined || values[index] === null) continue;
                    const text = stringify(values[index]);
                    if (text) return text;
                }
                return '';
            }

            function stringify(value) {
                try { return String(value ?? ''); } catch (_) { return ''; }
            }

            function freezeApi(api) {
                try { return Object.freeze(api); } catch (_) { return api; }
            }

            return freezeApi({
                createCopiedTextProjectionSync,
            });
        },
    });
})();
