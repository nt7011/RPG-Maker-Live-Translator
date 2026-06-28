// Shared replay filtering for translated text redraws.
//
// The window and bitmap adapters can both contribute replay items. This module
// owns the adapter-neutral rules that decide which items are safe to replay
// around the entry currently being redrawn.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'runtime.replayFilter',
        requires: {
            drawGraph: 'runtime.drawGraph',
            entryLifecycle: 'runtime.entryLifecycle',
        },
        factory({ drawGraph, entryLifecycle }) {
            function createReplayFilter(deps = {}) {
                const getItemRect = typeof deps.getItemRect === 'function' ? deps.getItemRect : null;
                const getEntryStatus = typeof deps.getEntryStatus === 'function' ? deps.getEntryStatus : defaultGetEntryStatus;
                const isEntryCompleted = typeof deps.isEntryCompleted === 'function' ? deps.isEntryCompleted : defaultIsEntryCompleted;
                const firstNonEmptyString = typeof deps.firstNonEmptyString === 'function'
                    ? deps.firstNonEmptyString
                    : defaultFirstNonEmptyString;

                function combineReplayItems(bitmapItems, windowItems, options = {}) {
                    const items = []
                        .concat(Array.isArray(bitmapItems) ? bitmapItems : [])
                        .concat(Array.isArray(windowItems) ? windowItems : []);
                    return toReplayItems(items, options);
                }

                function filterReplayForEntry(items, entry, options = {}) {
                    const graph = createGraph(items, entry, options);
                    if (!entry) return drawGraph.toReplayItems(graph);
                    return drawGraph.toReplayItems(graph.nodes.filter((node) => shouldReplayNodeForEntry(node, entry)));
                }

                function createGraph(items, entry = null, options = {}) {
                    return drawGraph.createDrawGraph(Array.isArray(items) ? items : [], {
                        getItemRect: typeof options.getItemRect === 'function' ? options.getItemRect : getItemRect,
                        targetBitmap: options.targetBitmap || (entry && entry.contentsBitmap) || null,
                    });
                }

                function toReplayItems(items, options = {}) {
                    return drawGraph.toReplayItems(createGraph(items, null, options));
                }

                function shouldReplayNodeForEntry(node, entry) {
                    const item = node && node.item;
                    if (!item) return false;
                    // Redraw replay must restore neighboring art and text, but never the
                    // native source draw that this translated entry replaces.
                    if (isCurrentEntrySourceReplayItem(item, entry)) return false;
                    // Pending translated text is still native source text on the canvas.
                    // Replaying it during another entry's redraw can leave source glyphs
                    // outside the later translated ink. Completed, skipped, and failed
                    // entries remain replayable.
                    if (isPendingTranslatedReplayItem(item)) return false;
                    return !(entry.type === 'drawTextEx'
                        && node.type === 'renderOp'
                        && item.op
                        && item.op.windowDrawTextExReplay);
                }

                function isPendingTranslatedReplayItem(item) {
                    const entry = item && (item.type === 'windowText' || item.type === 'text')
                        ? item.entry
                        : null;
                    if (!entry || isEntryCompleted(entry)) return false;
                    if (entry.skipReason || entryLifecycle.isStale(entry)) return false;
                    const status = getReplayEntryStatus(entry);
                    return status === 'detected'
                        || status === 'pending'
                        || status === 'queued'
                        || status === 'translating';
                }

                function getReplayEntryStatus(entry) {
                    try {
                        const status = getEntryStatus(entry);
                        if (status) return normalizeReplayStatus(status);
                    } catch (_) {}
                    return normalizeReplayStatus(entry && entry.status);
                }

                function isCurrentEntrySourceReplayItem(item, entry) {
                    if (!item || !entry) return false;
                    if (item.type === 'windowText') {
                        return isWindowTextReplayForEntry(item.entry, entry);
                    }
                    if (item.type === 'text') {
                        return isBitmapTextReplayForEntry(item.entry, entry);
                    }
                    if (item.type === 'renderOp') {
                        return isNativeTextRenderOpForEntry(item.op, entry);
                    }
                    return false;
                }

                function isWindowTextReplayForEntry(candidate, entry) {
                    if (!candidate || !entry) return false;
                    if (candidate === entry) return true;
                    if (candidate.recordId && entry.recordId && candidate.recordId === entry.recordId) return true;
                    if (candidate.slotKey && entry.slotKey && candidate.slotKey !== entry.slotKey) return false;
                    return replayTextMatchesEntry(
                        firstNonEmptyString(candidate.rawText, candidate.convertedText, candidate.visibleText),
                        entry
                    ) && replayPositionMatchesEntry(candidate.position && candidate.position.x, candidate.position && candidate.position.y, entry);
                }

                function isBitmapTextReplayForEntry(candidate, entry) {
                    if (!candidate || !entry) return false;
                    const params = candidate.drawParams || {};
                    return replayTextMatchesEntry(firstNonEmptyString(candidate.rawText, candidate.visibleText), entry)
                        && replayPositionMatchesEntry(params.x, params.y, entry)
                        && replayWidthMatchesEntry(params.maxWidth, entry)
                        && replayAlignMatchesEntry(params.align, entry);
                }

                function isNativeTextRenderOpForEntry(op, entry) {
                    if (!op || !entry || !isNativeTextReplayMethod(op.methodName)) return false;
                    const args = Array.isArray(op.args) ? op.args : [];
                    return replayTextMatchesEntry(firstNonEmptyString(args[0], op.textPreview), entry)
                        && replayPositionMatchesEntry(args[1], args[2], entry)
                        && replayWidthMatchesEntry(args[3], entry)
                        && replayAlignMatchesEntry(args[5], entry);
                }

                function replayTextMatchesEntry(text, entry) {
                    const replayText = normalizeReplayText(text);
                    if (!replayText) return false;
                    const rawText = normalizeReplayText(entry && entry.rawText);
                    const convertedText = normalizeReplayText(entry && entry.convertedText);
                    const visibleText = normalizeReplayText(entry && entry.visibleText);
                    return replayText === rawText || replayText === convertedText || replayText === visibleText;
                }

                function replayPositionMatchesEntry(x, y, entry) {
                    const position = entry && entry.position ? entry.position : {};
                    return numbersNearlyEqual(x, position.x) && numbersNearlyEqual(y, position.y);
                }

                function replayWidthMatchesEntry(width, entry) {
                    const expected = entry && entry.originalParams ? entry.originalParams.maxWidth : null;
                    if (!Number.isFinite(Number(width)) || !Number.isFinite(Number(expected))) return true;
                    return numbersNearlyEqual(width, expected);
                }

                function replayAlignMatchesEntry(align, entry) {
                    const expected = entry && entry.originalParams ? entry.originalParams.align : null;
                    if (align === undefined || align === null || expected === undefined || expected === null) return true;
                    return String(align || '') === String(expected || '');
                }

                return {
                    combineReplayItems,
                    filterReplayForEntry,
                    shouldReplayNodeForEntry,
                };
            }

            function isNativeTextReplayMethod(methodName) {
                return /^(drawText|drawTextS|drawTextM)$/u.test(String(methodName || ''));
            }

            function normalizeReplayText(value) {
                return String(value ?? '').trim();
            }

            function normalizeReplayStatus(value) {
                return String(value ?? '').trim().toLowerCase();
            }

            function numbersNearlyEqual(left, right) {
                const a = Number(left);
                const b = Number(right);
                return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 0.5;
            }

            function defaultGetEntryStatus(entry) {
                return entry && entry.status;
            }

            function defaultIsEntryCompleted(entry) {
                return normalizeReplayStatus(entry && entry.status) === 'completed';
            }

            function defaultFirstNonEmptyString(...values) {
                for (const value of values) {
                    const text = String(value ?? '');
                    if (text) return text;
                }
                return '';
            }

            return { create: createReplayFilter };
        },
    });
})();
