import { vertex, displayFragment } from './bitmap-pixel-shaders.js';
import type { Image, PixelBounds, PixelDrawing } from './bitmap-pixel-types.js';
export interface PixelDisplayOverlay {
    readonly image: Image;
    readonly valid: Image;
}
export interface PreparedPixelDisplay {
    readonly original: Image;
    readonly candidate: Image;
    readonly bounds: PixelBounds;
    readonly overlay: PixelDisplayOverlay | null;
}
export function createPixelDisplay(drawing: PixelDrawing) {
    const { gl, program, texture, uniform } = drawing;
    let complete: WebGLProgram | undefined, overlaid: WebGLProgram | undefined;
    return (member: PreparedPixelDisplay, region: PixelBounds, outputHeight: number, valid: Image): void => {
        const display = member.overlay === null
            ? (complete ??= program(vertex, displayFragment(false)))
            : (overlaid ??= program(vertex, displayFragment(true)));
        const y = outputHeight - region.y - region.height;
        gl.viewport(region.x, y, region.width, region.height);
        gl.useProgram(display);
        texture(display, 'sourceImage', member.original, 0);
        texture(display, 'candidateImage', member.candidate, 1);
        texture(display, 'validFlag', valid, 3);
        if (member.overlay !== null) {
            texture(display, 'textImage', member.overlay.image, 2);
            texture(display, 'textValid', member.overlay.valid, 4);
        }
        gl.uniform2i(uniform(display, 'drawOrigin'), region.x, y);
        gl.uniform2i(uniform(display, 'sourceOffset'), member.bounds.x, member.bounds.y);
        gl.uniform1i(uniform(display, 'outputHeight'), region.height);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
}
export type PixelDisplay = ReturnType<typeof createPixelDisplay>;
