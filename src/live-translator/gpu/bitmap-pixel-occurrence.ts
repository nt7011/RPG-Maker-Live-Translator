import type { PixelCompositionRequest, PixelDrawing, Image, FailureTrace, PublicationPredicate, ProofQueries, } from './bitmap-pixel-types.js';
import type { PixelBudget } from './bitmap-pixel-budget.js';
import type { PixelSurfaces } from './bitmap-pixel-surfaces.js';
import type { PixelOrigins } from './bitmap-pixel-origins.js';
import type { PixelQueries } from './bitmap-pixel-queries.js';
import type { PixelCopied } from './bitmap-pixel-copied.js';
import type { PixelDisplay, PreparedPixelDisplay } from './bitmap-pixel-display.js';
import type { createPixelRows } from './bitmap-pixel-rows.js';
import { textOrigin } from '../stores/bitmap-content.js';
export function createPixelOccurrence(drawing: PixelDrawing, output: OffscreenCanvas, budget: PixelBudget, options: {
    readonly surfaces: PixelSurfaces;
    readonly origins: PixelOrigins;
    readonly queries: PixelQueries;
    readonly prepareCopied: PixelCopied;
    readonly prepareRows: ReturnType<typeof createPixelRows>;
    readonly isDisposed: () => boolean;
    readonly createCanvas: () => HTMLCanvasElement;
    readonly proofDiagnostics?: boolean | undefined;
    readonly display: PixelDisplay;
}) {
    const { gl, release, flag, target } = drawing;
    const { surfaces, origins, prepareRows, prepareCopied, isDisposed, display } = options;
    const { pack, resizeWork, exportImages, releaseDisplay } = surfaces;
    const { queryPredicate, releaseQueries } = options.queries;
    const { check: checkBudget, add: memory } = budget;
    const setTransfer = (value: number) => {
        budget.set('transferBytes', value);
    };
    function composeOccurrence(request: PixelCompositionRequest) {
        const members = 'members' in request ? request.members : [request];
        if (isDisposed() || members.length === 0)
            return null;
        const packed = pack(members.map((member) => ('content' in member ? member.bounds : member.source)));
        if (packed === null)
            return null;
        const { regions, width, height } = packed;
        const surfaceBytes = width * height * 4;
        checkBudget(surfaceBytes * 3 - budget.get('canvasBytes'));
        const temporary: Image[] = [];
        const own = (image: Image) => {
            temporary.push(image);
            return image;
        };
        const scratch: HTMLCanvasElement[] = [], scratchExports: HTMLCanvasElement[] = [];
        let scratchBytes = 0;
        function scratchCanvas(width: number, height: number): HTMLCanvasElement {
            checkBudget(width * height * 4);
            scratchBytes += width * height * 4;
            memory('replayBytes', width * height * 4);
            const canvas = options.createCanvas();
            scratch.push(canvas);
            canvas.width = width;
            canvas.height = height;
            return canvas;
        }
        let surface: HTMLCanvasElement | null = null, completed = false;
        const queries: ProofQueries[] = [];
        try {
            const valid = own(flag(1));
            const multipleGroups = !('members' in request) && request.groups.length > 1;
            const trace: FailureTrace | null = !multipleGroups && options.proofDiagnostics ? { image: own(flag(0)), checks: [] } : null;
            const predicates: PublicationPredicate[] = [];
            const independent = multipleGroups
                ? prepareRows(request.source, request.groups, request.preserve, own)
                : null;
            if (multipleGroups && independent === null)
                return null;
            if (independent === null)
                predicates.push({ valid, trace, groupIndex: 'members' in request ? null : 0 });
            else
                predicates.push(...independent.predicates);
            const roots = [
                ...new Set(members.flatMap((member) => ('content' in member ? [textOrigin(member.content)] : []))),
            ];
            const rootPixels = roots.map((root) => {
                return origins.pixels(root.snapshot);
            });
            if (rootPixels.some((root) => root === undefined))
                return null;
            const exported = roots.length === 0
                ? null
                : exportImages(rootPixels.flatMap((root) => (root ? [root.original, root.candidate] : [])));
            if (exported !== null)
                scratchExports.push(exported.surface);
            else if (roots.length > 0)
                return null;
            const prepared: (PreparedPixelDisplay | null)[] = independent !== null
                ? [
                    {
                        original: independent.candidate,
                        candidate: independent.candidate,
                        overlay: independent.overlay,
                        bounds: { x: 0, y: 0, width, height },
                    },
                ]
                : members.map((member, memberIndex) => {
                    if (!('content' in member)) {
                        const result = prepareRows(member.source, member.groups, member.preserve, own, {
                            valid,
                            trace,
                            memberIndex,
                        });
                        return result === null
                            ? null
                            : {
                                ...result,
                                bounds: {
                                    x: 0,
                                    y: 0,
                                    width: member.source.width,
                                    height: member.source.height,
                                },
                            };
                    }
                    const root = textOrigin(member.content), index = roots.indexOf(root);
                    const pixels = rootPixels[index];
                    if (pixels === undefined || exported === null)
                        return null;
                    const nativeRegion = exported.regions[index * 2], backgroundRegion = exported.regions[index * 2 + 1];
                    if (nativeRegion === undefined || backgroundRegion === undefined)
                        return null;
                    return prepareCopied(member, memberIndex, { pixels, surface: exported.surface, nativeRegion, backgroundRegion }, { valid, trace, own, scratchCanvas });
                });
            if (prepared.some((member) => member === null))
                return null;
            resizeWork(output, width, height);
            target(null);
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);
            for (const [index, member] of prepared.entries()) {
                const region = regions[index];
                if (member === null || region === undefined)
                    throw new Error('Missing occurrence member.');
                display(member, region, height, valid);
            }
            for (const predicate of predicates)
                queries.push(queryPredicate(predicate));
            const proof = Object.freeze({ kind: 'pixel-proof' } as const);
            surface = surfaces.retainOutput(width, height, proof);
            completed = true;
            return {
                surface,
                regions,
                proof,
                queries,
            };
        }
        finally {
            if (!completed && surface !== null) {
                surface.width = 1;
                surface.height = 1;
            }
            if (!completed)
                releaseQueries(queries);
            for (const image of temporary)
                release(image);
            for (const canvas of scratch) {
                canvas.width = 1;
                canvas.height = 1;
            }
            memory('replayBytes', -scratchBytes);
            for (const canvas of scratchExports)
                releaseDisplay(canvas, true);
            setTransfer(0);
            surfaces.accountWork();
        }
    }
    return composeOccurrence;
}
