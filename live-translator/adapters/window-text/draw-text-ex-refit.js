// Window text adapter support: completed drawTextEx same-line refit.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'adapters.windowText.drawTextExRefit',
        factory() {

    function createDrawTextExRefitController(context = {}) {
        const services = context.services || {};
        const facades = context.facades || {};
        const { surface: surfaceService = {} } = services;
        const { bitmapReplay = {}, diagnostics = {}, entryRecords = {}, renderCommands = {}, textConversion = {}, textMetrics = {} } = facades;
        const entryLifecycleState = context.entryLifecycleState || {};
        const { isValidRect } = bitmapReplay;
        const { windowEntryBelongsToContents } = surfaceService;
        const { recordDecision, roundDiagnosticNumber } = diagnostics;
        const { getEntryStatus, isEntryCompleted } = entryRecords;
        const { redrawTranslatedText } = renderCommands;
        const { sanitizeDrawTextOutput } = textConversion;
        const { estimateEntryBounds } = textMetrics;
        requireFunction(isValidRect, 'bitmapReplay.isValidRect');
        requireFunction(windowEntryBelongsToContents, 'services.surface.windowEntryBelongsToContents');
        requireFunction(recordDecision, 'diagnostics.recordDecision');
        requireFunction(roundDiagnosticNumber, 'diagnostics.roundDiagnosticNumber');
        requireFunction(getEntryStatus, 'entryRecords.getEntryStatus');
        requireFunction(isEntryCompleted, 'entryRecords.isEntryCompleted');
        requireFunction(redrawTranslatedText, 'renderCommands.redrawTranslatedText');
        requireFunction(sanitizeDrawTextOutput, 'textConversion.sanitizeDrawTextOutput');
        requireFunction(estimateEntryBounds, 'textMetrics.estimateEntryBounds');
        requireFunction(entryLifecycleState.isStale, 'entryLifecycleState.isStale');

        function refitCompletedDrawTextExBeforeNeighbor(windowInstance, windowData, neighborEntry, reason = '') {
            if (!windowData || !neighborEntry || !windowData.texts || typeof windowData.texts.forEach !== 'function') return 0;
            if (!neighborEntry.position) return 0;
            if (entryLifecycleState.isStale(neighborEntry)) return 0;

            const contents = neighborEntry.contentsBitmap || (windowInstance && windowInstance.contents) || null;
            const neighborLeft = getRefitEntryLeft(neighborEntry);
            const neighborBand = getRefitEntryBand(windowInstance, neighborEntry);
            if (!Number.isFinite(neighborLeft) || !neighborBand) return 0;

            const candidates = [];
            try {
                windowData.texts.forEach((candidate) => {
                    if (!shouldConsiderDrawTextExRefitCandidate(windowInstance, contents, candidate, neighborEntry, neighborLeft, neighborBand)) return;
                    candidates.push(candidate);
                });
            } catch (_) {}
            if (!candidates.length) return 0;

            candidates.sort((left, right) => (Number(left.drawOrder) || 0) - (Number(right.drawOrder) || 0));
            let refitCount = 0;
            candidates.forEach((candidate) => {
                const refitKey = createDrawTextExRefitKey(candidate, neighborEntry);
                if (candidate.horizontalFitRefitKey === refitKey) return;
                const details = {
                    reason: String(reason || 'same-line-neighbor'),
                    neighborSlotKey: neighborEntry.slotKey || '',
                    neighborType: neighborEntry.type || '',
                    neighborStatus: getEntryStatus(neighborEntry, ''),
                    neighborLeft: roundDiagnosticNumber(neighborLeft),
                    candidateSlotKey: candidate.slotKey || '',
                };
                recordDecision(candidate, 'draw.refit', 'same-line right text boundary detected', details);
                const result = redrawTranslatedText(candidate, windowData);
                if (result && (result.status === 'committed' || result.status === 'deferred')) {
                    candidate.horizontalFitRefitKey = refitKey;
                    refitCount += 1;
                }
            });
            return refitCount;
        }

        function shouldConsiderDrawTextExRefitCandidate(windowInstance, contents, candidate, neighborEntry, neighborLeft, neighborBand) {
            if (!candidate || candidate === neighborEntry) return false;
            if (candidate.type !== 'drawTextEx') return false;
            if (!isEntryCompleted(candidate) || !candidate.renderedText) return false;
            if (entryLifecycleState.isStale(candidate)) return false;
            if (contents && !windowEntryBelongsToContents(candidate, contents)) return false;

            const candidateLeft = getRefitEntryLeft(candidate);
            if (!Number.isFinite(candidateLeft) || candidateLeft >= neighborLeft - 1) return false;
            const candidateBand = getRefitEntryBand(windowInstance, candidate);
            if (!refitBandsOverlap(candidateBand, neighborBand)) return false;

            const candidateRight = getRefitEntryRight(windowInstance, candidate);
            if (!Number.isFinite(candidateRight)) return false;
            const boundary = neighborLeft - getRefitGap(contents);
            return candidateRight > boundary + 0.5;
        }

        function createDrawTextExRefitKey(candidate, neighborEntry) {
            return [
                candidate && (candidate.recordId || candidate.key || candidate.slotKey) || '',
                Number(candidate && candidate.surfaceRevision) || 0,
                neighborEntry && (neighborEntry.recordId || neighborEntry.key || neighborEntry.slotKey) || '',
                Number(neighborEntry && neighborEntry.surfaceRevision) || 0,
            ].join('|');
        }

        function getRefitEntryLeft(entry) {
            const bounds = getStoredRefitBounds(entry);
            if (bounds) return Number(bounds.x1);
            const x = normalizeDrawableNumber(entry && entry.position && entry.position.x);
            return x === null ? NaN : x;
        }

        function getRefitEntryRight(windowInstance, entry) {
            const renderedBounds = getEstimatedRenderedRefitBounds(windowInstance, entry);
            if (renderedBounds) return Number(renderedBounds.x2);
            const stored = getStoredRefitBounds(entry);
            if (stored) return Number(stored.x2);
            return NaN;
        }

        function getRefitEntryBand(windowInstance, entry) {
            const bounds = getEstimatedRenderedRefitBounds(windowInstance, entry) || getStoredRefitBounds(entry);
            if (bounds) {
                return {
                    top: Number(bounds.y1),
                    bottom: Number(bounds.y2),
                };
            }
            const y = normalizeDrawableNumber(entry && entry.position && entry.position.y);
            if (y === null) return null;
            const lineHeight = getRefitLineHeight(windowInstance, entry);
            return {
                top: y,
                bottom: y + lineHeight,
            };
        }

        function getEstimatedRenderedRefitBounds(windowInstance, entry) {
            if (!entry) return null;
            if (isValidRect(entry.renderedBounds)) return entry.renderedBounds;
            if (!entry.renderedText) return null;
            const position = entry.position || {};
            try {
                const rendered = sanitizeDrawTextOutput(entry.renderedText, entry.type);
                return estimateEntryBounds(
                    windowInstance || entry.ownerWindow,
                    entry.type,
                    rendered,
                    position.x,
                    position.y,
                    rendered,
                    entry.originalParams
                );
            } catch (_) {
                return null;
            }
        }

        function getStoredRefitBounds(entry) {
            if (!entry) return null;
            if (isValidRect(entry.renderedBounds)) return entry.renderedBounds;
            return isValidRect(entry.bounds) ? entry.bounds : null;
        }

        function getRefitLineHeight(windowInstance, entry) {
            const params = entry && entry.originalParams || {};
            const lineHeight = Number(params.lineHeight);
            if (Number.isFinite(lineHeight) && lineHeight > 0) return lineHeight;
            if (windowInstance && typeof windowInstance.lineHeight === 'function') {
                try {
                    const value = Number(windowInstance.lineHeight());
                    if (Number.isFinite(value) && value > 0) return value;
                } catch (_) {}
            }
            const contents = entry && entry.contentsBitmap || (windowInstance && windowInstance.contents) || null;
            const fontSize = Number(contents && contents.fontSize);
            return Number.isFinite(fontSize) && fontSize > 0 ? Math.ceil(fontSize * 1.5) : 36;
        }

        function refitBandsOverlap(left, right) {
            return !!(left && right
                && Number(left.top) < Number(right.bottom)
                && Number(left.bottom) > Number(right.top));
        }

        function getRefitGap(contents) {
            const outline = Math.max(0, Number(contents && contents.outlineWidth) || 0);
            return Math.max(2, Math.ceil(outline + 2));
        }

        function normalizeDrawableNumber(value) {
            if (value === null || value === undefined || value === '') return null;
            const number = Number(value);
            return Number.isFinite(number) ? number : null;
        }

        return {
            refitCompletedDrawTextExBeforeNeighbor,
        };
    }

    function requireFunction(value, name) {
        if (typeof value !== 'function') {
            throw new Error(`[WindowText] drawTextEx refit support requires ${name}.`);
        }
        return value;
    }
            return { create: createDrawTextExRefitController };
        },
    });
})();
