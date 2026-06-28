// Window text adapter support: bitmap-surface draw normalization and guards.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'adapters.windowText.surfaceDrawSupport',
        requires: {
            sourceObservationContract: 'runtime.bitmap.sourceObservation',
        },
        factory({ sourceObservationContract }) {

    function createSurfaceDrawSupportController(context = {}) {
        const { ADAPTER_ID, renderTransaction } = context;
        const services = context.services || {};
        const facades = context.facades || {};
        const { surface: surfaceService = {}, replay: replayService = {} } = services;
        const { bitmapReplay = {}, textMetrics = {} } = facades;
        const { captureWindowEntryBackgroundPatch } = bitmapReplay;
        const { normalizeDrawTextAlignValue } = textMetrics;
        requireFunction(renderTransaction && renderTransaction.createSourceDrawBoundary, 'renderTransaction.createSourceDrawBoundary');
        requireFunction(captureWindowEntryBackgroundPatch, 'bitmapReplay.captureWindowEntryBackgroundPatch');
        requireFunction(normalizeDrawTextAlignValue, 'textMetrics.normalizeDrawTextAlignValue');

        function normalizeSurfaceDrawText(payload = {}, event = {}) {
            const source = payload && typeof payload === 'object' ? payload : {};
            const bitmap = source.bitmap || source.target || null;
            const text = String((source.text !== undefined ? source.text : source.rawText) ?? '');
            const drawBoundary = source.drawBoundary && typeof source.drawBoundary === 'object'
                ? renderTransaction.createSourceDrawBoundary(source.drawBoundary)
                : null;
            return {
                bitmap,
                methodName: String(source.methodName || 'bitmap.drawText'),
                text,
                x: source.x,
                y: source.y,
                maxWidth: source.maxWidth,
                lineHeight: positiveNumber(source.lineHeight, bitmap && bitmap.fontSize, 24),
                align: normalizeDrawTextAlignValue(source.align),
                drawState: source.drawState && typeof source.drawState === 'object'
                    ? Object.assign({}, source.drawState)
                    : null,
                drawBoundary,
                measuredWidth: finiteNumber(source.measuredWidth, 0),
                surfaceId: String(source.sourceSurfaceId || source.surfaceId || drawBoundary && drawBoundary.surfaceId || ''),
                slotKey: String(source.sourceSlotKey || source.slotKey || drawBoundary && drawBoundary.slotKey || ''),
                runId: String(source.runId || source.sourceRunId || ''),
                unitIds: normalizeSurfaceUnitIds(source.unitIds || source.units),
                surfaceRevision: firstFiniteNumber(source.surfaceRevision, source.revision, 0),
                drawRun: normalizeSurfaceDrawRun(source.drawRun),
                backgroundPatch: normalizeSurfaceBackgroundPatch(source.backgroundPatch),
                restoreMaterials: normalizeSurfaceRestoreMaterials(source.restoreMaterials),
                ownerType: String(source.ownerType || ''),
                generation: normalizeSurfaceDrawGeneration(source, event),
                sourceAdapter: String((event && event.sourceAdapter) || source.sourceAdapter || ''),
                ownershipStatus: String((event && event.status) || source.ownershipStatus || ''),
                ownershipReason: String((event && event.reason) || ''),
            };
        }

        function normalizeSurfaceRestoreMaterials(materials) {
            const source = Array.isArray(materials) ? materials : [];
            return source
                .map(normalizeSurfaceRestoreMaterial)
                .filter(Boolean);
        }

        function normalizeSurfaceRestoreMaterial(material) {
            if (!material || typeof material !== 'object') return null;
            const patch = normalizeSurfaceBackgroundPatch(material.patch || material.backgroundPatch || material);
            if (!patch) return null;
            return {
                kind: String(material.kind || 'backdropPatch'),
                coverageTarget: String(material.coverageTarget || 'glyph'),
                trustedClean: material.trustedClean === true || patch.trusted === true,
                patch,
                x: patch.x,
                y: patch.y,
                width: patch.width,
                height: patch.height,
            };
        }

        function normalizeSurfaceDrawGeneration(source, event) {
            const sourceBoundary = source && source.drawBoundary && typeof source.drawBoundary === 'object'
                ? source.drawBoundary
                : null;
            const eventBoundary = event && event.drawBoundary && typeof event.drawBoundary === 'object'
                ? event.drawBoundary
                : null;
            return firstFiniteNumber(
                source && source.generation,
                source && source.revision,
                sourceBoundary && sourceBoundary.generation,
                sourceBoundary && sourceBoundary.entryGeneration,
                event && event.generation,
                event && event.revision,
                eventBoundary && eventBoundary.generation,
                eventBoundary && eventBoundary.entryGeneration,
                0
            );
        }

        function normalizeSurfaceBackgroundPatch(patch) {
            if (!patch || typeof patch !== 'object') return null;
            const bitmap = patch.bitmap || null;
            const width = Math.max(0, Math.floor(Number(patch.width) || Number(bitmap && bitmap.width) || 0));
            const height = Math.max(0, Math.floor(Number(patch.height) || Number(bitmap && bitmap.height) || 0));
            if (!bitmap || width <= 0 || height <= 0) return null;
            return {
                bitmap,
                x: finiteNumber(patch.x, 0),
                y: finiteNumber(patch.y, 0),
                width,
                height,
                trusted: patch.trusted === true,
            };
        }

        function applySurfaceDrawBackgroundPatch(draw, entry) {
            if (!draw || !entry) return false;
            const patch = selectSurfaceDrawSourceProofPatch(draw);
            if (!patch) return false;
            const contents = entry.contentsBitmap || (entry.ownerWindow && entry.ownerWindow.contents) || null;
            try {
                return captureWindowEntryBackgroundPatch(contents, entry, patch) === true;
            } catch (_) {
                return false;
            }
        }

        function selectSurfaceDrawSourceProofPatch(draw) {
            if (!draw || typeof draw !== 'object') return null;
            const materials = Array.isArray(draw.restoreMaterials) ? draw.restoreMaterials : null;
            if (materials) {
                const material = selectSurfaceDrawRestoreMaterial(materials);
                if (material) return createSurfaceDrawCapturePatch(material);
            }
            // The source-ink proof only needs a clean pre-native sample. It can
            // use glyph-local capture material that would be unsafe as a full
            // redraw backdrop; restore safety is decided later by the restore
            // planner's target coverage checks.
            return draw.backgroundPatch || selectSurfaceDrawSourceProofMaterial(materials);
        }

        function selectSurfaceDrawRestoreMaterial(materials) {
            const source = Array.isArray(materials) ? materials : [];
            return source.find(isRunWideBackdropMaterial)
                || source.find(isEntryLocalInkMaterial)
                || source.find(isEntryBackdropMaterial)
                || null;
        }

        function selectSurfaceDrawSourceProofMaterial(materials) {
            const source = Array.isArray(materials) ? materials : [];
            const material = source.find(isSourceProofBackdropMaterial)
                || source.find(isSourceProofInkMaterial)
                || null;
            return material ? createSurfaceDrawCapturePatch(material) : null;
        }

        function createSurfaceDrawCapturePatch(material) {
            if (!material || !material.patch) return null;
            if (material.trustedClean !== true || material.patch.trusted === true) return material.patch;
            return Object.assign({}, material.patch, { trusted: true });
        }

        function isRunWideBackdropMaterial(material) {
            if (!material || !material.patch) return false;
            const kind = String(material.kind || '');
            if (kind !== 'backdropPatch' && kind !== 'backdropCoverage') return false;
            const coverageTarget = String(material.coverageTarget || '');
            return coverageTarget === 'run'
                || coverageTarget === 'redraw'
                || coverageTarget === 'slot';
        }

        function isEntryLocalInkMaterial(material) {
            if (!material || !material.patch) return false;
            return String(material.kind || '') === 'inkPatch'
                && String(material.coverageTarget || '') === 'entry';
        }

        function isEntryBackdropMaterial(material) {
            if (!material || !material.patch) return false;
            const kind = String(material.kind || '');
            return (kind === 'backdropPatch' || kind === 'backdropCoverage')
                && String(material.coverageTarget || '') === 'entry';
        }

        function isSourceProofBackdropMaterial(material) {
            if (!material || !material.patch) return false;
            const kind = String(material.kind || '');
            return kind === 'backdropPatch' || kind === 'backdropCoverage';
        }

        function isSourceProofInkMaterial(material) {
            if (!material || !material.patch) return false;
            return String(material.kind || '') === 'inkPatch';
        }

        function resolveSurfaceDrawWindow(bitmap) {
            if (!bitmap || typeof surfaceService.resolveWindowSurfaceForContents !== 'function') return null;
            const match = surfaceService.resolveWindowSurfaceForContents(bitmap);
            if (match && (match.windowInstance || match.owner)) return match.windowInstance || match.owner;
            return null;
        }

        function describeSurfaceDrawSourceObservation(bitmap) {
            if (!bitmap) return sourceObservationContract.createSourceObservation('observed', '');
            const bitmapDraws = getBitmapDrawGuardService();
            const policy = bitmapDraws.getSourceObservationPolicy(bitmap);
            if (policy && policy.suppressSourceObservation) {
                return sourceObservationContract.createSourceObservation(
                    'suppressed',
                    policy.diagnosticReason || policy.reason || 'source-observation-suppressed'
                );
            }
            return sourceObservationContract.createSourceObservation('observed', '');
        }

        function getWindowDrawTextExReplayDepth(bitmap) {
            if (!bitmap) return 0;
            const bitmapDraws = getBitmapDrawGuardService();
            if (typeof bitmapDraws.getRenderGuardState !== 'function') {
                throw new Error('[WindowText] bitmap draw guard state service is required.');
            }
            const state = bitmapDraws.getRenderGuardState(bitmap);
            return Number(state && state.windowDrawTextExReplayDepth) || 0;
        }

        function isCommittedSurfaceDrawEvent(event) {
            if (!event || typeof event !== 'object') return false;
            if (event.sourceCommitted === true || event.postDraw === true) return true;
            const phase = String(event.phase || event.sourcePhase || '');
            return phase === 'source-draw-committed';
        }

        function getBitmapDrawGuardService() {
            const bitmapDraws = replayService && replayService.bitmapDraws;
            if (!bitmapDraws || typeof bitmapDraws.getSourceObservationPolicy !== 'function') {
                throw new Error('[WindowText] bitmap draw guard service is required.');
            }
            return bitmapDraws;
        }

        function normalizeOriginalParams(params) {
            const source = params && typeof params === 'object' ? params : {};
            const next = Object.assign({}, source);
            delete next.drawOrigin;
            return next;
        }

        function normalizeDrawOrigin(origin, methodName) {
            if (!origin || typeof origin !== 'object') {
                return { type: 'window', adapter: ADAPTER_ID, methodName: methodName || 'drawText' };
            }
            const drawBoundary = origin.drawBoundary && typeof origin.drawBoundary === 'object'
                ? renderTransaction.createSourceDrawBoundary(origin.drawBoundary)
                : null;
            return {
                type: String(origin.type || 'window'),
                adapter: String(origin.adapter || ADAPTER_ID),
                methodName: String(origin.methodName || methodName || 'drawText'),
                target: String(origin.target || ''),
                ownerType: String(origin.ownerType || ''),
                measuredWidth: finiteNumber(origin.measuredWidth, 0),
                surfaceId: String(origin.sourceSurfaceId || origin.surfaceId || drawBoundary && drawBoundary.surfaceId || ''),
                slotKey: String(origin.sourceSlotKey || origin.slotKey || drawBoundary && drawBoundary.slotKey || ''),
                runId: String(origin.runId || origin.sourceRunId || ''),
                unitIds: normalizeSurfaceUnitIds(origin.unitIds || origin.units),
                surfaceRevision: firstFiniteNumber(origin.surfaceRevision, origin.revision, 0),
                drawRun: normalizeSurfaceDrawRun(origin.drawRun),
                drawState: origin.drawState && typeof origin.drawState === 'object'
                    ? Object.assign({}, origin.drawState)
                    : null,
                drawBoundary,
            };
        }

        function normalizeSurfaceUnitIds(value) {
            const source = Array.isArray(value) ? value : [];
            const ids = [];
            source.forEach((item) => {
                const text = String(item && typeof item === 'object'
                    ? (item.unitId || item.ledgerUnitId || item.id || '')
                    : (item || ''));
                if (text && ids.indexOf(text) < 0) ids.push(text);
            });
            return ids;
        }

        function normalizeSurfaceDrawRun(drawRun) {
            if (!drawRun || typeof drawRun !== 'object') return null;
            return {
                type: String(drawRun.type || ''),
                reason: String(drawRun.reason || ''),
                confidence: String(drawRun.confidence || ''),
                runKey: String(drawRun.runKey || ''),
                unitCount: Math.max(0, Math.floor(finiteNumber(drawRun.unitCount, 0))),
            };
        }

        function finiteNumber(value, fallback) {
            const numeric = Number(value);
            return Number.isFinite(numeric) ? numeric : fallback;
        }

        function firstFiniteNumber(...values) {
            for (const value of values) {
                const numeric = Number(value);
                if (Number.isFinite(numeric)) return numeric;
            }
            return 0;
        }

        function positiveNumber(...values) {
            for (const value of values) {
                const numeric = Number(value);
                if (Number.isFinite(numeric) && numeric > 0) return numeric;
            }
            return 1;
        }

        return {
            normalizeSurfaceDrawText,
            applySurfaceDrawBackgroundPatch,
            resolveSurfaceDrawWindow,
            describeSurfaceDrawSourceObservation,
            getWindowDrawTextExReplayDepth,
            isCommittedSurfaceDrawEvent,
            normalizeOriginalParams,
            normalizeDrawOrigin,
        };
    }

    function requireFunction(value, name) {
        if (typeof value !== 'function') {
            throw new Error(`[WindowText] surface draw support requires ${name}.`);
        }
        return value;
    }
            return { create: createSurfaceDrawSupportController };
        },
    });
})();
