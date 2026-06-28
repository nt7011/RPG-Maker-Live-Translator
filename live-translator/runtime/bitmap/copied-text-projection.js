// Shared copied-text projection contract.
//
// Copy edges can outlive the source adapter entry that produced them.  This
// module owns the durable projection payload so copied-target recovery does
// not have to rediscover translated/native display text from adapter-local
// state after the source entry is detached.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'runtime.bitmap.copiedTextProjection',
        requires: {
            rectGeometry: 'runtime.bitmap.rectGeometry',
        },
        factory({ rectGeometry }) {

            const cloneRect = rectGeometry.cloneRect;

            function createCopiedTextProjectionPayload(source = {}, options = {}) {
                const renderedText = firstText(
                    source && source.renderedText,
                    source && source.translationDrawn,
                    source && source.translation,
                    options && options.renderedText
                );
                const explicitDisplayText = firstText(source && source.displayText, options && options.displayText);
                const explicitDisplaySource = firstText(source && source.displayTextSource, options && options.displayTextSource);
                const sourceText = firstText(
                    source && source.sourceText,
                    source && source.visibleText,
                    source && source.text,
                    options && options.sourceText
                );
                if (renderedText) {
                    return createPayload({
                        renderedText,
                        displayText: explicitDisplayText || renderedText,
                        displayTextSource: explicitDisplaySource || 'translated',
                        sourceText,
                        payloadStatus: 'ready',
                        payloadReason: '',
                    });
                }
                if (explicitDisplayText) {
                    return createPayload({
                        renderedText: '',
                        displayText: explicitDisplayText,
                        displayTextSource: explicitDisplaySource || 'native',
                        sourceText,
                        payloadStatus: 'ready',
                        payloadReason: '',
                    });
                }
                if ((options && options.allowNativeFallback === true) && explicitDisplaySource === 'native' && sourceText) {
                    return createPayload({
                        renderedText: '',
                        displayText: sourceText,
                        displayTextSource: 'native',
                        sourceText,
                        payloadStatus: 'ready',
                        payloadReason: '',
                    });
                }
                return createPayload({
                    renderedText: '',
                    displayText: '',
                    displayTextSource: explicitDisplaySource,
                    sourceText,
                    payloadStatus: 'missing-display-text',
                    payloadReason: 'missing-display-text',
                });
            }

            function copyCopiedTextProjectionRecord(record = {}, options = {}) {
                if (!record || typeof record !== 'object') return null;
                const payload = createCopiedTextProjectionPayload(record, options);
                return {
                    projectionId: stringify(record.projectionId || options.projectionId || ''),
                    providerToken: stringify(record.providerToken || options.providerToken || ''),
                    sourceAdapter: stringify(record.sourceAdapter || record.adapterId || options.sourceAdapter || ''),
                    entryId: stringify(record.entryId || record.recordId || record.itemId || options.entryId || ''),
                    sourceSurfaceId: stringify(record.sourceSurfaceId || options.sourceSurfaceId || ''),
                    sourceRunId: stringify(record.sourceRunId || options.sourceRunId || ''),
                    sourceSlotKey: stringify(record.sourceSlotKey || options.sourceSlotKey || ''),
                    sourceBounds: cloneRect(record.sourceBounds || options.sourceBounds || null),
                    targetSurfaceId: stringify(record.targetSurfaceId || options.targetSurfaceId || ''),
                    targetBounds: cloneRect(record.targetBounds || record.bounds || options.targetBounds || null),
                    bounds: cloneRect(record.bounds || record.targetBounds || options.bounds || options.targetBounds || null),
                    copyEdgeId: stringify(record.copyEdgeId || record.edgeId || options.copyEdgeId || options.edgeId || ''),
                    edgeId: stringify(record.edgeId || record.copyEdgeId || options.edgeId || options.copyEdgeId || ''),
                    targetRestoreMaterialId: stringify(record.targetRestoreMaterialId || options.targetRestoreMaterialId || ''),
                    targetRestoreRect: cloneRect(record.targetRestoreRect || options.targetRestoreRect || null),
                    targetRestoreRevisionBefore: optionalNonNegativeNumber(record.targetRestoreRevisionBefore, options.targetRestoreRevisionBefore),
                    targetRevision: optionalNonNegativeNumber(record.targetRevision, options.targetRevision),
                    renderedText: payload.renderedText,
                    displayText: payload.displayText,
                    displayTextSource: payload.displayTextSource,
                    sourceText: payload.sourceText,
                    payloadStatus: payload.payloadStatus,
                    payloadReason: payload.payloadReason,
                    drawGeometry: clonePlainValue(record.drawGeometry || record.drawParams || options.drawGeometry || null),
                    drawState: copyPlainObject(record.drawState || options.drawState || null),
                    sourceDrawOrder: optionalNonNegativeNumber(record.sourceDrawOrder || record.drawOrder, options.sourceDrawOrder),
                    textType: stringify(record.textType || record.entryType || record.drawTextType || options.textType || ''),
                    methodName: stringify(record.methodName || options.methodName || ''),
                };
            }

            function hasCopiedTextProjectionPayload(record) {
                const payload = record && typeof record === 'object'
                    ? createCopiedTextProjectionPayload(record)
                    : null;
                return !!(payload && payload.payloadStatus === 'ready' && payload.displayText);
            }

            function getCopiedTextProjectionPayloadStatus(record) {
                const payload = record && typeof record === 'object'
                    ? createCopiedTextProjectionPayload(record)
                    : null;
                return payload ? payload.payloadStatus : 'missing-display-text';
            }

            function createPayload(input) {
                return Object.freeze({
                    renderedText: stringify(input.renderedText || ''),
                    displayText: stringify(input.displayText || ''),
                    displayTextSource: stringify(input.displayTextSource || ''),
                    sourceText: stringify(input.sourceText || ''),
                    payloadStatus: stringify(input.payloadStatus || ''),
                    payloadReason: stringify(input.payloadReason || ''),
                });
            }

            function firstText(...values) {
                for (let index = 0; index < values.length; index += 1) {
                    if (values[index] === undefined || values[index] === null) continue;
                    const text = stringify(values[index]);
                    if (text) return text;
                }
                return '';
            }

            function copyPlainObject(value) {
                return value && typeof value === 'object' && !Array.isArray(value)
                    ? clonePlainValue(value)
                    : null;
            }

            function clonePlainValue(value, seen = null) {
                if (value === null || value === undefined) return null;
                if (Array.isArray(value)) return value.map((item) => clonePlainValue(item, seen));
                if (typeof value !== 'object') return value;
                const activeSeen = seen || new WeakMap();
                if (activeSeen.has(value)) return activeSeen.get(value);
                const output = {};
                activeSeen.set(value, output);
                Object.keys(value).forEach((key) => {
                    output[key] = clonePlainValue(value[key], activeSeen);
                });
                return output;
            }

            function optionalNonNegativeNumber(value, fallback) {
                const numeric = Number(value);
                if (Number.isFinite(numeric) && numeric >= 0) return numeric;
                const fallbackNumeric = Number(fallback);
                return Number.isFinite(fallbackNumeric) && fallbackNumeric >= 0 ? fallbackNumeric : null;
            }

            function stringify(value) {
                try { return String(value ?? ''); } catch (_) { return ''; }
            }

            function freezeApi(api) {
                try { return Object.freeze(api); } catch (_) { return api; }
            }

            return freezeApi({
                createCopiedTextProjectionPayload,
                copyCopiedTextProjectionRecord,
                hasCopiedTextProjectionPayload,
                getCopiedTextProjectionPayloadStatus,
            });
        },
    });
})();
