// Window text adapter support: copied-target redraw execution.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'adapters.windowText.copiedTargetRender',
        requires: {
            copiedTargetProofSummary: 'runtime.bitmap.copiedTargetProofSummary',
            surfaceRoleState: 'runtime.windowSurfaceRoleState',
        },
        factory({ copiedTargetProofSummary, surfaceRoleState }) {

    function createCopiedTargetRenderController(context = {}) {
        const {
            generateKey,
            telemetry,
            getWindowTypeName,
            planWindowCopiedTargetRedraw,
            redrawCopiedWindowTextTargets,
            completePendingRenderCommand,
            recordDecision,
            createRenderSurfaceProof,
        } = context;

        function renderStagingCopiedTargets(input = {}) {
            const { entry, targetWindow, windowData, renderedText } = input;
            if (!isCopiedStagingEntry(entry) || !renderedText) return false;

            const copiedTargetRedrawPlan = createCopiedTargetRedrawPlan(entry, renderedText);
            const renderPlan = copiedTargetRedrawPlan.renderPlan;
            if (!isPlannedCopiedTargetRedraw(renderPlan)) return false;

            const copiedTargetRedraw = redrawCopiedTargets(entry, renderedText, renderPlan.redrawOptions || {});
            if (!(copiedTargetRedraw.redrawn > 0)) return false;

            const position = entry.position || {};
            const details = {
                windowType: callRequired(getWindowTypeName, 'getWindowTypeName')(targetWindow, windowData),
                method: entry.type || '',
                renderMode: 'copied-staging-target',
                copiedTargets: copiedTargetRedraw.redrawn,
                copiedTargetProof: copiedTargetRedraw.proof,
                sourceContentsRole: entry.sourceContentsRole || '',
                translationDrawn: renderedText,
                translationReceived: entry.providerText || '',
                renderPlan: copiedTargetRedrawPlan.diagnostics,
            };
            details.surfaceProof = copiedTargetProofSummary.createCopiedTargetSurfaceProof(
                null,
                copiedTargetRedraw.proof,
                createRenderSurfaceProof
            );
            callRequired(telemetry && telemetry.logDraw, 'telemetry.logDraw')('redraw', renderedText, position.x, position.y, details);
            callRequired(recordDecision, 'recordDecision')(entry, 'draw.redraw', 'window copied staging redraw applied', details);
            const renderCommit = callRequired(completePendingRenderCommand, 'completePendingRenderCommand')(entry, details);
            rememberRecentlyRedrawn(windowData, entry, position);
            return renderCommit || true;
        }

        function renderCopiedTargetsAfterWindowRedraw(input = {}) {
            const { entry, renderedText, textFit, redrawDetails, diagnostics } = input;
            const copiedTargetRedrawPlan = createCopiedTargetRedrawPlan(entry, renderedText);
            const renderPlan = copiedTargetRedrawPlan.renderPlan;
            const copiedTargetRedraw = isPlannedCopiedTargetRedraw(renderPlan)
                ? redrawCopiedTargets(entry, renderedText, Object.assign(
                    { textFit },
                    renderPlan.redrawOptions || {}
                ))
                : { redrawn: 0, proof: null };

            attachCopiedTargetRedrawDiagnostics(
                redrawDetails,
                diagnostics,
                copiedTargetRedrawPlan.diagnostics,
                copiedTargetRedraw.redrawn,
                copiedTargetRedraw.proof,
                createRenderSurfaceProof
            );
            return {
                copiedTargets: copiedTargetRedraw.redrawn,
                diagnostics: copiedTargetRedrawPlan.diagnostics || null,
                renderPlan,
                proof: copiedTargetRedraw.proof,
            };
        }

        function createCopiedTargetRedrawPlan(entry, renderedText) {
            return callRequired(planWindowCopiedTargetRedraw, 'planWindowCopiedTargetRedraw')(entry, renderedText) || {};
        }

        function redrawCopiedTargets(entry, renderedText, options) {
            const compositionProofs = [];
            const redrawn = callRequired(redrawCopiedWindowTextTargets, 'redrawCopiedWindowTextTargets')(
                entry,
                renderedText,
                Object.assign({}, options || {}, {
                    copiedTargetCompositionProofs: compositionProofs,
                })
            ) || 0;
            const proof = copiedTargetProofSummary.createCopiedTargetProofSummary(compositionProofs, redrawn);
            return {
                redrawn: Math.max(nonNegativeNumber(redrawn), getCopiedTargetProofRedrawn(proof)),
                proof,
            };
        }

        function rememberRecentlyRedrawn(windowData, entry, position) {
            if (!windowData || !entry) return false;
            const key = callRequired(generateKey, 'generateKey')(
                entry.type,
                position && position.x,
                position && position.y,
                windowData.windowType,
                entry.convertedText,
                entry.slotKey
            );
            if (!windowData.recentlyRedrawn) windowData.recentlyRedrawn = new Map();
            windowData.recentlyRedrawn.set(key, Date.now());
            return true;
        }

        return {
            renderStagingCopiedTargets,
            renderCopiedTargetsAfterWindowRedraw,
            rememberRecentlyRedrawn,
        };
    }

    function isCopiedStagingEntry(entry) {
        return surfaceRoleState.isCopiedStagingEntry(entry)
            || hasCopiedContentsReplacementProof(entry);
    }

    function hasCopiedContentsReplacementProof(entry) {
        const proof = entry && entry.detachedRenderProof && typeof entry.detachedRenderProof === 'object'
            ? entry.detachedRenderProof
            : null;
        return !!(proof
            && String(proof.type || '') === 'copied-contents-replacement'
            && Number(proof.copiedTargets) > 0);
    }

    function isPlannedCopiedTargetRedraw(renderPlan) {
        return !!(renderPlan
            && renderPlan.status === 'planned'
            && renderPlan.steps
            && renderPlan.steps.redrawCopiedTargets === true);
    }

    function attachCopiedTargetRedrawDiagnostics(
        redrawDetails,
        diagnostics,
        renderPlanDiagnostics,
        copiedTargetRedraws,
        copiedTargetProof,
        createRenderSurfaceProof
    ) {
        if (renderPlanDiagnostics) {
            if (redrawDetails) redrawDetails.copiedTargetRenderPlan = renderPlanDiagnostics;
            if (diagnostics) diagnostics.copiedTargetRenderPlan = renderPlanDiagnostics;
        }
        const copiedTargetRedrawnCount = Math.max(
            nonNegativeNumber(copiedTargetRedraws),
            getCopiedTargetProofRedrawn(copiedTargetProof)
        );
        if (copiedTargetRedrawnCount > 0) {
            if (redrawDetails) redrawDetails.copiedTargets = copiedTargetRedrawnCount;
            if (diagnostics) diagnostics.copiedTargets = copiedTargetRedrawnCount;
            if (copiedTargetProof) {
                if (redrawDetails) {
                    redrawDetails.copiedTargetProof = copiedTargetProof;
                    redrawDetails.surfaceProof = copiedTargetProofSummary.createCopiedTargetSurfaceProof(
                        redrawDetails.surfaceProof,
                        copiedTargetProof,
                        createRenderSurfaceProof
                    );
                }
                if (diagnostics) diagnostics.copiedTargetProof = copiedTargetProof;
            }
        }
    }

    function getCopiedTargetProofRedrawn(proof) {
        const redrawn = Number(proof && proof.redrawn);
        const copiedTargets = Number(proof && proof.copiedTargets);
        return Math.max(
            Number.isFinite(redrawn) ? redrawn : 0,
            Number.isFinite(copiedTargets) ? copiedTargets : 0,
            0
        );
    }

    function nonNegativeNumber(value) {
        const numeric = Number(value);
        return Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
    }

    function callRequired(callback, name) {
        if (typeof callback !== 'function') {
            throw new Error(`[WindowText] copied-target render requires ${name}.`);
        }
        return callback;
    }
            return { create: createCopiedTargetRenderController };
        },
    });
})();
