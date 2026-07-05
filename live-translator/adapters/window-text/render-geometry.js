// Window text adapter support: render geometry and redraw bounds.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'adapters.windowText.renderGeometry',
        factory() {

    const WINDOW_TEXT_PERF_DOMAIN = 'translator-render.windowText';

    function createRenderGeometryController(context = {}) {
        const {
            measuredBounds,
            estimateEntryBounds,
            estimateMaxDrawTextExFallbackHeight,
            getLineHeight,
            calculateBitmapSurfaceTextYOffset,
            estimateBitmapSurfaceTextBounds,
            mergeBounds,
            isValidRect,
            withWindowContents,
            withCapturedDrawTextExState,
            withTranslatedWindowTextScale,
            isBitmapSurfaceTextEntry,
            getEntryDrawTextExBaseLineHeight,
            windowEntryBelongsToContents,
            getEntryStatus,
            cloneIntelRect,
            roundIntelNumber,
            perfStart,
            perfCount,
            perfTop,
            perfElapsed,
            getWindowTextPerfMethod,
        } = context;

        const createRedrawBounds = requireFunction(
            measuredBounds && measuredBounds.createRedrawBounds,
            'measuredBounds.createRedrawBounds'
        );
        const estimateEntryBoundsForRender = requireFunction(estimateEntryBounds, 'estimateEntryBounds');
        const estimateFallbackHeight = requireFunction(
            estimateMaxDrawTextExFallbackHeight,
            'estimateMaxDrawTextExFallbackHeight'
        );
        const getLineHeightForEntry = requireFunction(getLineHeight, 'getLineHeight');
        const getBitmapSurfaceYOffset = requireFunction(
            calculateBitmapSurfaceTextYOffset,
            'calculateBitmapSurfaceTextYOffset'
        );
        const estimateBitmapSurfaceBounds = requireFunction(
            estimateBitmapSurfaceTextBounds,
            'estimateBitmapSurfaceTextBounds'
        );
        const validRect = requireFunction(isValidRect, 'isValidRect');
        const mergeRect = requireFunction(mergeBounds, 'mergeBounds');
        const withContents = requireFunction(withWindowContents, 'withWindowContents');
        const withCapturedState = requireFunction(withCapturedDrawTextExState, 'withCapturedDrawTextExState');
        const withTranslatedScale = requireFunction(withTranslatedWindowTextScale, 'withTranslatedWindowTextScale');
        const isBitmapSurfaceEntry = requireFunction(isBitmapSurfaceTextEntry, 'isBitmapSurfaceTextEntry');
        const getDrawTextExBaseLineHeight = requireFunction(
            getEntryDrawTextExBaseLineHeight,
            'getEntryDrawTextExBaseLineHeight'
        );
        const measureDrawTextExHeight = requireFunction(
            context.measureDrawTextExHeightForEntry,
            'measureDrawTextExHeightForEntry'
        );
        const entryBelongsToContents = typeof windowEntryBelongsToContents === 'function'
            ? windowEntryBelongsToContents
            : null;
        const getEntryStatusForSummary = requireFunction(getEntryStatus, 'getEntryStatus');
        const cloneRect = requireFunction(cloneIntelRect, 'cloneIntelRect');
        const roundNumber = requireFunction(roundIntelNumber, 'roundIntelNumber');
        const startPerf = requireFunction(perfStart, 'perfStart');
        const countPerf = requireFunction(perfCount, 'perfCount');
        const topPerf = requireFunction(perfTop, 'perfTop');
        const elapsedPerf = requireFunction(perfElapsed, 'perfElapsed');
        const getPerfMethod = requireFunction(getWindowTextPerfMethod, 'getWindowTextPerfMethod');

        function calculateRedrawBounds(targetWindow, windowData, contents, entry, translatedText, sourceInkIntel = null) {
            const boundsStart = callPerfStart();
            callPerfCount('windowText.redraw.bounds.calls');
            callPerfTop('windowText.redraw.bounds.method', callGetWindowTextPerfMethod(entry));
            const position = entry && entry.position || {};
            const positionX = normalizeRenderCoordinate(position.x);
            const positionY = normalizeRenderCoordinate(position.y);
            const baseBounds = entry && entry.bounds || {
                x1: positionX === null ? NaN : positionX,
                y1: positionY === null ? NaN : positionY,
                x2: positionX === null ? NaN : positionX,
                y2: positionY === null ? NaN : positionY,
            };
            let bitmapSurfaceOriginalBounds = null;
            let bitmapSurfaceTranslatedBounds = null;
            try {
                bitmapSurfaceOriginalBounds = estimateBitmapSurfaceBounds(
                    contents,
                    entry,
                    entry && (entry.visibleText || entry.convertedText || entry.rawText) || ''
                );
            } catch (_) {}
            let translatedBounds = null;
            let calcTextHeight = null;
            let bitmapSurfaceYOffset = 0;
            try {
                const measureTranslatedBounds = () => callWithCapturedDrawTextExState(targetWindow, contents, entry, () => {
                    bitmapSurfaceYOffset = callCalculateBitmapSurfaceTextYOffset(contents, entry, translatedText);
                    translatedBounds = callWithWindowContents(targetWindow, contents, () => estimateEntryBoundsForRender(
                        targetWindow,
                        entry.type,
                        translatedText,
                        position.x,
                        position.y,
                        translatedText,
                        entry.originalParams
                    ));
                    const translatedEntry = bitmapSurfaceYOffset
                        ? Object.assign({}, entry, {
                            position: {
                                x: position.x,
                                y: (positionY === null ? 0 : positionY) + bitmapSurfaceYOffset,
                            },
                        })
                        : entry;
                    bitmapSurfaceTranslatedBounds = estimateBitmapSurfaceBounds(contents, translatedEntry, translatedText);
                    const measuredHeight = callMeasureDrawTextExHeight(
                        targetWindow,
                        contents,
                        entry,
                        translatedText || entry.convertedText || '',
                        position.x,
                        position.y,
                        0
                    );
                    if (Number.isFinite(measuredHeight) && measuredHeight > 0) {
                        calcTextHeight = measuredHeight;
                    }
                });
                if (callIsBitmapSurfaceTextEntry(entry)) {
                    callWithTranslatedWindowTextScale(targetWindow, measureTranslatedBounds);
                } else {
                    measureTranslatedBounds();
                }
            } catch (_) {}
            const textFit = resolveHorizontalTextFit(
                targetWindow,
                windowData,
                contents,
                entry,
                translatedText,
                translatedBounds
            );
            if (textFit && textFit.applied === true) {
                translatedBounds = applyHorizontalTextFitToBounds(translatedBounds, textFit);
                bitmapSurfaceTranslatedBounds = applyHorizontalTextFitToBounds(bitmapSurfaceTranslatedBounds, textFit);
            }
            const uncappedOriginalBounds = mergeRect(baseBounds, bitmapSurfaceOriginalBounds);
            const sourceInkCappedBaseBounds = capSourceBoundsForSourceInk(baseBounds, sourceInkIntel);
            const sourceInkCappedBitmapSurfaceOriginalBounds = capSourceBoundsForSourceInk(
                bitmapSurfaceOriginalBounds,
                sourceInkIntel
            );
            const expansionSourceInkIntel = shouldExpandSourceBoundsForSourceInk(entry)
                ? sourceInkIntel
                : null;
            const sourceInkExpandedBaseBounds = expandSourceBoundsForSourceInk(
                sourceInkCappedBaseBounds,
                expansionSourceInkIntel
            );
            const sourceInkExpandedBitmapSurfaceOriginalBounds = expandSourceBoundsForSourceInk(
                sourceInkCappedBitmapSurfaceOriginalBounds,
                expansionSourceInkIntel
            );
            const cappedBaseBounds = capSourceBoundsForHorizontalTextFit(sourceInkExpandedBaseBounds, textFit);
            const cappedBitmapSurfaceOriginalBounds = capSourceBoundsForHorizontalTextFit(
                sourceInkExpandedBitmapSurfaceOriginalBounds,
                textFit
            );
            const sourceInkCapApplied = !sameIntelRect(baseBounds, sourceInkCappedBaseBounds)
                || !sameIntelRect(bitmapSurfaceOriginalBounds, sourceInkCappedBitmapSurfaceOriginalBounds);
            const sourceInkExpansionApplied = !sameIntelRect(sourceInkCappedBaseBounds, sourceInkExpandedBaseBounds)
                || !sameIntelRect(sourceInkCappedBitmapSurfaceOriginalBounds, sourceInkExpandedBitmapSurfaceOriginalBounds);
            const horizontalCapApplied = !sameIntelRect(sourceInkExpandedBaseBounds, cappedBaseBounds)
                || !sameIntelRect(sourceInkExpandedBitmapSurfaceOriginalBounds, cappedBitmapSurfaceOriginalBounds);
            let minimumHeight = 0;
            if (entry && entry.type === 'drawTextEx') {
                minimumHeight = callEstimateMaxDrawTextExFallbackHeight(
                    callGetEntryDrawTextExBaseLineHeight(targetWindow, contents, entry),
                    translatedText,
                    entry.convertedText,
                    entry.rawText
                );
            }
            const outline = Math.max(
                0,
                contents && typeof contents.outlineWidth === 'number'
                    ? contents.outlineWidth
                    : 0
            );
            const result = callCreateRedrawBounds({
                position,
                baseBounds: cappedBaseBounds,
                translatedBounds,
                bitmapSurfaceOriginalBounds: cappedBitmapSurfaceOriginalBounds,
                bitmapSurfaceTranslatedBounds,
                bitmapSurfaceYOffset,
                calcTextHeight,
                minimumHeight,
                surface: contents,
                outline,
            });
            if (sourceInkCapApplied || sourceInkExpansionApplied || horizontalCapApplied) {
                result.uncappedOriginalBounds = cloneRect(uncappedOriginalBounds);
                result.uncappedBitmapSurfaceOriginalBounds = cloneRect(bitmapSurfaceOriginalBounds);
            }
            result.sourceInkSourceCap = summarizeSourceInkSourceCap({
                applied: sourceInkCapApplied,
                sourceInkIntel,
                originalBaseBounds: baseBounds,
                cappedBaseBounds: sourceInkCappedBaseBounds,
                originalBitmapSurfaceBounds: bitmapSurfaceOriginalBounds,
                cappedBitmapSurfaceBounds: sourceInkCappedBitmapSurfaceOriginalBounds,
            });
            result.sourceInkSourceExpansion = summarizeSourceInkSourceExpansion({
                applied: sourceInkExpansionApplied,
                sourceInkIntel: expansionSourceInkIntel || sourceInkIntel,
                originalBaseBounds: sourceInkCappedBaseBounds,
                expandedBaseBounds: sourceInkExpandedBaseBounds,
                originalBitmapSurfaceBounds: sourceInkCappedBitmapSurfaceOriginalBounds,
                expandedBitmapSurfaceBounds: sourceInkExpandedBitmapSurfaceOriginalBounds,
            });
            result.textFit = textFit;
            callPerfElapsed('windowText.redraw.bounds.ms', boundsStart);
            return result;
        }

        function resolveHorizontalTextFit(targetWindow, windowData, contents, entry, translatedText, measuredBoundsInput = null) {
            if (!entry || entry.type !== 'drawTextEx') return null;
            if (!contents) return createHorizontalTextFitMiss('missingContents');
            const position = entry.position || {};
            const originX = normalizeRenderCoordinate(position.x);
            if (originX === null) return createHorizontalTextFitMiss('missingOrigin');
            const naturalBounds = validRect(measuredBoundsInput)
                ? measuredBoundsInput
                : estimateEntryBoundsForRender(targetWindow, entry.type, translatedText, position.x, position.y, translatedText, entry.originalParams);
            if (!validRect(naturalBounds)) return createHorizontalTextFitMiss('missingNaturalBounds', { originX });
            const naturalWidth = Math.max(0, Number(naturalBounds.x2) - Number(naturalBounds.x1));
            if (!Number.isFinite(naturalWidth) || naturalWidth <= 0) {
                return createHorizontalTextFitMiss('emptyNaturalWidth', { originX, naturalWidth });
            }

            const neighbor = findNearestRightLineNeighbor(targetWindow, windowData, contents, entry);
            if (!neighbor) {
                return createHorizontalTextFitMiss('missingNeighbor', { originX, naturalWidth });
            }
            const outline = Math.max(0, Number(contents && contents.outlineWidth) || 0);
            const gap = Math.max(2, Math.ceil(outline + 2));
            const safeMaxWidth = Math.max(0, Number(neighbor.left) - originX - gap);
            const neighborSummary = summarizeHorizontalFitNeighbor(neighbor);
            if (!Number.isFinite(safeMaxWidth) || safeMaxWidth <= 0) {
                return createHorizontalTextFitMiss('noSafeWidth', {
                    originX,
                    naturalWidth,
                    safeMaxWidth,
                    gap,
                    neighbor: neighborSummary,
                });
            }
            const rawScaleX = safeMaxWidth / naturalWidth;
            const scaleX = clampHorizontalScaleX(rawScaleX);
            return {
                applied: scaleX < 0.999,
                reason: scaleX < 0.999 ? 'squeezed' : 'naturalFits',
                scaleX,
                rawScaleX,
                originX,
                safeMaxWidth,
                boundaryX: originX + safeMaxWidth,
                naturalWidth,
                gap,
                clamped: scaleX !== rawScaleX && rawScaleX < 0.999,
                neighbor: neighborSummary,
            };
        }

        function createHorizontalTextFitMiss(reason, details = {}) {
            return Object.assign({
                applied: false,
                reason: String(reason || 'notApplied'),
                scaleX: 1,
                rawScaleX: 1,
                clamped: false,
            }, details || {});
        }

        function summarizeHorizontalFitNeighbor(neighbor) {
            if (!neighbor) return null;
            return {
                slotKey: neighbor.entry && neighbor.entry.slotKey || '',
                type: neighbor.entry && neighbor.entry.type || '',
                left: neighbor.left,
                y: neighbor.y,
                status: callGetEntryStatus(neighbor.entry, ''),
            };
        }

        function findNearestRightLineNeighbor(targetWindow, windowData, contents, entry) {
            if (!windowData || !windowData.texts || typeof windowData.texts.forEach !== 'function') return null;
            const band = getEntryVerticalBand(targetWindow, contents, entry);
            if (!band) return null;
            const originX = normalizeRenderCoordinate(entry && entry.position && entry.position.x);
            if (originX === null) return null;
            let nearest = null;
            try {
                windowData.texts.forEach((candidate) => {
                    if (!candidate || candidate === entry) return;
                    if (candidate.stale || candidate.lifecycle && candidate.lifecycle.stale === true) return;
                    if (entryBelongsToContents && !entryBelongsToContents(candidate, contents)) return;
                    const candidateBand = getEntryVerticalBand(targetWindow, contents, candidate);
                    if (!candidateBand || !verticalBandsOverlap(band, candidateBand)) return;
                    const left = getEntryLeftEdge(candidate);
                    if (!Number.isFinite(left) || left <= originX + 1) return;
                    if (!nearest || left < nearest.left) {
                        nearest = {
                            entry: candidate,
                            left,
                            y: candidateBand.top,
                        };
                    }
                });
            } catch (_) {}
            return nearest;
        }

        function getEntryVerticalBand(targetWindow, contents, entry) {
            if (!entry) return null;
            const position = entry.position || {};
            const y = normalizeRenderCoordinate(position.y);
            if (y === null) return null;
            const bounds = validRect(entry.renderedBounds)
                ? entry.renderedBounds
                : (validRect(entry.bounds) ? entry.bounds : null);
            if (bounds) {
                return {
                    top: Number(bounds.y1),
                    bottom: Number(bounds.y2),
                };
            }
            const params = entry.originalParams || {};
            const lineHeight = Number(params.lineHeight);
            const fallbackHeight = Number.isFinite(lineHeight) && lineHeight > 0
                ? lineHeight
                : (entry.type === 'drawTextEx'
                    ? callGetEntryDrawTextExBaseLineHeight(targetWindow, contents, entry)
                    : callGetLineHeight(targetWindow, contents, params));
            const height = Math.max(1, Number(fallbackHeight) || 0);
            return {
                top: y,
                bottom: y + height,
            };
        }

        function verticalBandsOverlap(left, right) {
            return !!(left && right
                && Number(left.top) < Number(right.bottom)
                && Number(left.bottom) > Number(right.top));
        }

        function getEntryLeftEdge(entry) {
            if (!entry) return NaN;
            if (validRect(entry.renderedBounds)) return Number(entry.renderedBounds.x1);
            if (validRect(entry.bounds)) return Number(entry.bounds.x1);
            const x = normalizeRenderCoordinate(entry.position && entry.position.x);
            return x === null ? NaN : x;
        }

        function clampHorizontalScaleX(value) {
            const numeric = Number(value);
            if (!Number.isFinite(numeric) || numeric <= 0) return 1;
            if (numeric >= 1) return 1;
            return Math.max(0.25, Math.min(1, numeric));
        }

        function applyHorizontalTextFitToBounds(bounds, textFit) {
            if (!validRect(bounds) || !textFit || textFit.applied !== true) return bounds;
            const originX = Number(textFit.originX);
            const scaleX = Number(textFit.scaleX);
            if (!Number.isFinite(originX) || !Number.isFinite(scaleX) || scaleX <= 0 || scaleX >= 0.999) return bounds;
            return {
                x1: originX + ((Number(bounds.x1) - originX) * scaleX),
                y1: Number(bounds.y1),
                x2: originX + ((Number(bounds.x2) - originX) * scaleX),
                y2: Number(bounds.y2),
            };
        }

        function capSourceBoundsForSourceInk(bounds, sourceInkIntel) {
            if (!validRect(bounds)) return bounds;
            const capRight = getSourceInkRightCap(sourceInkIntel);
            const left = Number(bounds.x1);
            const right = Number(bounds.x2);
            if (!Number.isFinite(capRight) || !Number.isFinite(left) || !Number.isFinite(right)) return bounds;
            if (capRight <= left || right <= capRight) return bounds;
            return Object.assign({}, bounds, {
                x2: capRight,
            });
        }

        function expandSourceBoundsForSourceInk(bounds, sourceInkIntel) {
            if (!validRect(bounds)) return bounds;
            const inkBounds = getChangedSourceInkWorldBounds(sourceInkIntel);
            if (!inkBounds) return bounds;
            const expanded = mergeRect(bounds, inkBounds);
            return validRect(expanded) ? expanded : bounds;
        }

        function shouldExpandSourceBoundsForSourceInk(entry) {
            if (!entry || !callIsBitmapSurfaceTextEntry(entry)) return true;
            return getEntryScreenState(entry) !== 'transparent';
        }

        function getEntryScreenState(entry) {
            const lifecycleState = entry && entry.lifecycle && typeof entry.lifecycle === 'object'
                ? entry.lifecycle.screenState
                : '';
            return String(lifecycleState || entry && entry.screenState || '');
        }

        function getSourceInkRightCap(sourceInkIntel) {
            const ink = sourceInkIntel && typeof sourceInkIntel === 'object'
                ? sourceInkIntel
                : null;
            if (!ink || ink.available !== true || ink.changed !== true) return NaN;
            // Right-edge ink means the snapshot window clipped the source;
            // capping from it would turn a measurement uncertainty into data loss.
            if (ink.touches && ink.touches.right === true) return NaN;
            const inkBounds = getChangedSourceInkWorldBounds(sourceInkIntel);
            const right = Number(inkBounds && inkBounds.x2);
            return Number.isFinite(right) ? right : NaN;
        }

        function getChangedSourceInkWorldBounds(sourceInkIntel) {
            const ink = sourceInkIntel && typeof sourceInkIntel === 'object'
                ? sourceInkIntel
                : null;
            if (!ink || ink.available !== true || ink.changed !== true) return null;
            if (!ink.worldBounds || !validRect(ink.worldBounds)) return null;
            const pixelCount = Number(ink.pixelCount);
            if (!Number.isFinite(pixelCount) || pixelCount <= 0) return null;
            return ink.worldBounds;
        }

        function capSourceBoundsForHorizontalTextFit(bounds, textFit) {
            if (!validRect(bounds) || !textFit) return bounds;
            const capRight = getHorizontalTextFitBoundaryX(textFit);
            const left = Number(bounds.x1);
            const right = Number(bounds.x2);
            if (!Number.isFinite(capRight) || !Number.isFinite(left) || !Number.isFinite(right)) return bounds;
            if (right <= capRight || left >= capRight) return bounds;
            return Object.assign({}, bounds, {
                x2: Math.max(left, capRight),
            });
        }

        function getHorizontalTextFitBoundaryX(textFit) {
            if (!textFit) return NaN;
            const direct = Number(textFit.boundaryX);
            if (Number.isFinite(direct)) return direct;
            const originX = Number(textFit.originX);
            const safeMaxWidth = Number(textFit.safeMaxWidth);
            return Number.isFinite(originX) && Number.isFinite(safeMaxWidth)
                ? originX + safeMaxWidth
                : NaN;
        }

        function summarizeSourceInkSourceCap(input = {}) {
            const sourceInkIntel = input.sourceInkIntel || {};
            const capRight = getSourceInkRightCap(sourceInkIntel);
            const originalBaseBounds = cloneRect(input.originalBaseBounds);
            const cappedBaseBounds = cloneRect(input.cappedBaseBounds);
            const originalBitmapSurfaceBounds = cloneRect(input.originalBitmapSurfaceBounds);
            const cappedBitmapSurfaceBounds = cloneRect(input.cappedBitmapSurfaceBounds);
            return {
                applied: input.applied === true,
                available: sourceInkIntel.available === true,
                changed: sourceInkIntel.changed === true,
                reason: sourceInkIntel.reason ? String(sourceInkIntel.reason) : '',
                touchesRight: sourceInkIntel.touches && sourceInkIntel.touches.right === true,
                capRight: roundNumber(capRight),
                originalBaseRight: originalBaseBounds ? roundNumber(originalBaseBounds.x2) : null,
                cappedBaseRight: cappedBaseBounds ? roundNumber(cappedBaseBounds.x2) : null,
                originalBitmapSurfaceRight: originalBitmapSurfaceBounds
                    ? roundNumber(originalBitmapSurfaceBounds.x2)
                    : null,
                cappedBitmapSurfaceRight: cappedBitmapSurfaceBounds
                    ? roundNumber(cappedBitmapSurfaceBounds.x2)
                    : null,
            };
        }

        function summarizeSourceInkSourceExpansion(input = {}) {
            const sourceInkIntel = input.sourceInkIntel || {};
            const originalBaseBounds = cloneRect(input.originalBaseBounds);
            const expandedBaseBounds = cloneRect(input.expandedBaseBounds);
            const originalBitmapSurfaceBounds = cloneRect(input.originalBitmapSurfaceBounds);
            const expandedBitmapSurfaceBounds = cloneRect(input.expandedBitmapSurfaceBounds);
            const expandedBounds = cloneRect(mergeRect(expandedBaseBounds, expandedBitmapSurfaceBounds));
            const pixelCount = Number(sourceInkIntel.pixelCount);
            return {
                applied: input.applied === true,
                available: sourceInkIntel.available === true,
                changed: sourceInkIntel.changed === true,
                reason: sourceInkIntel.reason ? String(sourceInkIntel.reason) : '',
                touchesLeft: sourceInkIntel.touches && sourceInkIntel.touches.left === true,
                touchesTop: sourceInkIntel.touches && sourceInkIntel.touches.top === true,
                touchesRight: sourceInkIntel.touches && sourceInkIntel.touches.right === true,
                touchesBottom: sourceInkIntel.touches && sourceInkIntel.touches.bottom === true,
                pixelCount: Number.isFinite(pixelCount) ? Math.max(0, Math.floor(pixelCount)) : null,
                inkBounds: cloneRect(sourceInkIntel.worldBounds),
                expandedBounds,
                originalBaseBottom: originalBaseBounds ? roundNumber(originalBaseBounds.y2) : null,
                expandedBaseBottom: expandedBaseBounds ? roundNumber(expandedBaseBounds.y2) : null,
                originalBitmapSurfaceBottom: originalBitmapSurfaceBounds
                    ? roundNumber(originalBitmapSurfaceBounds.y2)
                    : null,
                expandedBitmapSurfaceBottom: expandedBitmapSurfaceBounds
                    ? roundNumber(expandedBitmapSurfaceBounds.y2)
                    : null,
            };
        }

        function sameIntelRect(left, right) {
            if (!left && !right) return true;
            if (!validRect(left) || !validRect(right)) return false;
            return Number(left.x1) === Number(right.x1)
                && Number(left.y1) === Number(right.y1)
                && Number(left.x2) === Number(right.x2)
                && Number(left.y2) === Number(right.y2);
        }

        function summarizeHorizontalTextFit(textFit) {
            if (!textFit) return null;
            return {
                applied: textFit.applied === true,
                reason: textFit.reason || '',
                scaleX: roundNumber(textFit.scaleX),
                rawScaleX: roundNumber(textFit.rawScaleX),
                originX: roundNumber(textFit.originX),
                safeMaxWidth: roundNumber(textFit.safeMaxWidth),
                boundaryX: roundNumber(getHorizontalTextFitBoundaryX(textFit)),
                naturalWidth: roundNumber(textFit.naturalWidth),
                gap: roundNumber(textFit.gap),
                clamped: textFit.clamped === true,
                neighbor: textFit.neighbor ? {
                    slotKey: textFit.neighbor.slotKey || '',
                    type: textFit.neighbor.type || '',
                    left: roundNumber(textFit.neighbor.left),
                    y: roundNumber(textFit.neighbor.y),
                    status: textFit.neighbor.status || '',
                } : null,
            };
        }

        function describeEntryRenderGeometry(entry) {
            const position = entry && entry.position ? entry.position : {};
            const params = entry && entry.originalParams ? entry.originalParams : {};
            const invalid = [];
            const x = normalizeRenderCoordinate(position.x);
            const y = normalizeRenderCoordinate(position.y);
            if (x === null) invalid.push('x');
            if (y === null) invalid.push('y');
            if (entry && entry.type !== 'drawTextEx') {
                const maxWidth = normalizeRenderCoordinate(params.maxWidth);
                if (maxWidth === null || maxWidth <= 0) invalid.push('maxWidth');
            }
            if (!invalid.length) {
                return {
                    drawable: true,
                    details: {
                        x,
                        y,
                    },
                };
            }
            return {
                drawable: false,
                details: {
                    invalid,
                    x: describeRenderCoordinate(position.x),
                    y: describeRenderCoordinate(position.y),
                    maxWidth: describeRenderCoordinate(params.maxWidth),
                },
            };
        }

        function rememberRenderedEntryBounds(entry, translatedBounds, bitmapSurfaceTranslatedBounds) {
            if (!entry) return;
            // `entry.bounds` tracks the source slot. Bitmap-surface redraws can
            // move translated ink vertically to match the captured native ink,
            // so replay needs the actual translated footprint as well.
            const renderedBounds = mergeRect(translatedBounds, bitmapSurfaceTranslatedBounds)
                || translatedBounds
                || bitmapSurfaceTranslatedBounds
                || entry.bounds;
            entry.renderedBounds = cloneRenderedBounds(renderedBounds);
        }

        function cloneRenderedBounds(bounds) {
            if (!validRect(bounds)) return null;
            return {
                x1: Number(bounds.x1),
                y1: Number(bounds.y1),
                x2: Number(bounds.x2),
                y2: Number(bounds.y2),
            };
        }

        function callCreateRedrawBounds(input) {
            return createRedrawBounds(input);
        }

        function callMeasureDrawTextExHeight(targetWindow, contents, entry, text, x, y, fallbackHeight) {
            return measureDrawTextExHeight(targetWindow, contents, entry, text, x, y, fallbackHeight);
        }

        function callEstimateMaxDrawTextExFallbackHeight(baseLineHeight, translatedText, convertedText, rawText) {
            return estimateFallbackHeight(baseLineHeight, translatedText, convertedText, rawText);
        }

        function callGetEntryDrawTextExBaseLineHeight(targetWindow, contents, entry) {
            return getDrawTextExBaseLineHeight(targetWindow, contents, entry);
        }

        function callGetLineHeight(targetWindow, contents, params) {
            return getLineHeightForEntry(targetWindow, contents, params);
        }

        function callGetEntryStatus(entry, fallback) {
            return getEntryStatusForSummary(entry, fallback);
        }

        function callCalculateBitmapSurfaceTextYOffset(contents, entry, translatedText) {
            return getBitmapSurfaceYOffset(contents, entry, translatedText);
        }

        function callWithWindowContents(targetWindow, contents, callback) {
            return withContents(targetWindow, contents, callback);
        }

        function callWithCapturedDrawTextExState(targetWindow, contents, entry, callback) {
            return withCapturedState(targetWindow, contents, entry, callback);
        }

        function callWithTranslatedWindowTextScale(targetWindow, callback) {
            return withTranslatedScale(targetWindow, callback);
        }

        function callIsBitmapSurfaceTextEntry(entry) {
            return isBitmapSurfaceEntry(entry);
        }

        function callPerfStart() {
            return startPerf();
        }

        function callPerfCount(name, amount = 1, domain = WINDOW_TEXT_PERF_DOMAIN) {
            countPerf(name, amount, domain);
        }

        function callPerfElapsed(name, start, domain = WINDOW_TEXT_PERF_DOMAIN) {
            elapsedPerf(name, start, domain);
        }

        function callPerfTop(group, label, amount = 1, domain = WINDOW_TEXT_PERF_DOMAIN) {
            topPerf(group, label, amount, domain);
        }

        function callGetWindowTextPerfMethod(entry) {
            return getPerfMethod(entry);
        }

        return {
            calculateRedrawBounds,
            resolveHorizontalTextFit,
            summarizeHorizontalTextFit,
            describeEntryRenderGeometry,
            normalizeRenderCoordinate,
            rememberRenderedEntryBounds,
        };
    }

    function normalizeRenderCoordinate(value) {
        if (value === null || value === undefined) return null;
        if (typeof value === 'number') return Number.isFinite(value) ? value : null;
        if (typeof value === 'string') {
            if (!value.trim()) return null;
            const numeric = Number(value);
            return Number.isFinite(numeric) ? numeric : null;
        }
        return null;
    }

    function describeRenderCoordinate(value) {
        const numeric = normalizeRenderCoordinate(value);
        return numeric === null ? null : numeric;
    }

    function requireFunction(callback, name) {
        if (typeof callback !== 'function') {
            throw new Error(`[WindowText] render geometry requires ${name}.`);
        }
        return callback;
    }
            return { create: createRenderGeometryController };
        },
    });
})();
