import { timed, type RuntimeTiming } from '../runtime/diagnostic-timing.js';
import type { RuntimeResourceObserver } from '../runtime/diagnostics-ingress.js';
import type { PixelBudget } from './bitmap-pixel-budget.js';
import type { Image, PixelBounds, PixelDrawing, PixelProof } from './bitmap-pixel-types.js';
export function createPixelSurfaces(drawing: PixelDrawing, output: OffscreenCanvas, budget: PixelBudget, options: {
    readonly createCanvas: () => HTMLCanvasElement;
    readonly isDisposed: () => boolean;
    readonly imageProgram: () => WebGLProgram;
    readonly releaseProof: (proof: PixelProof) => void;
    readonly capacityChanged: () => void;
    readonly timing?: RuntimeTiming | undefined;
    readonly probeEvent?: RuntimeResourceObserver | undefined;
}) {
    const { gl, target, texture, uniform } = drawing;
    const { isDisposed } = options;
    const { maxTextureSize, refuse, check: checkBudget, add: memory } = budget;
    const surfaces = new Map<HTMLCanvasElement, {
        bytes: number;
        proof: PixelProof | null;
        releasing: boolean;
    }>();
    const textCanvas = options.createCanvas();
    textCanvas.width = textCanvas.height = 1;
    const textContext = textCanvas.getContext('2d');
    if (textContext === null)
        throw new Error('Native text rasterization is unavailable.');
    budget.set('canvasBytes', 8);
    function setTransfer(value: number): void {
        budget.set('transferBytes', value);
    }
    function pack(sizes: readonly {
        width: number;
        height: number;
    }[]) {
        const regions: PixelBounds[] = [];
        let x = 0, y = 0, rowHeight = 0, width = 0;
        for (const size of sizes) {
            if (x + size.width > maxTextureSize) {
                x = 0;
                y += rowHeight;
                rowHeight = 0;
            }
            if (size.width <= 0 || size.height <= 0)
                return null;
            if (size.width > maxTextureSize)
                refuse(0, size.width);
            regions.push({ x, y, width: size.width, height: size.height });
            x += size.width;
            rowHeight = Math.max(rowHeight, size.height);
            width = Math.max(width, x);
        }
        const height = y + rowHeight;
        if (height > maxTextureSize)
            refuse(0, height);
        return { regions, width, height };
    }
    function resizeWork(canvas: HTMLCanvasElement | OffscreenCanvas, width: number, height: number): void {
        const previous = canvas.width * canvas.height * 4;
        checkBudget(width * height * 4 - previous);
        try {
            if (width < canvas.width)
                canvas.width = width;
            if (canvas.height !== height)
                canvas.height = height;
            if (canvas.width !== width)
                canvas.width = width;
        }
        finally {
            if (!isDisposed()) {
                const extra = canvas.width * canvas.height * 4 - previous;
                memory('canvasBytes', extra);
            }
        }
    }
    function transferOutputSurface(width: number, height: number): HTMLCanvasElement {
        const surfaceBytes = width * height * 4;
        checkBudget(surfaceBytes);
        setTransfer(surfaceBytes);
        let surface: HTMLCanvasElement | null = null;
        let completed = false;
        try {
            surface = options.createCanvas();
            surface.width = width;
            surface.height = height;
            const context = surface.getContext('2d');
            if (context === null)
                throw new Error('Canvas2D surface transfer is unavailable.');
            context.drawImage(output, 0, 0);
            completed = true;
            return surface;
        }
        finally {
            if (!completed) {
                if (surface !== null) {
                    surface.width = 1;
                    surface.height = 1;
                }
                setTransfer(0);
            }
        }
    }
    function retainOutput(width: number, height: number, proof: PixelProof | null): HTMLCanvasElement {
        const surface = transferOutputSurface(width, height);
        const bytes = width * height * 4;
        surfaces.set(surface, { bytes, proof, releasing: false });
        try {
            budget.move('transferBytes', proof === null ? 'exportBytes' : 'displayBytes', bytes);
            if (proof !== null)
                options.probeEvent?.({ kind: 'probe-count', name: 'displays.created', value: 1 });
            if (isDisposed())
                throw new Error('Bitmap pixel device ended during transfer.');
            return surface;
        }
        catch (error) {
            releaseDisplay(surface, true);
            throw error;
        }
    }
    function exportImageBatch(selected: readonly Image[]) {
        const imageProgram = options.imageProgram();
        const packed = pack(selected);
        if (packed === null)
            return null;
        const { width, height, regions } = packed;
        resizeWork(output, width, height);
        target(null);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        for (const [index, input] of selected.entries()) {
            const region = regions[index];
            if (region === undefined)
                throw new Error('Missing root image region.');
            const y = height - region.y - region.height;
            gl.viewport(region.x, y, region.width, region.height);
            gl.useProgram(imageProgram);
            texture(imageProgram, 'inputImage', input, 0);
            gl.uniform2i(uniform(imageProgram, 'drawOrigin'), region.x, y);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
        }
        let surface: HTMLCanvasElement | null = null;
        let completed = false;
        try {
            surface = retainOutput(width, height, null);
            completed = true;
            return { surface, regions };
        }
        finally {
            if (!completed && surface !== null) {
                surface.width = 1;
                surface.height = 1;
            }
            setTransfer(0);
        }
    }
    const exportImages = timed(options.timing, 'image-transfer', exportImageBatch, ([selected]) => [
        selected.length,
        selected.reduce((sum, image) => sum + image.width * image.height, 0),
    ]);
    function releaseDisplay(surface: HTMLCanvasElement, owned: boolean): PixelProof | null {
        const entry = surfaces.get(surface);
        if (entry === undefined || entry.releasing)
            return null;
        entry.releasing = true;
        try {
            if (owned) {
                surface.width = 1;
                surface.height = 1;
            }
        }
        catch (error) {
            entry.releasing = false;
            throw error;
        }
        surfaces.delete(surface);
        if (entry.proof !== null)
            options.releaseProof(entry.proof);
        memory(entry.proof === null ? 'exportBytes' : 'displayBytes', -entry.bytes);
        options.capacityChanged();
        if (entry.proof !== null)
            options.probeEvent?.({ kind: 'probe-count', name: 'displays.released', value: 1 });
        return entry.proof;
    }
    function accountWork(): void {
        if (!isDisposed())
            budget.set('canvasBytes', (output.width * output.height + textCanvas.width * textCanvas.height) * 4);
    }
    function trim(): void {
        output.width = output.height = textCanvas.width = textCanvas.height = 1;
        budget.set('canvasBytes', 8);
    }
    function disposeWork(): void {
        output.width = output.height = textCanvas.width = textCanvas.height = 1;
        budget.set('canvasBytes', 0);
        setTransfer(0);
    }
    return {
        textCanvas,
        textContext,
        resizeWork,
        pack,
        exportImages,
        retainOutput,
        releaseDisplay,
        accountWork,
        trim,
        disposeWork,
        count: () => surfaces.size,
    };
}
export type PixelSurfaces = ReturnType<typeof createPixelSurfaces>;
