// Window text adapter support: redraw diagnostics and source-ink evidence.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'adapters.windowText.redrawDiagnostics',
        factory() {

    function createRedrawDiagnosticsController(context = {}) {
        const {
            measuredBounds,
            cloneDiagnosticArea,
            cloneDiagnosticRect,
            roundDiagnosticNumber,
        } = context;

        function buildRedrawDiagnosticSummary(input = {}) {
            const snapshot = input.snapshotDiagnostics || {};
            const restore = input.restoreDiagnostics || {};
            const restoreSnapshot = restore.snapshot || {};
            const nativeBackdrop = restoreSnapshot.nativeBackdrop || {};
            const sourceInk = input.sourceInkDiagnostics || {};
            const sourceInkSourceCap = input.sourceInkSourceCap || {};
            const sourceInkSourceExpansion = input.sourceInkSourceExpansion || {};
            const replayBeforeItems = input.replayBeforeItems || {};
            const replayAfterItems = input.replayAfterItems || {};
            return {
                clearMode: String(input.clearMode || 'none'),
                clearArea: formatDiagnosticAreaForSummary(input.clearArea),
                snapshotAvailable: snapshot.available === true,
                snapshotBitmapMatches: snapshot.bitmapMatches === true,
                snapshotRestoreAttempted: snapshot.restoreAttempted === true,
                snapshotRestoreSucceeded: snapshot.restoreSucceeded === true,
                snapshotStaleRevisionFallback: snapshot.staleRevisionFallback === true,
                snapshotStaleAreaFallback: snapshot.staleAreaFallback === true,
                snapshotPartialClear: snapshot.partialClear === true,
                snapshotPartialClearRects: Number(snapshot.partialClearRects) || 0,
                snapshotRestoreSkippedReason: String(snapshot.restoreSkippedReason || ''),
                snapshotArea: formatDiagnosticAreaForSummary(snapshot.area),
                snapshotRevision: formatSnapshotRevisionForSummary(snapshot),
                restoreKind: String(restore.kind || ''),
                restoreSource: String(restore.source || ''),
                restoreFreshness: String(restore.freshness || ''),
                restoreSnapshotUsable: restoreSnapshot.usable === true,
                restoreNativeBackdropTrusted: nativeBackdrop.trusted === true,
                restoreNativeBackdropCoversTarget: nativeBackdrop.coversTarget === true,
                replayCounts: formatReplayCountsForSummary(input, replayBeforeItems, replayAfterItems),
                replayBeforeMethods: formatReplayMethodsForSummary(replayBeforeItems),
                replayAfterMethods: formatReplayMethodsForSummary(replayAfterItems),
                replayRect: formatDiagnosticRectForSummary(input.replayRect),
                replayDirtyRect: formatDiagnosticRectForSummary(input.replayDirtyRect),
                replayClipRect: formatDiagnosticRectForSummary(input.replayClipRect),
                drawSampleArea: formatDiagnosticRectForSummary(input.drawSampleArea),
                supportsReplayClip: input.supportsReplayClip === true,
                bitmapSurfaceYOffsetSource: String(input.bitmapSurfaceYOffsetSource || ''),
                sourceInkBounds: formatDiagnosticRectForSummary(sourceInk.worldBounds),
                sourceInkBottomEdge: sourceInk.touches && sourceInk.touches.bottom === true,
                sourceInkSourceCapApplied: sourceInkSourceCap.applied === true,
                sourceInkSourceCapRight: formatNullableNumberForSummary(sourceInkSourceCap.capRight),
                sourceInkSourceExpandApplied: sourceInkSourceExpansion.applied === true,
                sourceInkSourceExpandBottom: formatSourceInkExpansionBottomForSummary(sourceInkSourceExpansion),
                sourceInkSourceExpandBounds: formatDiagnosticRectForSummary(sourceInkSourceExpansion.expandedBounds),
            };
        }

        function getEntryPixelSnapshotDiagnostics(entry, contents, propertyName) {
            const snapshot = entry && propertyName ? entry[propertyName] : null;
            if (!snapshot) {
                return {
                    available: false,
                    bitmapMatches: false,
                    area: null,
                    boundsAtCapture: null,
                    contentsRevisionAtCapture: null,
                    ageMs: null,
                };
            }
            return {
                available: true,
                bitmapMatches: !!(contents && snapshot.contentsBitmap === contents),
                area: cloneArea(snapshot),
                boundsAtCapture: snapshot.bounds || null,
                contentsRevisionAtCapture: snapshot.contentsRevision,
                ageMs: Number.isFinite(Number(snapshot.capturedAt)) ? Math.max(0, Date.now() - Number(snapshot.capturedAt)) : null,
            };
        }

        function getSourceInkDiagnostics(entry) {
            if (!measuredBounds || typeof measuredBounds.measureSnapshotInkDiagnostics !== 'function') {
                return {
                    available: false,
                    changed: false,
                    reason: 'measured-bounds-unavailable',
                };
            }
            return measuredBounds.measureSnapshotInkDiagnostics(
                entry && entry.backgroundSnapshot,
                entry && entry.sourceSnapshot,
                { maxPixels: 32768 }
            );
        }

        function updateSourceInkObservation(entry, diagnostics) {
            if (!entry || !diagnostics || diagnostics.available !== true) return false;
            if (diagnostics.changed === true) {
                entry.sourceInkObserved = true;
                return true;
            }
            return false;
        }

        function shouldSuppressRedrawForSourceInk(entry, diagnostics) {
            if (!entry || !diagnostics || diagnostics.available !== true) return false;
            if (diagnostics.changed !== false) return false;
            // A completed entry may be redrawn after its original source was
            // already proven visible. Only suppress entries that never showed
            // native ink; those are native no-op draws, not text to translate.
            return entry.sourceInkObserved !== true;
        }

        function formatReplayCountsForSummary(input, replayBeforeItems, replayAfterItems) {
            const beforeCount = finiteDiagnosticCount(replayBeforeItems && replayBeforeItems.count);
            const afterCount = finiteDiagnosticCount(replayAfterItems && replayAfterItems.count);
            const beforeFiltered = finiteDiagnosticCount(input && input.replayBeforeFiltered);
            const afterFiltered = finiteDiagnosticCount(input && input.replayAfterFiltered);
            return [
                `before=${beforeCount}`,
                `after=${afterCount}`,
                `beforeFiltered=${beforeFiltered}`,
                `afterFiltered=${afterFiltered}`,
            ].join(';');
        }

        function formatReplayMethodsForSummary(summary) {
            const methods = summary && summary.methods && typeof summary.methods === 'object'
                ? summary.methods
                : {};
            return Object.keys(methods)
                .sort()
                .map((name) => `${name}:${finiteDiagnosticCount(methods[name])}`);
        }

        function formatSnapshotRevisionForSummary(snapshot) {
            return [
                `capture=${formatNullableDiagnosticValue(snapshot && snapshot.contentsRevisionAtCapture)}`,
                `redraw=${formatNullableDiagnosticValue(snapshot && snapshot.contentsRevisionAtRedraw)}`,
            ].join(';');
        }

        function formatDiagnosticAreaForSummary(area) {
            if (!area) return '';
            const clone = cloneArea(area);
            if (!clone) return '';
            return `x=${clone.x},y=${clone.y},w=${clone.w},h=${clone.h}`;
        }

        function formatDiagnosticRectForSummary(rect) {
            if (!rect) return '';
            const clone = cloneRect(rect);
            if (!clone) return '';
            return `x1=${clone.x1},y1=${clone.y1},x2=${clone.x2},y2=${clone.y2}`;
        }

        function formatSourceInkExpansionBottomForSummary(expansion) {
            if (!expansion || typeof expansion !== 'object') return null;
            return firstRoundedFiniteNumber(
                expansion.expandedBitmapSurfaceBottom,
                expansion.expandedBaseBottom,
                expansion.expandedBounds && expansion.expandedBounds.y2
            );
        }

        function formatNullableNumberForSummary(value) {
            if (value === null || value === undefined || value === '') return null;
            const numeric = Number(value);
            return Number.isFinite(numeric) ? roundNumber(numeric) : null;
        }

        function firstRoundedFiniteNumber(...values) {
            for (const value of values) {
                if (value === null || value === undefined || value === '') continue;
                const numeric = Number(value);
                if (Number.isFinite(numeric)) return roundNumber(numeric);
            }
            return null;
        }

        function cloneArea(area) {
            return typeof cloneDiagnosticArea === 'function' ? cloneDiagnosticArea(area) : null;
        }

        function cloneRect(rect) {
            return typeof cloneDiagnosticRect === 'function' ? cloneDiagnosticRect(rect) : null;
        }

        function roundNumber(value) {
            return typeof roundDiagnosticNumber === 'function' ? roundDiagnosticNumber(value) : value;
        }

        return {
            buildRedrawDiagnosticSummary,
            getEntryPixelSnapshotDiagnostics,
            getSourceInkDiagnostics,
            updateSourceInkObservation,
            shouldSuppressRedrawForSourceInk,
        };
    }

    function finiteDiagnosticCount(value) {
        const number = Number(value);
        return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : 0;
    }

    function formatNullableDiagnosticValue(value) {
        return value === null || value === undefined ? 'null' : String(value);
    }
            return { create: createRedrawDiagnosticsController };
        },
    });
})();
