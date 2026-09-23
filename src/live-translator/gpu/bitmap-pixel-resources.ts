import { timed, type RuntimeTiming } from '../runtime/diagnostic-timing.js';
import type { RuntimeResourceObserver } from '../runtime/diagnostics-ingress.js';
import type { PixelBudget } from './bitmap-pixel-budget.js';
import type { Image, ImageOwner, PixelDrawing } from './bitmap-pixel-types.js';
export function createPixelResources(gl: WebGL2RenderingContext, output: OffscreenCanvas, budget: PixelBudget, options: {
    readonly timing?: RuntimeTiming | undefined;
    readonly resourceEvent?: RuntimeResourceObserver | undefined;
    readonly isDisposed: () => boolean;
    readonly capacityChanged: () => void;
}) {
    function resource<T>(value: T | null): T {
        if (value === null)
            throw new Error('WebGL2 allocation failed.');
        return value;
    }
    const framebuffer = resource(gl.createFramebuffer());
    let vao: WebGLVertexArrayObject;
    try {
        vao = resource(gl.createVertexArray());
    }
    catch (error) {
        gl.deleteFramebuffer(framebuffer);
        throw error;
    }
    const images = new Set<Image>();
    let disposed = false;
    const programs: WebGLProgram[] = [];
    const uniformLocations = new Map<WebGLProgram, Map<string, WebGLUniformLocation | null>>();
    function uniform(p: WebGLProgram, name: string): WebGLUniformLocation | null {
        return uniformLocations
            .getOrInsertComputed(p, () => new Map())
            .getOrInsertComputed(name, () => gl.getUniformLocation(p, name));
    }
    function program(v: string, f: string): WebGLProgram {
        const p = resource(gl.createProgram());
        programs.push(p);
        for (const [type, source] of [
            [gl.VERTEX_SHADER, v],
            [gl.FRAGMENT_SHADER, f],
        ] as const) {
            const shader = resource(gl.createShader(type));
            try {
                gl.shaderSource(shader, source);
                gl.compileShader(shader);
                if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
                    throw new Error(gl.getShaderInfoLog(shader) ?? 'GPU shader compilation failed.');
                gl.attachShader(p, shader);
            }
            finally {
                gl.deleteShader(shader);
            }
        }
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS))
            throw new Error(gl.getProgramInfoLog(p) ?? 'GPU program linking failed.');
        return p;
    }
    try {
        gl.bindVertexArray(vao);
        gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.STENCIL_TEST);
        gl.disable(gl.SCISSOR_TEST);
        gl.disable(gl.DITHER);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    }
    catch (error) {
        dispose();
        throw error;
    }
    function checkGpuError(): void {
        const error = gl.getError();
        if (error !== gl.NO_ERROR)
            throw new Error(`Bitmap GPU error ${String(error)}.`);
    }
    const check = timed(options.timing, 'gpu-validation-wait', checkGpuError);
    function allocate(width: number, height: number, owner: ImageOwner = 'temporary'): Image {
        if (disposed || options.isDisposed() || ![width, height].every((n) => Number.isSafeInteger(n) && n > 0))
            throw new Error('GPU image dimensions are unavailable.');
        options.resourceEvent?.({
            kind: 'usage',
            name: 'textureSize',
            value: Math.max(width, height),
            limit: budget.maxTextureSize,
        });
        if (width > budget.maxTextureSize || height > budget.maxTextureSize)
            budget.refuse(0, Math.max(width, height));
        const size = width * height * 4;
        budget.check(size);
        const texture = resource(gl.createTexture());
        const image: Image = { texture, width, height, bytes: size, owner };
        images.add(image);
        budget.add(`${owner}Bytes`, size);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, width, height);
        return image;
    }
    function release(image: Image): void {
        if (!images.delete(image))
            return;
        if (image.owner !== 'temporary')
            options.capacityChanged();
        gl.deleteTexture(image.texture);
        budget.add(`${image.owner}Bytes`, -image.bytes);
    }
    function assign(image: Image, owner: ImageOwner): boolean {
        if (!images.has(image) || disposed || options.isDisposed())
            return false;
        const previous = image.owner;
        image.owner = owner;
        budget.move(`${previous}Bytes`, `${owner}Bytes`, image.bytes);
        return images.has(image) && !options.isDisposed();
    }
    function target(image: Image | null, width = image?.width ?? output.width, height = image?.height ?? output.height): void {
        gl.bindFramebuffer(gl.FRAMEBUFFER, image === null ? null : framebuffer);
        if (image !== null)
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, image.texture, 0);
        gl.viewport(0, 0, width, height);
        gl.disable(gl.BLEND);
        gl.colorMask(true, true, true, true);
    }
    function texture(p: WebGLProgram, name: string, image: Image, unit: number): void {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, image.texture);
        gl.uniform1i(uniform(p, name), unit);
    }
    function uploadImage(image: Image, canvas: HTMLCanvasElement, x = 0, y = 0): void {
        gl.bindTexture(gl.TEXTURE_2D, image.texture);
        gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, x);
        gl.pixelStorei(gl.UNPACK_SKIP_ROWS, y);
        try {
            gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, image.width, image.height, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
        }
        finally {
            gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0);
            gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0);
        }
    }
    const upload = timed(options.timing, 'image-transfer', uploadImage, ([image]) => [1, image.width * image.height]);
    function copy(from: Image, to: Image, x = 0, y = 0): void {
        target(from);
        gl.bindTexture(gl.TEXTURE_2D, to.texture);
        gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, x, y, 0, 0, from.width, from.height);
    }
    function flag(value: number): Image {
        const image = allocate(1, 1);
        target(image);
        gl.clearColor(value, value, value, value);
        gl.clear(gl.COLOR_BUFFER_BIT);
        return image;
    }
    function dispose(): void {
        if (disposed)
            return;
        disposed = true;
        for (const image of images)
            release(image);
        for (const p of programs)
            gl.deleteProgram(p);
        programs.length = 0;
        uniformLocations.clear();
        gl.deleteFramebuffer(framebuffer);
        gl.deleteVertexArray(vao);
    }
    const drawing: PixelDrawing = { gl, allocate, release, target, texture, uniform, program, upload, copy, flag };
    return { drawing, assign, check, dispose };
}
export type PixelResources = ReturnType<typeof createPixelResources>;
