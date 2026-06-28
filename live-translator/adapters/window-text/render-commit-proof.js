// Window text adapter support: render commit and target proof.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'adapters.windowText.renderCommitProof',
        factory() {

    function createRenderCommitProofController(context = {}) {
        const {
            ADAPTER_ID,
            RENDER_STRATEGY,
            renderTransaction,
            getCurrentEntry,
            getTextEntryKey,
            getWindowTypeName,
            isUsableBitmap,
            roundDiagnosticNumber,
        } = context;
        const roundNumber = typeof roundDiagnosticNumber === 'function'
            ? roundDiagnosticNumber
            : (value) => value;

        function validateRenderTargetBeforeDraw(targetWindow, windowData, contents, entry) {
            // Redraw can temporarily bind arbitrary bitmaps through
            // withWindowContents(). Prove the bitmap is live before any clear,
            // replay, cache blit, or translated draw mutates it.
            const details = createRenderTargetDetails(targetWindow, windowData, contents, entry);
            if (!targetWindow) return rejectRenderTarget('window-redraw-target-missing', details);
            if (!windowData) return rejectRenderTarget('window-redraw-data-missing', details);
            if (!contents) return rejectRenderTarget('window-redraw-contents-missing', details);
            if (!callRequired(isUsableBitmap, 'isUsableBitmap')(contents)) {
                return rejectRenderTarget('window-redraw-contents-unusable', details);
            }
            if (targetWindow.contents !== contents) return rejectRenderTarget('window-redraw-contents-not-live', details);
            if (entry && entry.contentsBitmap && entry.contentsBitmap !== contents) {
                return rejectRenderTarget('window-redraw-entry-contents-stale', details);
            }
            if (entry && windowData && windowData.texts && callRequired(getCurrentEntry, 'getCurrentEntry')(windowData, entry) !== entry) {
                return rejectRenderTarget('window-entry-replaced', details);
            }
            return { accepted: true, reason: '', details };
        }

        function validateRenderCommit(commit, targetWindow, windowData, contents, entry, renderExecution = null) {
            const targetProof = validateRenderTargetBeforeDraw(targetWindow, windowData, contents, entry);
            if (!targetProof.accepted) return targetProof;
            if (!isRenderCommitCommitted(commit)) {
                return rejectRenderTarget('window-redraw-commit-missing', Object.assign({}, targetProof.details, {
                    renderCommit: summarizeRenderCommit(commit),
                }));
            }
            const dirtyUpload = summarizeRenderDirtyUpload(renderExecution);
            const surfaceMutation = summarizeRenderSurfaceMutation(renderExecution, roundNumber);
            const dirtyProof = createRenderDirtyUploadProof(commit, dirtyUpload);
            const commitIdentityProof = {
                mode: String(commit && commit.mode || ''),
                route: String(commit && commit.route || ''),
                windowType: String(commit && commit.windowType || ''),
                method: String(commit && commit.method || ''),
            };
            const nativeDrawProof = {
                drawTextExInputConverted: commit && commit.drawTextExInputConverted === true,
                drawTextExInputHasEsc: commit && commit.drawTextExInputHasEsc === true,
                processedTextHasEsc: commit && commit.processedTextHasEsc === true,
                nativeDrawTextExArgCount: positiveInteger(commit && commit.nativeDrawTextExArgCount),
                bitmapTextDrawCount: positiveInteger(commit && commit.bitmapTextDrawCount),
                bitmapBltDrawCount: positiveInteger(commit && commit.bitmapBltDrawCount),
                bitmapDrawPrimitiveCount: positiveInteger(commit && commit.bitmapDrawPrimitiveCount),
                bitmapDrawnTextPreview: String(commit && commit.bitmapDrawnTextPreview || ''),
            };
            const surfaceMutationProof = {
                renderSurfaceMutationDrawReadable: surfaceMutation.drawReadable === true,
                renderSurfaceMutationDrawChanged: surfaceMutation.drawChanged === true,
                renderSurfaceMutationOverallDrawChanged: surfaceMutation.overallDrawChanged === true,
                renderSurfaceMutationDrawRect: String(surfaceMutation.drawRect || ''),
                renderSurfaceMutationDrawBeforeChecksum: positiveInteger(surfaceMutation.drawBeforeChecksum),
                renderSurfaceMutationDrawAfterChecksum: positiveInteger(surfaceMutation.drawAfterChecksum),
                stableSurface: surfaceMutation.stableSurface === true,
                stableSurfacePrepared: surfaceMutation.stableSurfacePrepared === true,
                stableSurfaceCommitBack: surfaceMutation.stableCommitBack === true,
                stableSurfaceCommitReadable: surfaceMutation.stableCommitReadable === true,
                stableSurfaceCommitChanged: surfaceMutation.stableCommitChanged === true,
            };
            const details = Object.assign({}, commit, dirtyProof, commitIdentityProof, nativeDrawProof, surfaceMutationProof, {
                bitmapMarkedDirty: commit.bitmapMarkedDirty === true || dirtyUpload.marked === true,
                bitmapDirtyUpload: dirtyUpload,
                renderSurfaceMutation: surfaceMutation,
                target: targetProof.details,
            });
            if (commit.entryGeneration !== targetProof.details.entryGeneration) {
                return rejectRenderTarget('window-redraw-entry-generation-changed', details);
            }
            if (commit.windowContentsCurrent !== true) {
                return rejectRenderTarget('window-redraw-commit-not-live', details);
            }
            if (entry && entry.contentsBitmap && commit.contentsSameAsEntry !== true) {
                return rejectRenderTarget('window-redraw-commit-entry-contents-mismatch', details);
            }
            if (isRichTextRenderCommit(commit) && positiveInteger(commit.bitmapDrawPrimitiveCount) <= 0) {
                return rejectRenderTarget('window-redraw-commit-no-bitmap-draw', details);
            }
            if (renderExecutionUsesStableSurface(renderExecution)
                && surfaceMutation.stableCommitBack !== true) {
                return rejectRenderTarget('window-redraw-stable-surface-commit-missed', details);
            }
            if (renderExecutionUsesStableSurface(renderExecution)
                && surfaceMutation.stableCommitReadable !== true) {
                return rejectRenderTarget('window-redraw-stable-surface-commit-unverified', details);
            }
            if (isRichTextRenderCommit(commit)
                && surfaceMutation.drawReadable === true
                && surfaceMutation.drawChanged !== true) {
                return rejectRenderTarget('window-redraw-commit-no-surface-mutation', details);
            }
            if (renderExecutionRequiresDirtyUpload(renderExecution) && dirtyUpload.marked !== true) {
                return rejectRenderTarget('window-redraw-dirty-upload-missed', details);
            }
            const surfaceProof = createRenderSurfaceProof(details);
            return { accepted: true, reason: '', details, surfaceProof };
        }

        function createRenderSurfaceProof(details) {
            return renderTransaction && typeof renderTransaction.createRenderSurfaceProof === 'function'
                ? renderTransaction.createRenderSurfaceProof(details)
                : details;
        }

        function createRenderCommit(mode, targetWindow, contents, entry, route, details = {}) {
            // The commit is serialized into diagnostics and render events; keep
            // it primitive and avoid leaking live RPG Maker objects.
            const targetDetails = createRenderTargetDetails(targetWindow, entry && entry.windowData, contents, entry);
            const evidence = Object.assign({
                bitmapMarkedDirty: isBitmapMarkedDirty(contents),
            }, details || {}, targetDetails);
            return callRequired(renderTransaction && renderTransaction.createRenderCommit, 'renderTransaction.createRenderCommit')({
                status: 'committed',
                mode: String(mode || ''),
                route: String(route || ''),
                adapterId: ADAPTER_ID,
                itemId: entry && entry.recordId || '',
                recordId: entry && entry.recordId || '',
                surfaceId: entry && entry.surfaceId || '',
                slotKey: entry && entry.slotKey || '',
                strategy: RENDER_STRATEGY,
                commandId: entry && entry.renderTransaction && entry.renderTransaction.commandId || '',
                commandGeneration: entry && entry.renderTransaction && entry.renderTransaction.commandGeneration || 0,
                generation: entry && entry.surfaceRevision || 0,
                translationReceived: entry && entry.providerText || '',
                translationDrawn: entry && entry.renderedText || '',
                drawBoundary: entry && entry.renderLifecycle && entry.renderLifecycle.sourceDraw || null,
                details: evidence,
            });
        }

        function createRenderTargetDetails(targetWindow, windowData, contents, entry) {
            const textKey = getSafeRenderTextKey(windowData, entry);
            const currentEntry = entry && windowData && windowData.texts
                ? callRequired(getCurrentEntry, 'getCurrentEntry')(windowData, entry)
                : null;
            return {
                windowType: callRequired(getWindowTypeName, 'getWindowTypeName')(targetWindow, windowData),
                method: entry && entry.type || '',
                textKey,
                surfaceId: entry && entry.surfaceId || '',
                identitySurfaceId: entry && entry.identitySurfaceId || '',
                entryGeneration: Number(entry && entry.surfaceRevision) || 0,
                contentsSameAsEntry: !!(entry && contents && entry.contentsBitmap === contents),
                windowContentsCurrent: !!(targetWindow && contents && targetWindow.contents === contents),
                currentEntryMatches: !!(entry && currentEntry === entry),
                entryContentsRevision: Number.isFinite(Number(entry && entry.contentsRevision)) ? Number(entry.contentsRevision) : null,
                windowContentsRevision: windowData && Number.isFinite(Number(windowData.contentsRevision)) ? Number(windowData.contentsRevision) : null,
                contentsWidth: Number(contents && contents.width) || 0,
                contentsHeight: Number(contents && contents.height) || 0,
                entryContentsWidth: Number(entry && entry.contentsBitmap && entry.contentsBitmap.width) || 0,
                entryContentsHeight: Number(entry && entry.contentsBitmap && entry.contentsBitmap.height) || 0,
            };
        }

        function getSafeRenderTextKey(windowData, entry) {
            try {
                return entry && (entry.key || callRequired(getTextEntryKey, 'getTextEntryKey')(windowData, entry)) || '';
            } catch (_) {
                return entry && entry.key || '';
            }
        }

        return {
            validateRenderTargetBeforeDraw,
            validateRenderCommit,
            createRenderSurfaceProof,
            createRenderCommit,
            createRenderTargetDetails,
        };
    }

    function rejectRenderTarget(reason, details) {
        return {
            accepted: false,
            reason: String(reason || 'window-redraw-target-rejected'),
            details: details || null,
        };
    }

    function isRenderCommitCommitted(commit) {
        return !!(commit && commit.committed === true);
    }

    function isRichTextRenderCommit(commit) {
        const mode = String(commit && commit.mode || '');
        return mode === 'native-drawTextEx';
    }

    function summarizeRenderCommit(commit) {
        if (!commit || typeof commit !== 'object') return null;
        return {
            committed: commit.committed === true,
            mode: String(commit.mode || ''),
            route: String(commit.route || ''),
            bitmapMarkedDirty: commit.bitmapMarkedDirty === true,
            windowType: String(commit.windowType || ''),
            method: String(commit.method || ''),
            contentsSameAsEntry: commit.contentsSameAsEntry === true,
            windowContentsCurrent: commit.windowContentsCurrent === true,
            currentEntryMatches: commit.currentEntryMatches === true,
            entryGeneration: Number(commit.entryGeneration) || 0,
        };
    }

    function createRenderDirtyUploadProof(commit, dirtyUpload) {
        // Render commit diagnostics pass through bounded history serializers.
        // Keep upload proof as top-level primitives so it remains visible even
        // when the richer executor object is trimmed.
        return {
            bitmapMarkedDirty: !!(commit && commit.bitmapMarkedDirty === true || dirtyUpload && dirtyUpload.marked === true),
            contentsSameAsEntry: commit && commit.contentsSameAsEntry === true,
            windowContentsCurrent: commit && commit.windowContentsCurrent === true,
            currentEntryMatches: commit && commit.currentEntryMatches === true,
            entryGeneration: positiveInteger(commit && commit.entryGeneration),
            bitmapDirtyUploadHandled: dirtyUpload && dirtyUpload.handled === true,
            bitmapDirtyUploadMarked: dirtyUpload && dirtyUpload.marked === true,
            bitmapDirtyUploadSetDirty: dirtyUpload && dirtyUpload.setDirty === true,
            bitmapDirtyUploadBaseTextureUpdates: positiveInteger(dirtyUpload && dirtyUpload.baseTextureUpdates),
            bitmapDirtyUploadErrors: positiveInteger(dirtyUpload && dirtyUpload.errors),
            bitmapDirtyUploadReason: dirtyUpload && dirtyUpload.reason ? String(dirtyUpload.reason) : '',
        };
    }

    function summarizeRenderDirtyUpload(renderExecution) {
        const dirtyUpload = renderExecution && renderExecution.dirtyUpload
            ? renderExecution.dirtyUpload
            : (renderExecution && renderExecution.details && renderExecution.details.dirtyUpload);
        if (!dirtyUpload || typeof dirtyUpload !== 'object') {
            return {
                handled: false,
                marked: false,
                setDirty: false,
                dirtyFlags: [],
                baseTextureUpdates: 0,
                reason: '',
                errors: 0,
            };
        }
        return {
            handled: dirtyUpload.handled === true,
            marked: dirtyUpload.marked === true,
            setDirty: dirtyUpload.setDirty === true,
            dirtyFlags: Array.isArray(dirtyUpload.dirtyFlags) ? dirtyUpload.dirtyFlags.slice() : [],
            baseTextureUpdates: positiveInteger(dirtyUpload.baseTextureUpdates),
            bitmapWidth: positiveInteger(dirtyUpload.bitmapWidth),
            bitmapHeight: positiveInteger(dirtyUpload.bitmapHeight),
            reason: String(dirtyUpload.reason || ''),
            errors: positiveInteger(dirtyUpload.errors),
        };
    }

    function summarizeRenderSurfaceMutation(renderExecution, roundNumber) {
        const details = renderExecution && renderExecution.details && typeof renderExecution.details === 'object'
            ? renderExecution.details
            : {};
        const restore = details.restore && details.restore.surfaceMutation || null;
        const drawDetails = details.draw && typeof details.draw === 'object'
            ? details.draw
            : {};
        const transaction = details.surfaceTransaction && typeof details.surfaceTransaction === 'object'
            ? details.surfaceTransaction
            : {};
        const transactionCommit = transaction.commit && typeof transaction.commit === 'object'
            ? transaction.commit
            : {};
        const stableCommit = transactionCommit.surfaceMutation || null;
        const drawText = drawDetails.drawTextSurfaceMutation || null;
        const draw = drawText || drawDetails.surfaceMutation || null;
        const overallDraw = drawDetails.surfaceMutation || drawText || null;
        return {
            stableSurface: transaction.active === true,
            stableSurfacePrepared: transaction.prepared === true,
            stableCommitBack: transactionCommit.back === true,
            stableCommitReadable: stableCommit && stableCommit.readable === true,
            stableCommitChanged: stableCommit && stableCommit.changed === true,
            restoreAvailable: restore && restore.available === true,
            restoreReadable: restore && restore.readable === true,
            restoreChanged: restore && restore.changed === true,
            drawAvailable: draw && draw.available === true,
            drawReadable: draw && draw.readable === true,
            drawChanged: draw && draw.changed === true,
            overallDrawChanged: overallDraw && overallDraw.changed === true,
            drawRect: formatSurfaceMutationRect(draw && draw.rect, roundNumber),
            drawBeforeChecksum: positiveInteger(draw && draw.beforeChecksum),
            drawAfterChecksum: positiveInteger(draw && draw.afterChecksum),
            drawBeforeAlphaSum: positiveInteger(draw && draw.beforeAlphaSum),
            drawAfterAlphaSum: positiveInteger(draw && draw.afterAlphaSum),
            drawBeforeNonTransparent: positiveInteger(draw && draw.beforeNonTransparent),
            drawAfterNonTransparent: positiveInteger(draw && draw.afterNonTransparent),
            error: String(draw && draw.error || restore && restore.error || stableCommit && stableCommit.error || ''),
        };
    }

    function formatSurfaceMutationRect(rect, roundNumber) {
        if (!rect || typeof rect !== 'object') return '';
        return [
            `x=${roundNumber(rect.x)}`,
            `y=${roundNumber(rect.y)}`,
            `w=${roundNumber(rect.width !== undefined ? rect.width : rect.w)}`,
            `h=${roundNumber(rect.height !== undefined ? rect.height : rect.h)}`,
        ].join(',');
    }

    function renderExecutionUsesStableSurface(renderExecution) {
        const transaction = renderExecution
            && renderExecution.details
            && renderExecution.details.surfaceTransaction;
        return !!(transaction && transaction.active === true);
    }

    function renderExecutionRequiresDirtyUpload(renderExecution) {
        if (!renderExecution || !renderExecution.details) return false;
        return renderExecution.details.markDirty === true;
    }

    function isBitmapMarkedDirty(bitmap) {
        return !!(bitmap && (bitmap._dirty === true || bitmap.dirty === true || bitmap._needsUpdate === true));
    }

    function positiveInteger(value) {
        const number = Number(value);
        return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
    }

    function callRequired(callback, name) {
        if (typeof callback !== 'function') {
            throw new Error(`[WindowText] render commit proof requires ${name}.`);
        }
        return callback;
    }
            return { create: createRenderCommitProofController };
        },
    });
})();
