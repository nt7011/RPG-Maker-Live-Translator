// Stable bitmap surface transaction runner.
//
// Some native window text renderers cannot safely draw directly on the live
// bitmap. A stable transaction copies live pixels to a staging bitmap, lets the
// normal render plan mutate staging once, commits staging back to live, and
// records exact mutation proof for that commit.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'runtime.bitmap.stableSurfaceTransaction',
        requires: {
            surfaceMutationProof: 'runtime.bitmap.surfaceMutationProof',
        },
        factory({ surfaceMutationProof }, { scope }) {
            const captureBitmapSurfaceSample = surfaceMutationProof.captureBitmapSurfaceSample;
            const compareSurfaceSamples = surfaceMutationProof.compareSurfaceSamples;
            const cloneSurfaceMutationProof = surfaceMutationProof.cloneSurfaceMutationProof;

            function createStableSurfaceTransactionRunner(context = {}) {
                const createBitmap = typeof context.createBitmap === 'function'
                    ? context.createBitmap
                    : createRuntimeBitmap;
                const markBitmapPixelsDirty = typeof context.markBitmapPixelsDirty === 'function'
                    ? context.markBitmapPixelsDirty
                    : (() => false);

                function execute(input = {}) {
                    // A stable transaction has one direction of travel:
                    // copy live pixels into a staging bitmap, execute once on staging,
                    // commit staging back to live, then mark the live bitmap dirty.
                    // It never retries on the live surface after staging fails.
                    const liveBitmap = input.liveBitmap || input.targetBitmap || null;
                    const executeCallback = typeof input.execute === 'function' ? input.execute : null;
                    const shouldCommit = typeof input.shouldCommit === 'function'
                        ? input.shouldCommit
                        : defaultStableSurfaceShouldCommit;
                    const proof = createStableSurfaceTransactionProof(input);

                    if (!liveBitmap) {
                        proof.error = 'missing-live-bitmap';
                        return { result: null, proof };
                    }
                    if (!executeCallback) {
                        proof.error = 'missing-execute-callback';
                        return { result: null, proof };
                    }

                    const staging = createStableBitmapRenderSurface(liveBitmap, createBitmap);
                    mergeStableSurfacePreparationProof(proof, staging && staging.proof);
                    if (!staging || !staging.liveBitmap || !staging.stagedBitmap) {
                        proof.error = proof.error || 'stable-surface-unavailable';
                        return { result: null, proof };
                    }
                    proof.sampleArea = cloneSurfaceAreaForDiagnostics(input.sampleArea || staging.area);

                    const withStableSurface = typeof input.withStableSurface === 'function'
                        ? input.withStableSurface
                        : ((_stagedBitmap, callback) => callback());

                    let result = null;
                    withStableSurface(staging.stagedBitmap, () => {
                        result = executeCallback(staging.stagedBitmap, {
                            liveBitmap: staging.liveBitmap,
                            stagedBitmap: staging.stagedBitmap,
                            area: staging.area,
                            sampleArea: input.sampleArea || staging.area,
                            proof,
                        }) || null;
                        return result;
                    }, {
                        liveBitmap: staging.liveBitmap,
                        stagedBitmap: staging.stagedBitmap,
                        area: staging.area,
                        sampleArea: input.sampleArea || staging.area,
                        proof,
                    });

                    proof.execution.status = stringify(result && result.status || '');
                    proof.execution.reason = stringify(result && result.reason || '');
                    attachStableSurfaceTransactionProof(result, proof);
                    if (!shouldCommit(result, proof)) return { result, proof };

                    const commit = commitStableBitmapRenderSurface(staging, input.sampleArea || staging.area);
                    proof.commit.attempted = true;
                    proof.commit.back = commit.back === true;
                    proof.commit.surfaceMutation = commit.surfaceMutation || null;
                    proof.commit.error = stringify(commit.error || '');
                    if (proof.commit.back === true) {
                        // The staged bitmap may have been dirtied while executing the
                        // render plan, but only the live bitmap reaches the screen.
                        const dirtyUpload = markBitmapPixelsDirty(staging.liveBitmap, {
                            source: stringify(input.dirtySource || 'bitmap-stable-surface'),
                            reason: stringify(input.dirtyReason || 'stable-surface-commit'),
                        });
                        proof.dirtyUpload = normalizeDirtyUploadDetails(dirtyUpload);
                        if (result && typeof result === 'object') {
                            result.dirtyUpload = proof.dirtyUpload;
                            if (result.details && typeof result.details === 'object') {
                                result.details.dirtyUpload = proof.dirtyUpload;
                            }
                            if (result.diagnostics && proof.dirtyUpload) {
                                result.diagnostics.dirtyUpload = proof.dirtyUpload;
                            }
                        }
                    }
                    attachStableSurfaceTransactionProof(result, proof);
                    return { result, proof };
                }

                return freezeApi({ execute });
            }

            function createStableSurfaceTransactionProof(input = {}) {
                return {
                    type: 'stable-bitmap-surface',
                    active: true,
                    prepared: false,
                    area: null,
                    sampleArea: cloneSurfaceAreaForDiagnostics(input.sampleArea || null),
                    execution: {
                        status: '',
                        reason: '',
                    },
                    commit: {
                        attempted: false,
                        back: false,
                        surfaceMutation: null,
                        error: '',
                    },
                    dirtyUpload: null,
                    error: '',
                };
            }

            function createStableBitmapRenderSurface(liveBitmap, createBitmap) {
                const proof = {
                    prepared: false,
                    area: null,
                    error: '',
                };
                if (!canTransferBitmapPixels(liveBitmap)) {
                    proof.error = 'live-pixel-transfer-unavailable';
                    return { proof };
                }
                const width = readBitmapPixelWidth(liveBitmap);
                const height = readBitmapPixelHeight(liveBitmap);
                if (width <= 0 || height <= 0) {
                    proof.error = 'empty-live-bitmap';
                    return { proof };
                }

                try {
                    const stagedBitmap = createBitmap(width, height);
                    if (!stagedBitmap) {
                        proof.error = 'staging-bitmap-unavailable';
                        return { proof };
                    }
                    ensureBitmapPixelDimensions(stagedBitmap, width, height);
                    ensureBitmapPixelCanvas(liveBitmap, width, height);
                    ensureBitmapPixelCanvas(stagedBitmap, width, height);

                    const liveContext = getBitmapPixelContext(liveBitmap);
                    const stagedContext = getBitmapPixelContext(stagedBitmap);
                    if (!canUseBitmapPixelContext(liveContext) || !canUseBitmapPixelContext(stagedContext)) {
                        proof.error = 'staging-pixel-transfer-unavailable';
                        return { proof };
                    }

                    // Prepare the staged bitmap from the exact live pixels so clear,
                    // restore, replay, and draw steps see the same starting surface
                    // they would have seen on the live bitmap.
                    const area = { x: 0, y: 0, w: width, h: height };
                    const imageData = liveContext.getImageData(area.x, area.y, area.w, area.h);
                    if (!imageData || !imageData.data || !Number.isFinite(Number(imageData.data.length))) {
                        proof.error = 'live-pixel-read-empty';
                        return { proof };
                    }
                    stagedContext.putImageData(imageData, area.x, area.y);
                    proof.prepared = true;
                    proof.area = cloneSurfaceAreaForDiagnostics(area);
                    return {
                        liveBitmap,
                        stagedBitmap,
                        area,
                        proof,
                    };
                } catch (error) {
                    proof.error = getErrorMessage(error) || 'stable-surface-prepare-failed';
                    return { proof };
                }
            }

            function commitStableBitmapRenderSurface(staging, sampleArea) {
                const liveBitmap = staging && staging.liveBitmap || null;
                const stagedBitmap = staging && staging.stagedBitmap || null;
                const area = staging && staging.area || null;
                const liveContext = getBitmapPixelContext(liveBitmap);
                const stagedContext = getBitmapPixelContext(stagedBitmap);
                const before = captureBitmapSurfaceSample(liveBitmap, sampleArea || area);
                try {
                    if (!area || !liveContext || typeof liveContext.putImageData !== 'function'
                        || !stagedContext || typeof stagedContext.getImageData !== 'function') {
                        return {
                            back: false,
                            surfaceMutation: compareSurfaceSamples(before, captureBitmapSurfaceSample(liveBitmap, sampleArea || area)),
                            error: 'pixel-transfer-unavailable',
                        };
                    }
                    const imageData = stagedContext.getImageData(area.x, area.y, area.w, area.h);
                    liveContext.putImageData(imageData, area.x, area.y);
                    return {
                        back: true,
                        surfaceMutation: compareSurfaceSamples(before, captureBitmapSurfaceSample(liveBitmap, sampleArea || area)),
                        error: '',
                    };
                } catch (error) {
                    return {
                        back: false,
                        surfaceMutation: compareSurfaceSamples(before, captureBitmapSurfaceSample(liveBitmap, sampleArea || area)),
                        error: getErrorMessage(error),
                    };
                }
            }

            function canTransferBitmapPixels(bitmap) {
                const context = getBitmapPixelContext(bitmap);
                return !!(bitmap
                    && readBitmapPixelWidth(bitmap) > 0
                    && readBitmapPixelHeight(bitmap) > 0
                    && context
                    && typeof context.getImageData === 'function'
                    && typeof context.putImageData === 'function');
            }

            function canUseBitmapPixelContext(context) {
                return !!(context
                    && typeof context.getImageData === 'function'
                    && typeof context.putImageData === 'function');
            }

            function getBitmapPixelContext(bitmap) {
                return bitmap && (bitmap._context || bitmap.context) || null;
            }

            function ensureBitmapPixelDimensions(bitmap, width, height) {
                if (!bitmap) return;
                if (!readBitmapPixelWidth(bitmap)) {
                    try { bitmap.width = positiveInteger(width); } catch (_) {}
                }
                if (!readBitmapPixelHeight(bitmap)) {
                    try { bitmap.height = positiveInteger(height); } catch (_) {}
                }
            }

            function ensureBitmapPixelCanvas(bitmap, width, height) {
                const context = getBitmapPixelContext(bitmap);
                if (!context || context.canvas) return;
                try {
                    context.canvas = {
                        width: positiveInteger(width),
                        height: positiveInteger(height),
                    };
                } catch (_) {}
            }

            function readBitmapPixelWidth(bitmap) {
                return positiveInteger(bitmap && (bitmap.width
                    || bitmap._canvas && bitmap._canvas.width
                    || bitmap.canvas && bitmap.canvas.width
                    || bitmap._context && bitmap._context.canvas && bitmap._context.canvas.width
                    || bitmap.context && bitmap.context.canvas && bitmap.context.canvas.width));
            }

            function readBitmapPixelHeight(bitmap) {
                return positiveInteger(bitmap && (bitmap.height
                    || bitmap._canvas && bitmap._canvas.height
                    || bitmap.canvas && bitmap.canvas.height
                    || bitmap._context && bitmap._context.canvas && bitmap._context.canvas.height
                    || bitmap.context && bitmap.context.canvas && bitmap.context.canvas.height));
            }

            function mergeStableSurfacePreparationProof(target, preparation) {
                if (!target || !preparation) return;
                target.prepared = preparation.prepared === true;
                target.area = cloneSurfaceAreaForDiagnostics(preparation.area);
                target.error = stringify(preparation.error || target.error || '');
            }

            function attachStableSurfaceTransactionProof(result, proof) {
                if (!result || typeof result !== 'object') return result;
                if (!result.details || typeof result.details !== 'object') result.details = {};
                result.details.surfaceTransaction = cloneStableSurfaceTransactionProof(proof);
                return result;
            }

            function cloneStableSurfaceTransactionProof(proof) {
                const source = proof && typeof proof === 'object' ? proof : {};
                const commit = source.commit && typeof source.commit === 'object' ? source.commit : {};
                const execution = source.execution && typeof source.execution === 'object' ? source.execution : {};
                return {
                    type: stringify(source.type || 'stable-bitmap-surface'),
                    active: source.active === true,
                    prepared: source.prepared === true,
                    area: cloneSurfaceAreaForDiagnostics(source.area),
                    sampleArea: cloneSurfaceAreaForDiagnostics(source.sampleArea),
                    execution: {
                        status: stringify(execution.status || ''),
                        reason: stringify(execution.reason || ''),
                    },
                    commit: {
                        attempted: commit.attempted === true,
                        back: commit.back === true,
                        surfaceMutation: cloneSurfaceMutationProof(commit.surfaceMutation),
                        error: stringify(commit.error || ''),
                    },
                    dirtyUpload: normalizeDirtyUploadDetails(source.dirtyUpload),
                    error: stringify(source.error || ''),
                };
            }

            function cloneSurfaceAreaForDiagnostics(area) {
                if (!area || typeof area !== 'object') return null;
                if (Number.isFinite(Number(area.x1))
                    || Number.isFinite(Number(area.y1))
                    || Number.isFinite(Number(area.x2))
                    || Number.isFinite(Number(area.y2))) {
                    return {
                        x1: Number(area.x1) || 0,
                        y1: Number(area.y1) || 0,
                        x2: Number(area.x2) || 0,
                        y2: Number(area.y2) || 0,
                    };
                }
                return {
                    x: positiveInteger(area.x),
                    y: positiveInteger(area.y),
                    w: positiveInteger(area.w !== undefined ? area.w : area.width),
                    h: positiveInteger(area.h !== undefined ? area.h : area.height),
                };
            }

            function defaultStableSurfaceShouldCommit(result) {
                return !!(result && result.status === 'applied');
            }

            function createRuntimeBitmap(width, height) {
                if (typeof scope.Bitmap !== 'function') return null;
                return new scope.Bitmap(width, height);
            }

            function normalizeDirtyUploadDetails(value) {
                if (!value || typeof value !== 'object') return null;
                return {
                    handled: value.handled === true,
                    marked: value.marked === true,
                    setDirty: value.setDirty === true,
                    dirtyFlags: cloneArray(value.dirtyFlags).map(stringify),
                    baseTextureUpdates: positiveInteger(value.baseTextureUpdates),
                    bitmapWidth: positiveInteger(value.bitmapWidth),
                    bitmapHeight: positiveInteger(value.bitmapHeight),
                    reason: stringify(value.reason || ''),
                    errors: positiveInteger(value.errors),
                };
            }

            function cloneArray(value) {
                return Array.isArray(value) ? value.slice() : [];
            }

            function getErrorMessage(error) {
                try {
                    return stringify(error && error.message ? error.message : (error || ''));
                } catch (_) {
                    return '';
                }
            }

            function positiveInteger(value) {
                const numeric = Number(value);
                return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : 0;
            }

            function stringify(value) {
                try { return String(value ?? ''); } catch (_) { return ''; }
            }

            function freezeApi(api) {
                try { return Object.freeze(api); } catch (_) { return api; }
            }

            return freezeApi({
                createStableSurfaceTransactionRunner,
                canTransferBitmapPixels,
                attachStableSurfaceTransactionProof,
                cloneStableSurfaceTransactionProof,
            });
        },
    });
})();
