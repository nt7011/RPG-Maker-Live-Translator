import { createPixelSurfaces, type PixelSurfaces } from './bitmap-pixel-surfaces.js';
import { createPixelCopied } from './bitmap-pixel-copied.js';
import { createPixelOccurrence } from './bitmap-pixel-occurrence.js';
import { createPixelDisplay } from './bitmap-pixel-display.js';
import { createPixelOrigins } from './bitmap-pixel-origins.js';
import { createPixelResources } from './bitmap-pixel-resources.js';
import { createPixelBudget } from './bitmap-pixel-budget.js';
import { drawTextGroup } from './bitmap-pixel-raster.js';
import { createPixelQueries } from './bitmap-pixel-queries.js';
import { createPixelCaptures } from './bitmap-pixel-captures.js';
import { createPixelProofs } from './bitmap-pixel-proofs.js';
import { createPixelRows } from './bitmap-pixel-rows.js';
import { vertex, compareFragment, vacantFragment, regionEvidenceFragment, ownershipFragment, collisionFragment, reduceFragment, reverseFragment, proofFragment, imageFragment, } from './bitmap-pixel-shaders.js';
import { PixelCapacityRefusal, type PixelProof, type PixelCompositionRequest, type PixelCompositionRefusal, type PixelCompositionResult, } from './bitmap-pixel-types.js';
export type { PixelCapture, PixelEffect, PixelSnapshot, PixelProof, PixelProofFailure, PixelBounds, PixelTextEvidence, PixelTextCandidate, PixelTextGroup, PixelCompositionMember, PixelCompositionRequest, PixelCompositionRefusal, PixelCompositionResult, PixelGroupProof, } from './bitmap-pixel-types.js';
import type { TextPaint } from '../stores/styled-text.js';
import { timed, type RuntimeTiming } from '../runtime/diagnostic-timing.js';
import { BITMAP_LIMITS } from '../stores/bitmap-limits.js';
import type { RuntimeResourceObserver } from '../runtime/diagnostics-ingress.js';
export function createBitmapPixelDevice(options: {
    readonly timing?: RuntimeTiming | undefined;
    readonly createCanvas: () => HTMLCanvasElement;
    readonly createOffscreenCanvas: () => OffscreenCanvas;
    readonly reportFailure: (error: unknown) => void;
    readonly resourceEvent?: RuntimeResourceObserver | undefined;
    readonly probeEvent?: RuntimeResourceObserver | undefined;
    readonly proofDiagnostics?: boolean;
}) {
    const output = options.createOffscreenCanvas();
    const context = output.getContext('webgl2', {
        alpha: true,
        antialias: false,
        depth: false,
        stencil: false,
        premultipliedAlpha: false,
        preserveDrawingBuffer: true,
    });
    if (context === null)
        throw new Error('WebGL2 is unavailable.');
    const gl: WebGL2RenderingContext = context;
    let composing = false, disposed = false, availabilityRevision = 0;
    let listenerAttached = false;
    const limitBytes = BITMAP_LIMITS.pixelBytes;
    const maxTextureSize = Number(gl.getParameter(gl.MAX_TEXTURE_SIZE));
    const budget = createPixelBudget(maxTextureSize, options.resourceEvent);
    const resources = createPixelResources(gl, output, budget, {
        ...options,
        isDisposed,
        capacityChanged: () => {
            if (!composing)
                availabilityRevision++;
        },
    });
    const { drawing, assign, check } = resources;
    const { program } = drawing;
    let surfaces: PixelSurfaces;
    try {
        surfaces = createPixelSurfaces(drawing, output, budget, {
            ...options,
            isDisposed,
            imageProgram: () => imageProgram,
            releaseProof: (proof) => {
                queryStore.release(proof);
            },
            capacityChanged: () => {
                if (!composing)
                    availabilityRevision++;
            },
        });
    }
    catch (error) {
        resources.dispose();
        throw error;
    }
    const { textCanvas, textContext, resizeWork } = surfaces;
    options.resourceEvent?.({ kind: 'usage', name: 'textureSize', value: 0, limit: maxTextureSize });
    let compare: WebGLProgram, vacant: WebGLProgram, regionEvidence: WebGLProgram, ownership: WebGLProgram, collision: WebGLProgram, reduction: WebGLProgram, reverse: WebGLProgram, proofProgram: WebGLProgram, imageProgram: WebGLProgram;
    try {
        compare = program(vertex, compareFragment);
        vacant = program(vertex, vacantFragment);
        regionEvidence = program(vertex, regionEvidenceFragment);
        ownership = program(vertex, ownershipFragment);
        collision = program(vertex, collisionFragment);
        reduction = program(vertex, reduceFragment(options.proofDiagnostics === true));
        reverse = program(vertex, reverseFragment);
        proofProgram = program(vertex, proofFragment(options.proofDiagnostics === true));
        imageProgram = program(vertex, imageFragment);
    }
    catch (error) {
        resources.dispose();
        surfaces.disposeWork();
        throw error;
    }
    const queryStore = createPixelQueries(drawing, {
        proofProgram,
        proofDiagnostics: options.proofDiagnostics,
        capacityChanged: () => {
            availabilityRevision++;
        },
    });
    const captureStore = createPixelCaptures(drawing, {
        isDisposed,
        probeEvent: options.probeEvent,
    });
    const { begin, prepareWrite, abort, finish, releaseEffect, copyEffect, damageBounds, selectEffects, sourceId } = captureStore;
    const { releaseQueries, poll } = queryStore;
    const proofOperations = createPixelProofs(drawing, { imageProgram, reduction, compare, regionEvidence, vacant, reverse }, options);
    const { reverseEffects } = proofOperations;
    const prepareRows = createPixelRows(drawing, proofOperations, {
        proofDiagnostics: options.proofDiagnostics,
        getEffect: captureStore.getEffect,
        sourceId,
        selectEffects,
        ownership,
        collision,
        reduction,
        textCanvas,
        textContext,
        resizeWork,
        drawTextGroup,
    });
    const origins = createPixelOrigins(drawing, { ...options, isDisposed, selectEffects, reverseEffects, assign });
    const { describe: describeSnapshot, capture: captureSnapshot, release: releaseSnapshot } = origins;
    const prepareCopied = createPixelCopied(drawing, proofOperations, { ...options, reduction, sourceId });
    const composeOccurrence = createPixelOccurrence(drawing, output, budget, {
        ...options,
        surfaces,
        origins,
        queries: queryStore,
        prepareCopied,
        prepareRows,
        isDisposed,
        display: createPixelDisplay(drawing),
    });
    function isDisposed(): boolean {
        return disposed;
    }
    function compose(requests: readonly PixelCompositionRequest[]): readonly PixelCompositionResult[] {
        if (disposed || composing)
            return requests.map(() => ({ refusal: 'unavailable-evidence' }));
        let capacity = BITMAP_LIMITS.proofs - queryStore.count();
        const staged: (NonNullable<ReturnType<typeof composeOccurrence>> | PixelCompositionRefusal)[] = [];
        composing = true;
        try {
            for (const request of requests) {
                if (capacity === 0) {
                    options.resourceEvent?.({
                        kind: 'usage',
                        name: 'proofs',
                        value: BITMAP_LIMITS.proofs,
                        limit: BITMAP_LIMITS.proofs,
                    });
                    options.resourceEvent?.({ kind: 'refused', name: 'proofs', requested: 1 });
                    staged.push({ refusal: 'capacity' });
                    continue;
                }
                try {
                    const result = composeOccurrence(request);
                    staged.push(result ?? { refusal: 'unavailable-evidence' });
                    if (result !== null)
                        capacity--;
                }
                catch (error) {
                    if (!(error instanceof PixelCapacityRefusal))
                        throw error;
                    staged.push({ refusal: 'capacity' });
                }
                if (isDisposed())
                    throw new Error('Bitmap pixel device ended during composition.');
            }
            check();
            if (isDisposed())
                throw new Error('Bitmap pixel device ended during composition.');
            gl.flush();
            for (const item of staged)
                if ('surface' in item)
                    queryStore.publish(item.proof, item.queries);
            return staged.map((item) => 'surface' in item ? { surface: item.surface, regions: item.regions, proof: item.proof } : item);
        }
        catch (error) {
            for (const item of staged)
                if ('surface' in item) {
                    releaseQueries(item.queries);
                    releaseDisplay(item.surface, true);
                }
            throw error;
        }
        finally {
            composing = false;
        }
    }
    function releaseDisplay(surface: HTMLCanvasElement, owned: boolean): PixelProof | null {
        const proof = surfaces.releaseDisplay(surface, owned);
        if (disposed) {
            reportResources();
            options.resourceEvent?.({ kind: 'frame' });
        }
        return proof;
    }
    function dispose(): void {
        if (disposed)
            return;
        disposed = true;
        if (listenerAttached)
            output.removeEventListener('webglcontextlost', contextLost);
        listenerAttached = false;
        captureStore.dispose();
        origins.dispose();
        queryStore.dispose();
        resources.dispose();
        surfaces.disposeWork();
    }
    function reclaim(): void {
        if (disposed || composing)
            return;
        if (budget.needsReclamation() ||
            (captureStore.effectCount() === 0 &&
                origins.count() === 0 &&
                captureStore.captureCount() === 0 &&
                surfaces.count() === 0)) {
            surfaces.trim();
        }
        budget.reclaimed();
    }
    function reportResources(): void {
        if (options.resourceEvent === undefined)
            return;
        options.resourceEvent({ kind: 'usage', name: 'effects', value: captureStore.effectCount(), limit: null });
        options.resourceEvent({ kind: 'usage', name: 'captures', value: captureStore.captureCount(), limit: null });
        options.resourceEvent({ kind: 'usage', name: 'displays', value: surfaces.count(), limit: null });
        options.resourceEvent({ kind: 'usage', name: 'origins', value: origins.count(), limit: null });
        options.resourceEvent({ kind: 'usage', name: 'pixelBytes', value: budget.allocatedBytes(), limit: limitBytes });
        options.resourceEvent({
            kind: 'usage',
            name: 'proofs',
            value: queryStore.count(),
            limit: BITMAP_LIMITS.proofs,
        });
    }
    function contextLost(): void {
        if (disposed)
            return;
        dispose();
        options.reportFailure(new Error('Bitmap pixel device context lost.'));
    }
    output.addEventListener('webglcontextlost', contextLost);
    listenerAttached = true;
    return {
        begin,
        prepareWrite,
        finish,
        abort,
        damageBounds,
        effectBytes: captureStore.effectBytes,
        releaseEffect,
        copyEffect,
        describeSnapshot,
        captureSnapshot,
        measure: (text: string, paint: TextPaint) => {
            textContext.font = paint.font;
            textContext.textAlign = 'left';
            textContext.textBaseline = 'alphabetic';
            const metrics = textContext.measureText(text);
            return {
                width: metrics.width,
                left: metrics.actualBoundingBoxLeft,
                right: metrics.actualBoundingBoxRight,
                ascent: metrics.actualBoundingBoxAscent,
                descent: metrics.actualBoundingBoxDescent,
            };
        },
        releaseSnapshot,
        releaseDisplay,
        compose: timed(options.timing, 'composition', compose, ([requests]) => [
            requests.length,
            requests.reduce((sum, request) => sum +
                ('members' in request ? request.members : [request]).reduce((total, member) => total +
                    ('bounds' in member
                        ? member.bounds.width * member.bounds.height
                        : member.source.width * member.source.height), 0), 0),
        ]),
        poll,
        dispose,
        reclaim: timed(options.timing, 'reclamation', reclaim),
        needsReclamation: () => budget.needsReclamation() && !composing,
        hasPendingQueries: () => queryStore.count() > 0,
        availabilityRevision: () => availabilityRevision,
        reportResources,
    };
}
export type BitmapPixelDevice = ReturnType<typeof createBitmapPixelDevice>;
