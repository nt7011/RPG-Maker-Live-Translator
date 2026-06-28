// Window text adapter support: replay item composition and replay drawing.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'adapters.windowText.replayComposition',
        requires: {
            drawGraph: 'runtime.drawGraph',
            replayFilter: 'runtime.replayFilter',
        },
        factory({ drawGraph, replayFilter }) {

    function createReplayCompositionController(context = {}) {
        const { entryLifecycleState } = context;
        const {
            windowEntryBelongsToContents: windowEntryBelongsToContentsCallback,
            replayRectsOverlap: replayRectsOverlapCallback,
        } = context;
        const services = context.services || {};
        const facades = context.facades || {};
        const bitmapTools = context.bitmapTools || {};
        const { draw: drawService = {} } = services;
        const { entryRecords = {}, renderDraw = {}, textConversion = {} } = facades;
        const { getEntryStatus, isEntryCompleted, firstNonEmptyString } = entryRecords;
        const { drawTranslatedWindowText } = renderDraw;
        const { sanitizeDrawTextOutput } = textConversion;
        const {
            isValidRect,
            getReplayItemRect,
            getBitmapCanvasContext,
            getReplayClipArea,
        } = bitmapTools;
        const windowEntryBelongsToContents = requireFunction(windowEntryBelongsToContentsCallback, 'windowEntryBelongsToContents');
        const replayRectsOverlap = requireFunction(replayRectsOverlapCallback, 'replayRectsOverlap');
        requireFunction(getEntryStatus, 'entryRecords.getEntryStatus');
        requireFunction(isEntryCompleted, 'entryRecords.isEntryCompleted');
        requireFunction(firstNonEmptyString, 'entryRecords.firstNonEmptyString');
        requireFunction(drawTranslatedWindowText, 'renderDraw.drawTranslatedWindowText');
        requireFunction(sanitizeDrawTextOutput, 'textConversion.sanitizeDrawTextOutput');
        requireFunction(isValidRect, 'bitmapTools.isValidRect');
        requireFunction(getReplayItemRect, 'bitmapTools.getReplayItemRect');
        requireFunction(getBitmapCanvasContext, 'bitmapTools.getBitmapCanvasContext');
        requireFunction(getReplayClipArea, 'bitmapTools.getReplayClipArea');

        const replayFilterService = replayFilter.create({
            getItemRect: getReplayItemRect,
            getEntryStatus,
            isEntryCompleted,
            firstNonEmptyString,
        });

        function collectWindowTextReplayItems(windowData, currentEntry, contents, dirtyRect, currentOrder, options = {}) {
            if (!windowData || !windowData.texts || typeof windowData.texts.forEach !== 'function') return [];
            const protectedEntries = createProtectedReplayEntrySet(options.protectedEntries || options.protectedWindowEntries);
            if (!dirtyRect && protectedEntries.size <= 0) return [];
            const items = [];
            try {
                windowData.texts.forEach((entry) => {
                    if (!entry || entry === currentEntry || entryLifecycleState.isStale(entry)) return;
                    if (!windowEntryBelongsToContents(entry, contents)) return;
                    const replayBounds = getWindowTextReplayBounds(entry);
                    if (!replayBounds) return;
                    // Horizontal fit can make a neighboring entry a logical
                    // redraw dependency even when the clear rect is capped
                    // before that neighbor. Keep those dependencies explicit
                    // instead of inflating every replay rect.
                    const protectedDependency = protectedEntries.has(entry);
                    if (!protectedDependency && (!dirtyRect || !replayRectsOverlap(dirtyRect, replayBounds))) return;
                    const drawOrder = Number(entry.drawOrder) || (Number(currentOrder) + 0.5);
                    items.push({
                        type: 'windowText',
                        drawOrder,
                        entry,
                        protectedReplayDependency: protectedDependency,
                    });
                });
            } catch (_) {}
            return items;
        }

        function getWindowTextReplayBounds(entry) {
            if (!entry) return null;
            if (isValidRect(entry.renderedBounds)) return entry.renderedBounds;
            return isValidRect(entry.bounds) ? entry.bounds : null;
        }

        function combineReplayItems(bitmapItems, windowItems) {
            return replayFilterService.combineReplayItems(bitmapItems, windowItems);
        }

        function filterReplayForEntry(items, entry) {
            return replayFilterService.filterReplayForEntry(items, entry, {
                targetBitmap: entry && entry.contentsBitmap || null,
            });
        }

        function replayMixedItems(contents, targetWindow, items, replayApi, clipRect = null, options = {}) {
            if (!contents || !Array.isArray(items) || !items.length) return;
            const replayGraph = drawGraph.createDrawGraph(items, {
                getItemRect: getReplayItemRect,
                targetBitmap: contents,
            });
            const replay = () => {
                replayGraph.nodes.forEach((node) => {
                    const item = node && node.item;
                    if (!item) return;
                    if (item.type === 'windowText') {
                        replayWindowTextEntry(targetWindow, contents, item.entry, options);
                    } else if (replayApi && typeof replayApi.replayBitmapItems === 'function') {
                        replayApi.replayBitmapItems(contents, [item]);
                    }
                });
            };
            return withBitmapReplayClip(contents, clipRect, replay);
        }

        function replayWindowTextEntry(targetWindow, contents, entry, options = {}) {
            if (!targetWindow || !contents || !entry || entryLifecycleState.isStale(entry)) return;
            const text = getWindowReplayText(entry);
            if (!text) return;
            return withWindowReplayDrawState(contents, entry.drawState, () => {
                const textFit = options && typeof options.resolveTextFit === 'function'
                    ? options.resolveTextFit(entry, text)
                    : null;
                return drawTranslatedWindowText(targetWindow, contents, entry, text, {
                    route: 'replay',
                    textFit,
                });
            });
        }

        function withWindowReplayDrawState(contents, drawState, callback) {
            if (typeof callback !== 'function') return undefined;
            const applyDrawState = drawService && typeof drawService.applyBitmapDrawState === 'function'
                ? drawService.applyBitmapDrawState
                : null;
            // Replay is a nested draw. It can borrow the replay entry's
            // font settings, but must leave the caller's Bitmap state
            // exactly as it found it.
            const previousDrawState = contents && applyDrawState && typeof drawService.captureBitmapDrawState === 'function'
                ? drawService.captureBitmapDrawState(contents)
                : null;
            try {
                if (contents && drawState && applyDrawState) {
                    try { applyDrawState(contents, drawState); } catch (_) {}
                }
                return callback();
            } finally {
                if (contents && previousDrawState && applyDrawState) {
                    try { applyDrawState(contents, previousDrawState); } catch (_) {}
                }
            }
        }

        function getWindowReplayText(entry) {
            if (!entry) return '';
            if (isEntryCompleted(entry)) {
                return sanitizeDrawTextOutput(entry.renderedText, entry.type);
            }
            return sanitizeDrawTextOutput(entry.convertedText || entry.visibleText || entry.rawText || '', entry.type);
        }

        function withBitmapReplayClip(contents, rect, callback) {
            if (typeof callback !== 'function') return undefined;
            const canvasContext = getBitmapCanvasContext(contents);
            const area = getReplayClipArea(contents, rect);
            if (!canvasContext || !area) return callback();
            canvasContext.save();
            try {
                if (typeof canvasContext.beginPath === 'function') canvasContext.beginPath();
                canvasContext.rect(area.x, area.y, area.w, area.h);
                canvasContext.clip();
                return callback();
            } finally {
                canvasContext.restore();
            }
        }

        function createProtectedReplayEntrySet(entries) {
            const protectedEntries = new Set();
            if (!Array.isArray(entries)) return protectedEntries;
            entries.forEach((entry) => {
                if (entry && typeof entry === 'object') protectedEntries.add(entry);
            });
            return protectedEntries;
        }

        return {
            collectWindowTextReplayItems,
            combineReplayItems,
            filterReplayForEntry,
            replayMixedItems,
            replayWindowTextEntry,
            getWindowReplayText,
            withBitmapReplayClip,
        };
    }

    function requireFunction(value, name) {
        if (typeof value !== 'function') {
            throw new Error(`[WindowText] replay composition requires ${name}.`);
        }
        return value;
    }
            return { create: createReplayCompositionController };
        },
    });
})();
