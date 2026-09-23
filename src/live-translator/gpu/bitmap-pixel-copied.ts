import type { PixelDrawing, PixelCompositionMember, PixelBounds, Image, FailureTrace } from './bitmap-pixel-types.js';
import type { OriginPixels } from './bitmap-pixel-origins.js';
import type { PixelProofOperations } from './bitmap-pixel-proofs.js';
import { replayBitmapContent, textOrigin } from '../stores/bitmap-content.js';
import { drawText } from './bitmap-pixel-raster.js';
import { timed, type RuntimeTiming } from '../runtime/diagnostic-timing.js';
export function createPixelCopied(drawing: PixelDrawing, proof: PixelProofOperations, options: {
    readonly timing?: RuntimeTiming | undefined;
    readonly reduction: WebGLProgram;
    readonly sourceId: (source: HTMLCanvasElement) => object;
}) {
    const { gl, allocate, upload, target, texture, uniform } = drawing;
    const { intersectFlag, validateEffect } = proof;
    const { reduction, sourceId } = options;
    const replayContent = timed(options.timing, 'copy-replay', replayBitmapContent, ([content]) => [
        1,
        content.width * content.height,
    ]);
    return function prepareCopied(member: Extract<PixelCompositionMember, {
        content: unknown;
    }>, memberIndex: number, origin: {
        readonly pixels: OriginPixels;
        readonly surface: HTMLCanvasElement;
        readonly nativeRegion: PixelBounds;
        readonly backgroundRegion: PixelBounds;
    }, attempt: {
        readonly valid: Image;
        readonly trace: FailureTrace | null;
        readonly own: (image: Image) => Image;
        readonly scratchCanvas: (width: number, height: number) => HTMLCanvasElement;
    }) {
        const { pixels, nativeRegion, backgroundRegion } = origin;
        const { valid, trace, own, scratchCanvas } = attempt;
        const root = textOrigin(member.content);
        if (trace !== null && pixels.trace !== undefined) {
            const offset = trace.checks.length;
            for (const check of pixels.trace.checks)
                trace.checks.push({
                    ...check,
                    memberIndex,
                    groupIndex: null,
                    stage: 'copied-origin',
                });
            target(trace.image);
            gl.useProgram(reduction);
            texture(reduction, 'inputImage', pixels.trace.image, 0);
            texture(reduction, 'priorValid', valid, 1);
            gl.uniform1i(uniform(reduction, 'finalPass'), 3);
            gl.uniform1i(uniform(reduction, 'diagnosticIndex'), offset);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
        }
        intersectFlag(pixels.valid, valid);
        const nativeRoot = scratchCanvas(root.width, root.height);
        const nativeContext = nativeRoot.getContext('2d');
        if (nativeContext === null)
            throw new Error('Copied text raster is unavailable.');
        nativeContext.drawImage(origin.surface, nativeRegion.x, nativeRegion.y, nativeRegion.width, nativeRegion.height, 0, 0, root.width, root.height);
        let translatedRoot = nativeRoot;
        if ('draws' in member) {
            const sx = root.width / member.content.width, sy = root.height / member.content.height;
            const rootBounds = {
                x: member.bounds.x * sx,
                y: member.bounds.y * sy,
                width: member.bounds.width * sx,
                height: member.bounds.height * sy,
            };
            translatedRoot = scratchCanvas(Math.ceil(rootBounds.width), Math.ceil(rootBounds.height));
            const context = translatedRoot.getContext('2d');
            if (context === null)
                throw new Error('Copied text raster is unavailable.');
            context.drawImage(origin.surface, backgroundRegion.x, backgroundRegion.y, backgroundRegion.width, backgroundRegion.height, -rootBounds.x, -rootBounds.y, root.width, root.height);
            for (const draw of member.draws)
                drawText(context, draw.text, draw.layout, -rootBounds.x, -rootBounds.y);
        }
        else if (member.bounds.x !== 0 ||
            member.bounds.y !== 0 ||
            member.bounds.width !== member.content.width ||
            member.bounds.height !== member.content.height)
            return null;
        const backgroundRoot = scratchCanvas(root.width, root.height);
        const backgroundContext = backgroundRoot.getContext('2d');
        if (backgroundContext === null)
            throw new Error('Copied background raster is unavailable.');
        backgroundContext.drawImage(origin.surface, backgroundRegion.x, backgroundRegion.y, backgroundRegion.width, backgroundRegion.height, 0, 0, root.width, root.height);
        const background = replayContent(member.content, backgroundRoot, scratchCanvas);
        const expected = replayContent(member.content, nativeRoot, scratchCanvas);
        const translated = 'preserveOriginal' in member ? expected : replayContent(member.content, translatedRoot, scratchCanvas);
        if (expected.width !== member.source.width || expected.height !== member.source.height)
            return null;
        const original = own(allocate(member.source.width, member.source.height));
        upload(original, member.source);
        const expectedImage = own(allocate(expected.width, expected.height));
        upload(expectedImage, expected);
        const backgroundImage = own(allocate(background.width, background.height));
        upload(backgroundImage, background);
        validateEffect({
            sequence: 0,
            source: sourceId(member.source),
            width: expected.width,
            height: expected.height,
            damage: { x: 0, y: 0, width: expected.width, height: expected.height },
            evidence: { x: 0, y: 0, width: expected.width, height: expected.height },
            before: backgroundImage,
            after: expectedImage,
        }, original, valid, root.source.text.trim().length === 0 ? 1 : 2, trace === null
            ? undefined
            : {
                trace,
                memberIndex,
                groupIndex: null,
                effectSequence: null,
                stage: 'copied-replay',
            });
        const candidate = own(allocate(member.bounds.width, member.bounds.height));
        upload(candidate, translated);
        return { original, candidate, bounds: member.bounds, overlay: null };
    };
}
export type PixelCopied = ReturnType<typeof createPixelCopied>;
