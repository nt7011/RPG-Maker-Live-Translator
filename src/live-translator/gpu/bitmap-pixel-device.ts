import { bitmapTextBaseline } from '../stores/bitmap-text-layout.js';
import type { TextPaint } from '../stores/styled-text.js';
import { timed, type RuntimeTiming } from '../runtime/diagnostic-timing.js';
import { BITMAP_LIMITS } from '../stores/bitmap-limits.js';
import type { RuntimeResourceObserver } from '../runtime/diagnostics-ingress.js';
import type { CanvasPixelDamage as ExactGpuMutationDamage } from '../observer-hooks/canvas/canvas-pixel-damage.js';
import type { BitmapTextDraw, BitmapTextLayout } from '../stores/bitmap-text-layout.js';
import { replayBitmapContent, textOrigin, type BitmapContent } from '../stores/bitmap-content.js';
export interface PixelCapture {
    readonly kind: 'pixel-capture';
}
export interface PixelEffect {
    readonly kind: 'pixel-effect';
}
export interface PixelSnapshot {
    readonly kind: 'pixel-snapshot';
}
export interface PixelProof {
    readonly kind: 'pixel-proof';
}
export interface PixelProofFailure {
    readonly memberIndex: number;
    readonly groupIndex: number | null;
    readonly effectSequence: number | null;
    readonly stage: 'source' | 'target' | 'copied-origin' | 'copied-replay';
    readonly reason: 'text-effect-empty' | 'text-effect-mismatch' | 'safe-area-occupied';
}
export interface PixelBounds {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
}
export interface PixelTextGroup {
    readonly effects: readonly PixelEffect[];
    readonly draws: readonly BitmapTextDraw[];
    readonly targetRegions?: readonly PixelBounds[];
}
export type PixelCompositionMember = {
    readonly source: HTMLCanvasElement;
} & ({
    readonly groups: readonly PixelTextGroup[];
} | {
    readonly content: BitmapContent;
    readonly draws: readonly BitmapTextDraw[];
    readonly bounds: PixelBounds;
});
export type PixelCompositionRequest = {
    readonly members: readonly PixelCompositionMember[];
} | {
    readonly source: HTMLCanvasElement;
    readonly groups: readonly PixelTextGroup[];
};
export interface PixelGroupProof {
    readonly groupIndex: number;
    readonly visible: boolean;
    readonly failure?: PixelProofFailure | null;
}
class PixelCapacityRefusal extends Error {
}
type ImageOwner = 'capture' | 'effect' | 'origin' | 'temporary';
interface Image {
    owner: ImageOwner;
    texture: WebGLTexture;
    width: number;
    height: number;
    bytes: number;
}
interface Capture {
    source: WeakRef<HTMLCanvasElement>;
    width: number;
    height: number;
    bounds: PixelBounds | null;
    before: Image | null;
    blank: boolean;
}
interface Effect {
    sequence: number;
    source: object;
    width: number;
    height: number;
    bounds: PixelBounds;
    before: Image;
    after: Image;
}
interface FailureTrace {
    readonly image: Image;
    readonly checks: PixelProofFailure[];
}
interface TraceCheck extends Omit<PixelProofFailure, 'reason'> {
    readonly trace: FailureTrace;
}
interface FailureQueries {
    readonly bits: readonly WebGLQuery[];
    readonly checks: readonly PixelProofFailure[];
}
interface ProofQueries {
    readonly query: WebGLQuery;
    readonly diagnostic: FailureQueries | null;
    readonly groupIndex: number | null;
}
interface PublicationPredicate {
    readonly valid: Image;
    readonly trace: FailureTrace | null;
    readonly groupIndex: number | null;
}
const failureCode = `
int failureCode(vec4 value){ivec3 b=ivec3(round(value.rgb*255.0));return b.r|(b.g<<8)|(b.b<<16);}
vec4 failureColor(int code){return vec4(code&255,(code>>8)&255,(code>>16)&255,255)/255.0;}`;
const vertex = `#version 300 es
precision highp float;
void main(){ vec2 p=gl_VertexID==0?vec2(-1,-1):gl_VertexID==1?vec2(3,-1):vec2(-1,3); gl_Position=vec4(p,0,1); }`;
const canvasPixelEquality = `
ivec4 canvasBytes(vec4 value){return ivec4(round(vec4(value.rgb*value.a,value.a)*255.0));}
bool sameCanvasPixel(vec4 a,vec4 b){return all(equal(canvasBytes(a),canvasBytes(b)));}`;
const compareFragment = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D beforeImage;
uniform sampler2D afterImage;
uniform sampler2D candidateImage;
uniform ivec2 origin;
uniform int compareAll;
out vec4 color;
${canvasPixelEquality}
void main(){
 ivec2 base=ivec2(gl_FragCoord.xy)*8,extent=textureSize(beforeImage,0);
 bool changedAny=false,valid=true;
 for(int y=0;y<8;y++)for(int x=0;x<8;x++){
  ivec2 p=base+ivec2(x,y);if(any(greaterThanEqual(p,extent)))continue;
  vec4 b=texelFetch(beforeImage,p,0),a=texelFetch(afterImage,p,0);
  bool changed=compareAll==1||!sameCanvasPixel(b,a);
  changedAny=changedAny||changed;
  valid=valid&&((compareAll==0&&!changed)||sameCanvasPixel(texelFetch(candidateImage,p+origin,0),a));
 }
 color=vec4(changedAny?1.0:0.0,valid?1.0:0.0,0.0,1.0);
}`;
const reduceFragment = (diagnostics: boolean) => `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D inputImage;
uniform int finalPass;
out vec4 color;
${diagnostics ? `uniform sampler2D priorValid; uniform int diagnosticIndex; ${failureCode}` : ''}
void main(){
 ${diagnostics
    ? `if(finalPass>=2&&texelFetch(priorValid,ivec2(0),0).r<0.5)discard;
 if(finalPass==3){
  int code=failureCode(texelFetch(inputImage,ivec2(0),0));
  if(code==0)discard;
  color=failureColor(diagnosticIndex+code);return;
 }`
    : ''}
 ivec2 base=ivec2(gl_FragCoord.xy)*8,extent=textureSize(inputImage,0);
 vec2 result=vec2(0,1);
 for(int y=0;y<8;y++)for(int x=0;x<8;x++){
  ivec2 p=base+ivec2(x,y);if(any(greaterThanEqual(p,extent)))continue;
  vec2 value=texelFetch(inputImage,p,0).rg;
  result=vec2(max(result.r,value.r),min(result.g,value.g));
 }
 ${diagnostics
    ? `if(finalPass==2){
  if(result.r>0.5&&result.g>0.5)discard;
  color=failureColor(diagnosticIndex+(result.r>0.5?1:0));return;
 }`
    : ''}
 color=finalPass==1?vec4(result.r>0.5&&result.g>0.5?1.0:0.0):vec4(result,0,1);
}`;
const vacantFragment = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D candidateImage;
uniform ivec2 origin;
uniform ivec2 extent;
out vec4 color;
void main(){
 ivec2 base=ivec2(gl_FragCoord.xy)*8;
 bool valid=true;
 for(int y=0;y<8;y++)for(int x=0;x<8;x++){
  ivec2 p=base+ivec2(x,y);if(any(greaterThanEqual(p,extent)))continue;
  valid=valid&&texelFetch(candidateImage,p+origin,0).a==0.0;
 }
 color=vec4(1.0,valid?1.0:0.0,0.0,1.0);
}`;
const reverseFragment = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D beforeImage;
uniform sampler2D afterImage;
uniform sampler2D candidateImage;
uniform ivec2 origin;
out vec4 color;
${canvasPixelEquality}
void main(){ivec2 p=ivec2(gl_FragCoord.xy);vec4 b=texelFetch(beforeImage,p,0),a=texelFetch(afterImage,p,0);color=!sameCanvasPixel(a,b)?b:texelFetch(candidateImage,p+origin,0);}`;
const displayFragment = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D sourceImage;
uniform sampler2D candidateImage;
uniform sampler2D textImage;
uniform sampler2D validFlag;
uniform ivec2 drawOrigin;
uniform ivec2 textOrigin;
uniform ivec2 sourceOffset;
uniform int outputHeight;
uniform int replacement;
out vec4 color;
void main(){
 ivec2 p=ivec2(gl_FragCoord.xy)-drawOrigin;p.y=outputHeight-1-p.y;
 ivec2 q=p+sourceOffset;
 bool inside=all(greaterThanEqual(q,ivec2(0)))&&all(lessThan(q,textureSize(sourceImage,0)));
 vec4 source=inside?texelFetch(sourceImage,q,0):vec4(0);
 if(texelFetch(validFlag,ivec2(0),0).r<0.5){color=source;return;}
 if(replacement==1){color=texelFetch(candidateImage,p,0);return;}
 vec4 b=inside?texelFetch(candidateImage,q,0):vec4(0),t=texelFetch(textImage,p+textOrigin,0);
 float alpha=t.a+b.a*(1.0-t.a);
 color=vec4(alpha>0.0?(t.rgb*t.a+b.rgb*b.a*(1.0-t.a))/alpha:vec3(0),alpha);
}`;
const imageFragment = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D inputImage;
uniform ivec2 drawOrigin;
out vec4 color;
void main(){ivec2 p=ivec2(gl_FragCoord.xy)-drawOrigin;p.y=textureSize(inputImage,0).y-1-p.y;color=texelFetch(inputImage,p,0);}`;
const commitFragment = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D candidateImage;
uniform sampler2D validFlag;
out vec4 color;
void main(){if(texelFetch(validFlag,ivec2(0),0).r<0.5)discard;color=texelFetch(candidateImage,ivec2(gl_FragCoord.xy),0);}`;
const overlayFragment = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D candidateImage;
uniform sampler2D textImage;
uniform sampler2D validFlag;
out vec4 color;
void main(){
 ivec2 p=ivec2(gl_FragCoord.xy);vec4 b=texelFetch(candidateImage,p,0);
 if(texelFetch(validFlag,ivec2(0),0).r<0.5){color=b;return;}
 vec4 t=texelFetch(textImage,p,0);float alpha=t.a+b.a*(1.0-t.a);
 color=vec4(alpha>0.0?(t.rgb*t.a+b.rgb*b.a*(1.0-t.a))/alpha:vec3(0),alpha);
}`;
const proofFragment = (diagnostics: boolean) => `#version 300 es
precision highp float;
uniform sampler2D validFlag;
out vec4 color;
${diagnostics
    ? `precision highp int; uniform int diagnosticBit; ${failureCode}
void main(){
 vec4 value=texelFetch(validFlag,ivec2(0),0);
 if(diagnosticBit<0?value.r<0.5:(failureCode(value)&(1<<diagnosticBit))==0)discard;
 color=vec4(0);
}`
    : 'void main(){if(texelFetch(validFlag,ivec2(0),0).r<0.5)discard;color=vec4(0);}'} `;
export function createBitmapPixelDevice(options: {
    readonly timing?: RuntimeTiming | undefined;
    readonly createCanvas: () => HTMLCanvasElement;
    readonly createOffscreenCanvas: () => OffscreenCanvas;
    readonly reportFailure: (error: unknown) => void;
    readonly resourceEvent?: RuntimeResourceObserver | undefined;
    readonly probeEvent?: RuntimeResourceObserver | undefined;
    readonly proofDiagnostics?: boolean;
}) {
    const replayContent = timed(options.timing, 'copy-replay', replayBitmapContent, ([content]) => [
        1,
        content.width * content.height,
    ]);
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
    const sourceIds = new WeakMap<HTMLCanvasElement, object>();
    function sourceId(source: HTMLCanvasElement): object {
        let id = sourceIds.get(source);
        if (id === undefined)
            sourceIds.set(source, (id = {}));
        return id;
    }
    const captures = new Map<PixelCapture, Capture>(), effects = new Map<PixelEffect, Effect>();
    const snapshots = new Map<PixelSnapshot, {
        source: WeakRef<HTMLCanvasElement>;
        groups: readonly PixelTextGroup[];
    } | {
        pixels: {
            original: Image;
            candidate: Image;
            valid: Image;
            trace?: FailureTrace;
        };
    }>();
    const images = new Set<Image>();
    const proofs = new Map<PixelProof, readonly ProofQueries[]>();
    const surfaces = new Map<HTMLCanvasElement, {
        bytes: number;
        proof: PixelProof | null;
    }>();
    let exportBytes = 0, replayBytes = 0;
    let needsReclamation = false;
    let displayBytes = 0, composing = false;
    let nextSequence = 0;
    let bytes = 0, disposed = false;
    let canvasBytes = 8, transferBytes = 0;
    let listenerAttached = false;
    const limitBytes = BITMAP_LIMITS.pixelBytes;
    const maxTextureSize = Number(gl.getParameter(gl.MAX_TEXTURE_SIZE));
    let textCanvas: HTMLCanvasElement;
    let textContext: CanvasRenderingContext2D;
    try {
        textCanvas = options.createCanvas();
        textCanvas.width = 1;
        textCanvas.height = 1;
        const rasterContext = textCanvas.getContext('2d');
        if (rasterContext === null)
            throw new Error('Native text rasterization is unavailable.');
        textContext = rasterContext;
    }
    catch (error) {
        gl.deleteFramebuffer(framebuffer);
        gl.deleteVertexArray(vao);
        throw error;
    }
    memory('canvasBytes', canvasBytes);
    options.resourceEvent?.({ kind: 'usage', name: 'textureSize', value: 0, limit: maxTextureSize });
    const programs: WebGLProgram[] = [];
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
    let compare: WebGLProgram, vacant: WebGLProgram, reduction: WebGLProgram, reverse: WebGLProgram, display: WebGLProgram, proofProgram: WebGLProgram, imageProgram: WebGLProgram;
    let commit: WebGLProgram | undefined, overlay: WebGLProgram | undefined;
    try {
        gl.bindVertexArray(vao);
        gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.STENCIL_TEST);
        gl.disable(gl.SCISSOR_TEST);
        gl.disable(gl.DITHER);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
        compare = program(vertex, compareFragment);
        vacant = program(vertex, vacantFragment);
        reduction = program(vertex, reduceFragment(options.proofDiagnostics === true));
        reverse = program(vertex, reverseFragment);
        display = program(vertex, displayFragment);
        proofProgram = program(vertex, proofFragment(options.proofDiagnostics === true));
        imageProgram = program(vertex, imageFragment);
    }
    catch (error) {
        dispose();
        throw error;
    }
    function allocatedBytes(): number {
        return bytes + canvasBytes + transferBytes + displayBytes + exportBytes + replayBytes;
    }
    function memory(category: string, delta: number): void {
        if (delta !== 0)
            options.resourceEvent?.({ kind: 'memory', category, delta });
    }
    function setTransfer(value: number): void {
        const delta = value - transferBytes;
        transferBytes = value;
        memory('transferBytes', delta);
    }
    function refuse(extra: number, dimensions = 0): never {
        const name = dimensions > 0 ? 'textureSize' : 'pixelBytes';
        options.resourceEvent?.({
            kind: 'usage',
            name,
            value: dimensions || allocatedBytes(),
            limit: dimensions > 0 ? maxTextureSize : limitBytes,
        });
        options.resourceEvent?.({ kind: 'refused', name, requested: dimensions || extra });
        needsReclamation = true;
        throw new PixelCapacityRefusal('Bitmap GPU capacity is unavailable.');
    }
    function checkBudget(extra: number): void {
        if (extra > limitBytes - allocatedBytes())
            refuse(extra);
    }
    function checkGpuError(): void {
        const error = gl.getError();
        if (error !== gl.NO_ERROR)
            throw new Error(`Bitmap GPU error ${String(error)}.`);
    }
    const check = timed(options.timing, 'gpu-validation-wait', checkGpuError);
    function allocate(width: number, height: number, owner: ImageOwner = 'temporary'): Image {
        if (disposed || ![width, height].every((n) => Number.isSafeInteger(n) && n > 0))
            throw new Error('GPU image dimensions are unavailable.');
        options.resourceEvent?.({
            kind: 'usage',
            name: 'textureSize',
            value: Math.max(width, height),
            limit: maxTextureSize,
        });
        if (width > maxTextureSize || height > maxTextureSize)
            refuse(0, Math.max(width, height));
        const size = width * height * 4;
        checkBudget(size);
        const texture = resource(gl.createTexture());
        const image: Image = { texture, width, height, bytes: size, owner };
        images.add(image);
        bytes += size;
        memory(`${owner}Bytes`, size);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        return image;
    }
    function release(image: Image): void {
        if (!images.delete(image))
            return;
        gl.deleteTexture(image.texture);
        bytes -= image.bytes;
        memory(`${image.owner}Bytes`, -image.bytes);
    }
    function assign(image: Image, owner: ImageOwner): void {
        memory(`${image.owner}Bytes`, -image.bytes);
        image.owner = owner;
        memory(`${owner}Bytes`, image.bytes);
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
        gl.uniform1i(gl.getUniformLocation(p, name), unit);
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
    function traceReduction(input: Image, priorValid: Image, { trace, ...check }: TraceCheck, emptyReason: PixelProofFailure['reason'], mismatchReason: PixelProofFailure['reason']): void {
        const index = trace.checks.length + 1;
        trace.checks.push({ ...check, reason: emptyReason }, { ...check, reason: mismatchReason });
        target(trace.image);
        gl.useProgram(reduction);
        texture(reduction, 'inputImage', input, 0);
        texture(reduction, 'priorValid', priorValid, 1);
        gl.uniform1i(gl.getUniformLocation(reduction, 'finalPass'), 2);
        gl.uniform1i(gl.getUniformLocation(reduction, 'diagnosticIndex'), index);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    function validateTiles(width: number, height: number, outputFlag: Image, render: () => void, diagnostic?: TraceCheck, emptyReason: PixelProofFailure['reason'] = 'text-effect-empty', mismatchReason: PixelProofFailure['reason'] = 'text-effect-mismatch'): void {
        let current = allocate(Math.ceil(width / 8), Math.ceil(height / 8));
        try {
            target(current);
            render();
            while (current.width > 8 || current.height > 8) {
                const next = allocate(Math.max(1, Math.ceil(current.width / 8)), Math.max(1, Math.ceil(current.height / 8)));
                try {
                    target(next);
                    gl.useProgram(reduction);
                    texture(reduction, 'inputImage', current, 0);
                    if (options.proofDiagnostics)
                        texture(reduction, 'priorValid', current, 1);
                    gl.uniform1i(gl.getUniformLocation(reduction, 'finalPass'), 0);
                    gl.drawArrays(gl.TRIANGLES, 0, 3);
                }
                catch (error) {
                    release(next);
                    throw error;
                }
                release(current);
                current = next;
            }
            if (diagnostic !== undefined)
                traceReduction(current, outputFlag, diagnostic, emptyReason, mismatchReason);
            target(outputFlag);
            gl.useProgram(reduction);
            texture(reduction, 'inputImage', current, 0);
            if (options.proofDiagnostics)
                texture(reduction, 'priorValid', current, 1);
            gl.uniform1i(gl.getUniformLocation(reduction, 'finalPass'), 1);
            gl.enable(gl.BLEND);
            gl.blendEquation(gl.MIN);
            gl.blendFunc(gl.ONE, gl.ONE);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
            gl.disable(gl.BLEND);
        }
        finally {
            release(current);
        }
    }
    function validateEffect(effect: Effect, candidate: Image, outputFlag: Image, comparison: 0 | 1 | 2 = 0, diagnostic?: TraceCheck): void {
        validateTiles(effect.bounds.width, effect.bounds.height, outputFlag, () => {
            gl.useProgram(compare);
            texture(compare, 'beforeImage', effect.before, 0);
            texture(compare, 'afterImage', effect.after, 1);
            texture(compare, 'candidateImage', candidate, 2);
            gl.uniform1i(gl.getUniformLocation(compare, 'compareAll'), comparison);
            gl.uniform2i(gl.getUniformLocation(compare, 'origin'), effect.bounds.x, effect.bounds.y);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
        }, diagnostic);
    }
    function validateVacantArea(candidate: Image, area: PixelBounds, outputFlag: Image, diagnostic?: TraceCheck): boolean {
        if (![area.x, area.y, area.width, area.height].every(Number.isFinite) || area.width <= 0 || area.height <= 0)
            return false;
        const x = Math.floor(area.x), y = Math.floor(area.y);
        const width = Math.ceil(area.x + area.width) - x, height = Math.ceil(area.y + area.height) - y;
        if (x < 0 || y < 0 || x + width > candidate.width || y + height > candidate.height)
            return false;
        validateTiles(width, height, outputFlag, () => {
            gl.useProgram(vacant);
            texture(vacant, 'candidateImage', candidate, 0);
            gl.uniform2i(gl.getUniformLocation(vacant, 'origin'), x, y);
            gl.uniform2i(gl.getUniformLocation(vacant, 'extent'), width, height);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
        }, diagnostic, 'safe-area-occupied', 'safe-area-occupied');
        return true;
    }
    function validateTargetRegions(candidate: Image, group: PixelTextGroup, valid: Image, trace: FailureTrace | null, memberIndex: number, groupIndex: number, stage: PixelProofFailure['stage'] = 'source'): boolean {
        return (group.targetRegions ?? []).every((area) => validateVacantArea(candidate, area, valid, trace === null ? undefined : { trace, memberIndex, groupIndex, effectSequence: null, stage }));
    }
    function validateTargetConflicts(source: HTMLCanvasElement, rows: readonly {
        group: PixelTextGroup;
        groupIndex: number;
        valid: Image;
        trace: FailureTrace | null;
    }[], memberIndex: number): boolean {
        if (rows.length < 2 || !rows.some(({ group }) => (group.targetRegions?.length ?? 0) > 0))
            return true;
        const raster = allocate(source.width, source.height);
        try {
            resizeWork(textCanvas, source.width, source.height);
            for (const row of rows) {
                const protectedRows = rows.filter((other) => other !== row && (other.group.targetRegions?.length ?? 0) > 0);
                if (row.group.draws.length === 0 || protectedRows.length === 0)
                    continue;
                textContext.clearRect(0, 0, source.width, source.height);
                drawTextGroup(textContext, row.group);
                upload(raster, textCanvas);
                for (const other of protectedRows)
                    if (!validateTargetRegions(raster, other.group, other.valid, other.trace, memberIndex, other.groupIndex, 'target'))
                        return false;
            }
            return true;
        }
        finally {
            release(raster);
        }
    }
    function begin(source: HTMLCanvasElement): PixelCapture {
        if (disposed)
            throw new Error('Bitmap pixel device is disposed.');
        const handle = Object.freeze({ kind: 'pixel-capture' } as const);
        const capture: Capture = {
            source: new WeakRef(source),
            width: source.width,
            height: source.height,
            bounds: null,
            before: null,
            blank: false,
        };
        captures.set(handle, capture);
        return handle;
    }
    function prepareWrite(handle: PixelCapture, damage: ExactGpuMutationDamage, sourceIsBlank = false): boolean {
        const capture = captures.get(handle);
        if (capture === undefined)
            throw new Error('Unknown GPU capture.');
        const source = capture.source.deref();
        if (capture.width !== source?.width || capture.height !== source.height)
            throw new Error('Source resized during text command.');
        const x = damage.kind === 'full' ? 0 : Math.max(0, Math.floor(damage.x)), y = damage.kind === 'full' ? 0 : Math.max(0, Math.floor(damage.y));
        const right = damage.kind === 'full' ? capture.width : Math.min(capture.width, Math.ceil(damage.x + damage.width));
        const bottom = damage.kind === 'full' ? capture.height : Math.min(capture.height, Math.ceil(damage.y + damage.height));
        if (right <= x || bottom <= y)
            return true;
        const old = capture.bounds;
        const bounds = { x: Math.min(x, old?.x ?? x), y: Math.min(y, old?.y ?? y), width: 0, height: 0 };
        bounds.width = Math.max(right, old === null ? right : old.x + old.width) - bounds.x;
        bounds.height = Math.max(bottom, old === null ? bottom : old.y + old.height) - bounds.y;
        if (capture.before === null && !capture.blank && sourceIsBlank)
            capture.blank = true;
        try {
            if (capture.before === null && !capture.blank) {
                capture.before = allocate(capture.width, capture.height, 'capture');
                upload(capture.before, source);
            }
            capture.bounds = bounds;
            return true;
        }
        catch (error) {
            abort(handle);
            if (error instanceof PixelCapacityRefusal)
                return false;
            throw error;
        }
    }
    function abort(handle: PixelCapture): void {
        const capture = captures.get(handle);
        if (capture?.before)
            release(capture.before);
        captures.delete(handle);
    }
    function finish(handle: PixelCapture): PixelEffect | null {
        const capture = captures.get(handle);
        if (capture === undefined)
            throw new Error('Unknown GPU capture.');
        if (capture.bounds === null || (capture.before === null && !capture.blank)) {
            abort(handle);
            return null;
        }
        const source = capture.source.deref();
        if (source?.width !== capture.width || source.height !== capture.height) {
            abort(handle);
            return null;
        }
        let before: Image | null = null, after: Image | null = null;
        try {
            before = allocate(capture.bounds.width, capture.bounds.height, 'effect');
            if (capture.blank) {
                target(before);
                gl.clearColor(0, 0, 0, 0);
                gl.clear(gl.COLOR_BUFFER_BIT);
            }
            else if (capture.before !== null) {
                target(capture.before);
                gl.bindTexture(gl.TEXTURE_2D, before.texture);
                gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, capture.bounds.x, capture.bounds.y, before.width, before.height);
            }
            after = allocate(capture.bounds.width, capture.bounds.height, 'effect');
            upload(after, source, capture.bounds.x, capture.bounds.y);
            const effect: Effect = {
                sequence: ++nextSequence,
                source: sourceId(source),
                width: capture.width,
                height: capture.height,
                bounds: capture.bounds,
                before,
                after,
            };
            captures.delete(handle);
            if (capture.before !== null)
                release(capture.before);
            const token = Object.freeze({ kind: 'pixel-effect' } as const);
            effects.set(token, effect);
            options.probeEvent?.({ kind: 'probe-count', name: 'effects.created', value: 1 });
            return token;
        }
        catch (error) {
            if (before !== null)
                release(before);
            if (after !== null)
                release(after);
            abort(handle);
            if (error instanceof PixelCapacityRefusal)
                return null;
            throw error;
        }
    }
    function releaseEffect(handle: PixelEffect): void {
        const effect = effects.get(handle);
        if (effect === undefined)
            return;
        effects.delete(handle);
        options.probeEvent?.({ kind: 'probe-count', name: 'effects.released', value: 1 });
        release(effect.before);
        release(effect.after);
    }
    function copyEffect(handle: PixelEffect, source: HTMLCanvasElement, destination: HTMLCanvasElement, dx: number, dy: number): PixelEffect | null {
        const original = effects.get(handle);
        if (disposed ||
            original?.source !== sourceId(source) ||
            original.width !== source.width ||
            original.height !== source.height ||
            !Number.isInteger(dx) ||
            !Number.isInteger(dy))
            return null;
        const bounds = { ...original.bounds, x: original.bounds.x + dx, y: original.bounds.y + dy };
        if (bounds.x < 0 ||
            bounds.y < 0 ||
            bounds.x + bounds.width > destination.width ||
            bounds.y + bounds.height > destination.height)
            return null;
        const copied: Image[] = [];
        try {
            for (const plate of [original.before, original.after]) {
                const clone = allocate(plate.width, plate.height, 'effect');
                copied.push(clone);
                target(plate);
                gl.bindTexture(gl.TEXTURE_2D, clone.texture);
                gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 0, 0, plate.width, plate.height);
            }
            const [before, after] = copied;
            if (before === undefined || after === undefined)
                throw new Error('Incomplete copied effect.');
            const token = Object.freeze({ kind: 'pixel-effect' } as const);
            effects.set(token, {
                sequence: ++nextSequence,
                source: sourceId(destination),
                width: destination.width,
                height: destination.height,
                bounds,
                before,
                after,
            });
            options.probeEvent?.({ kind: 'probe-count', name: 'effects.created', value: 1 });
            return token;
        }
        catch (error) {
            for (const plate of copied)
                release(plate);
            if (error instanceof PixelCapacityRefusal)
                return null;
            throw error;
        }
    }
    function bounds(handle: PixelEffect): PixelBounds | null {
        return effects.get(handle)?.bounds ?? null;
    }
    function selectEffects(source: HTMLCanvasElement, groups: readonly PixelTextGroup[]) {
        const selected: {
            effect: Effect;
            groupIndex: number;
        }[] = [];
        const owners = new Map<Effect, PixelTextGroup>();
        for (const [groupIndex, group] of groups.entries()) {
            if (group.effects.length === 0 && group.draws.some((draw) => draw.text.trim().length > 0))
                return null;
            for (const handle of group.effects) {
                const effect = effects.get(handle);
                if (effect?.source !== sourceId(source) ||
                    effect.width !== source.width ||
                    effect.height !== source.height)
                    return null;
                const owner = owners.get(effect);
                if (owner !== undefined && owner !== group)
                    return null;
                if (owner === undefined)
                    selected.push({ effect, groupIndex });
                owners.set(effect, group);
            }
        }
        return selected.sort((a, b) => a.effect.sequence - b.effect.sequence);
    }
    function reverseEffects(selected: NonNullable<ReturnType<typeof selectEffects>>, candidate: Image, valid: Image, trace: FailureTrace | null, memberIndex: number): void {
        for (let index = selected.length - 1; index >= 0; index--) {
            const entry = selected[index];
            if (entry === undefined)
                continue;
            const { effect, groupIndex } = entry;
            validateEffect(effect, candidate, valid, 0, trace === null
                ? undefined
                : {
                    trace,
                    memberIndex,
                    groupIndex,
                    effectSequence: effect.sequence,
                    stage: 'source',
                });
            const patch = allocate(effect.bounds.width, effect.bounds.height);
            try {
                target(patch);
                gl.useProgram(reverse);
                texture(reverse, 'beforeImage', effect.before, 0);
                texture(reverse, 'afterImage', effect.after, 1);
                texture(reverse, 'candidateImage', candidate, 2);
                gl.uniform2i(gl.getUniformLocation(reverse, 'origin'), effect.bounds.x, effect.bounds.y);
                gl.drawArrays(gl.TRIANGLES, 0, 3);
                copy(patch, candidate, effect.bounds.x, effect.bounds.y);
            }
            finally {
                release(patch);
            }
        }
    }
    function prepareSource(source: HTMLCanvasElement, groups: readonly PixelTextGroup[], valid: Image, own: (image: Image) => Image, trace: FailureTrace | null = null, memberIndex = 0) {
        const selected = selectEffects(source, groups);
        if (selected === null)
            return null;
        const original = own(allocate(source.width, source.height)), candidate = own(allocate(source.width, source.height));
        upload(original, source);
        copy(original, candidate);
        reverseEffects(selected, candidate, valid, trace, memberIndex);
        for (const [groupIndex, group] of groups.entries())
            if (!validateTargetRegions(candidate, group, valid, trace, memberIndex, groupIndex))
                return null;
        if (!validateTargetConflicts(source, groups.map((group, groupIndex) => ({ group, groupIndex, valid, trace })), memberIndex))
            return null;
        return { original, candidate, groups };
    }
    function prepareIndependentSource(source: HTMLCanvasElement, groups: readonly PixelTextGroup[], own: (image: Image) => Image) {
        const selected = selectEffects(source, groups);
        if (selected === null || groups.length === 0)
            return null;
        commit ??= program(vertex, commitFragment);
        let background = own(allocate(source.width, source.height)), candidate = own(allocate(source.width, source.height));
        upload(background, source);
        const rows = groups.map((group, groupIndex) => ({
            group,
            groupIndex,
            effects: [] as NonNullable<ReturnType<typeof selectEffects>>,
            sequence: 0,
            valid: own(flag(1)),
            trace: options.proofDiagnostics ? { image: own(flag(0)), checks: [] as PixelProofFailure[] } : null,
        }));
        if (!validateTargetConflicts(source, rows, 0))
            return null;
        for (const entry of selected) {
            const row = rows[entry.groupIndex];
            if (row === undefined)
                throw new Error('Missing source group.');
            row.effects.push(entry);
            row.sequence = entry.effect.sequence;
        }
        for (const row of [...rows].sort((a, b) => b.sequence - a.sequence)) {
            copy(background, candidate);
            reverseEffects(row.effects, candidate, row.valid, row.trace, 0);
            if (!validateTargetRegions(candidate, row.group, row.valid, row.trace, 0, row.groupIndex))
                return null;
            target(background);
            gl.useProgram(commit);
            texture(commit, 'candidateImage', candidate, 0);
            texture(commit, 'validFlag', row.valid, 1);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
        }
        if (groups.some((group) => group.draws.length > 0)) {
            overlay ??= program(vertex, overlayFragment);
            resizeWork(textCanvas, source.width, source.height);
            const textImage = own(allocate(source.width, source.height));
            for (const row of rows) {
                if (row.group.draws.length === 0)
                    continue;
                textContext.clearRect(0, 0, source.width, source.height);
                drawTextGroup(textContext, row.group);
                upload(textImage, textCanvas);
                target(candidate);
                gl.useProgram(overlay);
                texture(overlay, 'candidateImage', background, 0);
                texture(overlay, 'textImage', textImage, 1);
                texture(overlay, 'validFlag', row.valid, 2);
                gl.drawArrays(gl.TRIANGLES, 0, 3);
                [background, candidate] = [candidate, background];
            }
        }
        return { candidate: background, predicates: rows };
    }
    function describeSnapshot(source: HTMLCanvasElement, groups: readonly PixelTextGroup[]): PixelSnapshot {
        if (disposed)
            throw new Error('Bitmap pixel device is disposed.');
        const handle = Object.freeze({ kind: 'pixel-snapshot' } as const);
        snapshots.set(handle, { source: new WeakRef(source), groups });
        return handle;
    }
    function captureSnapshot(handle: PixelSnapshot): boolean {
        const snapshot = snapshots.get(handle);
        if (snapshot === undefined || disposed)
            return false;
        if ('pixels' in snapshot)
            return true;
        const source = snapshot.source.deref();
        if (source === undefined)
            return false;
        const owned: Image[] = [];
        const own = (image: Image) => {
            owned.push(image);
            return image;
        };
        try {
            const valid = own(flag(1));
            const trace: FailureTrace | null = options.proofDiagnostics ? { image: own(flag(0)), checks: [] } : null;
            const result = prepareSource(source, snapshot.groups, valid, own, trace);
            if (result === null) {
                for (const image of owned)
                    release(image);
                return false;
            }
            for (const image of owned)
                assign(image, 'origin');
            const pixels: {
                original: Image;
                candidate: Image;
                valid: Image;
                trace?: FailureTrace;
            } = {
                original: result.original,
                candidate: result.candidate,
                valid,
            };
            if (trace !== null)
                pixels.trace = trace;
            snapshots.set(handle, { pixels });
            return true;
        }
        catch (error) {
            for (const image of owned)
                release(image);
            if (error instanceof PixelCapacityRefusal)
                return false;
            throw error;
        }
    }
    function releaseSnapshot(handle: PixelSnapshot): void {
        const snapshot = snapshots.get(handle);
        if (snapshot === undefined)
            return;
        snapshots.delete(handle);
        if ('pixels' in snapshot) {
            release(snapshot.pixels.original);
            release(snapshot.pixels.candidate);
            release(snapshot.pixels.valid);
            if (snapshot.pixels.trace !== undefined)
                release(snapshot.pixels.trace.image);
        }
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
        const extra = (width * height - canvas.width * canvas.height) * 4;
        checkBudget(extra);
        if (canvas.width !== width)
            canvas.width = width;
        if (canvas.height !== height)
            canvas.height = height;
        canvasBytes += extra;
        memory('canvasBytes', extra);
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
    function exportImageBatch(selected: readonly Image[]) {
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
            gl.uniform2i(gl.getUniformLocation(imageProgram, 'drawOrigin'), region.x, y);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
        }
        let surface: HTMLCanvasElement | null = null;
        let completed = false;
        try {
            surface = transferOutputSurface(width, height);
            surfaces.set(surface, { bytes: width * height * 4, proof: null });
            setTransfer(0);
            exportBytes += width * height * 4;
            memory('exportBytes', width * height * 4);
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
    function drawText(context: CanvasRenderingContext2D, text: string, layout: BitmapTextLayout, dx = 0, dy = 0): void {
        const { placement, paint, alignment } = layout;
        let x = placement.x + dx;
        if (alignment === 'center')
            x += placement.maxWidth / 2;
        if (alignment === 'right')
            x += placement.maxWidth;
        const y = bitmapTextBaseline(placement, paint) + dy;
        context.font = paint.font;
        context.textAlign = alignment;
        context.textBaseline = 'alphabetic';
        context.lineJoin = 'round';
        context.lineWidth = paint.outlineWidth;
        context.strokeStyle = paint.outlineColor;
        context.fillStyle = paint.textColor;
        context.globalAlpha = 1;
        context.strokeText(text, x, y, placement.maxWidth);
        context.globalAlpha = paint.bodyAlpha;
        context.fillText(text, x, y, placement.maxWidth);
    }
    function drawTextGroup(context: CanvasRenderingContext2D, group: PixelTextGroup, dx = 0, dy = 0): void {
        context.save();
        try {
            if (group.targetRegions !== undefined) {
                context.beginPath();
                for (const area of group.targetRegions)
                    context.rect(area.x + dx, area.y + dy, area.width, area.height);
                context.clip();
            }
            for (const draw of group.draws)
                drawText(context, draw.text, draw.layout, dx, dy);
        }
        finally {
            context.restore();
        }
    }
    function queryFlag(image: Image, diagnosticBit = -1): WebGLQuery {
        const query = resource(gl.createQuery());
        let started = false;
        try {
            gl.useProgram(proofProgram);
            texture(proofProgram, 'validFlag', image, 0);
            if (options.proofDiagnostics)
                gl.uniform1i(gl.getUniformLocation(proofProgram, 'diagnosticBit'), diagnosticBit);
            gl.colorMask(false, false, false, false);
            gl.viewport(0, 0, 1, 1);
            gl.beginQuery(gl.ANY_SAMPLES_PASSED, query);
            started = true;
            gl.drawArrays(gl.TRIANGLES, 0, 3);
            gl.endQuery(gl.ANY_SAMPLES_PASSED);
            started = false;
            return query;
        }
        catch (error) {
            if (started)
                gl.endQuery(gl.ANY_SAMPLES_PASSED);
            gl.deleteQuery(query);
            throw error;
        }
        finally {
            gl.colorMask(true, true, true, true);
        }
    }
    function releaseQueries(entries: readonly ProofQueries[]): void {
        for (const entry of entries) {
            gl.deleteQuery(entry.query);
            if (entry.diagnostic !== null)
                for (const query of entry.diagnostic.bits)
                    gl.deleteQuery(query);
        }
    }
    function queryPredicate({ valid, trace, groupIndex }: PublicationPredicate): ProofQueries {
        const bits: WebGLQuery[] | null = trace === null ? null : [];
        try {
            if (trace !== null && bits !== null)
                for (let bit = 0; bit < Math.ceil(Math.log2(trace.checks.length + 1)); bit++)
                    bits.push(queryFlag(trace.image, bit));
            const query = queryFlag(valid);
            return {
                query,
                groupIndex,
                diagnostic: trace === null || bits === null
                    ? null
                    : {
                        bits,
                        checks: trace.checks,
                    },
            };
        }
        catch (error) {
            if (bits !== null)
                for (const bit of bits)
                    gl.deleteQuery(bit);
            throw error;
        }
    }
    function composeOccurrence(request: PixelCompositionRequest) {
        const members = 'members' in request ? request.members : [request];
        if (disposed || members.length === 0)
            return null;
        const packed = pack(members.map((member) => ('content' in member ? member.bounds : member.source)));
        if (packed === null)
            return null;
        const { regions, width, height } = packed;
        const surfaceBytes = width * height * 4;
        checkBudget(surfaceBytes * 3 - canvasBytes);
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
            replayBytes += width * height * 4;
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
            const independent = multipleGroups ? prepareIndependentSource(request.source, request.groups, own) : null;
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
                const snapshot = snapshots.get(root.snapshot);
                return snapshot !== undefined && 'pixels' in snapshot ? snapshot.pixels : undefined;
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
            const prepared = independent !== null
                ? [
                    {
                        original: independent.candidate,
                        candidate: independent.candidate,
                        groups: [],
                        bounds: { x: 0, y: 0, width, height },
                        replacement: true,
                    },
                ]
                : members.map((member, memberIndex) => {
                    if (!('content' in member)) {
                        const result = prepareSource(member.source, member.groups, valid, own, trace, memberIndex);
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
                                replacement: false,
                            };
                    }
                    const root = textOrigin(member.content), index = roots.indexOf(root);
                    const pixels = rootPixels[index];
                    if (pixels === undefined || exported === null)
                        return null;
                    const nativeRegion = exported.regions[index * 2], backgroundRegion = exported.regions[index * 2 + 1];
                    if (nativeRegion === undefined || backgroundRegion === undefined)
                        return null;
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
                        gl.uniform1i(gl.getUniformLocation(reduction, 'finalPass'), 3);
                        gl.uniform1i(gl.getUniformLocation(reduction, 'diagnosticIndex'), offset);
                        gl.drawArrays(gl.TRIANGLES, 0, 3);
                    }
                    target(valid);
                    gl.useProgram(imageProgram);
                    texture(imageProgram, 'inputImage', pixels.valid, 0);
                    gl.uniform2i(gl.getUniformLocation(imageProgram, 'drawOrigin'), 0, 0);
                    gl.enable(gl.BLEND);
                    gl.blendEquation(gl.MIN);
                    gl.blendFunc(gl.ONE, gl.ONE);
                    gl.drawArrays(gl.TRIANGLES, 0, 3);
                    gl.disable(gl.BLEND);
                    const nativeRoot = scratchCanvas(root.width, root.height);
                    const nativeContext = nativeRoot.getContext('2d');
                    if (nativeContext === null)
                        throw new Error('Copied text raster is unavailable.');
                    nativeContext.drawImage(exported.surface, nativeRegion.x, nativeRegion.y, nativeRegion.width, nativeRegion.height, 0, 0, root.width, root.height);
                    const sx = root.width / member.content.width, sy = root.height / member.content.height;
                    const rootBounds = {
                        x: member.bounds.x * sx,
                        y: member.bounds.y * sy,
                        width: member.bounds.width * sx,
                        height: member.bounds.height * sy,
                    };
                    const translatedRoot = scratchCanvas(Math.ceil(rootBounds.width), Math.ceil(rootBounds.height));
                    const context = translatedRoot.getContext('2d');
                    if (context === null)
                        throw new Error('Copied text raster is unavailable.');
                    context.drawImage(exported.surface, backgroundRegion.x, backgroundRegion.y, backgroundRegion.width, backgroundRegion.height, -rootBounds.x, -rootBounds.y, root.width, root.height);
                    for (const draw of member.draws)
                        drawText(context, draw.text, draw.layout, -rootBounds.x, -rootBounds.y);
                    const backgroundRoot = scratchCanvas(root.width, root.height);
                    const backgroundContext = backgroundRoot.getContext('2d');
                    if (backgroundContext === null)
                        throw new Error('Copied background raster is unavailable.');
                    backgroundContext.drawImage(exported.surface, backgroundRegion.x, backgroundRegion.y, backgroundRegion.width, backgroundRegion.height, 0, 0, root.width, root.height);
                    const background = replayContent(member.content, backgroundRoot, scratchCanvas);
                    const expected = replayContent(member.content, nativeRoot, scratchCanvas);
                    const translated = replayContent(member.content, translatedRoot, scratchCanvas);
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
                        bounds: { x: 0, y: 0, width: expected.width, height: expected.height },
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
                    return { original, candidate, groups: [], bounds: member.bounds, replacement: true };
                });
            if (prepared.some((member) => member === null))
                return null;
            const textImage = independent === null ? own(allocate(width, height)) : independent.candidate;
            if (independent === null) {
                resizeWork(textCanvas, width, height);
                textContext.clearRect(0, 0, width, height);
                for (const [index, member] of prepared.entries()) {
                    const region = regions[index];
                    if (member === null || region === undefined)
                        throw new Error('Missing occurrence member.');
                    const { groups } = member;
                    textContext.save();
                    try {
                        textContext.beginPath();
                        textContext.rect(region.x, region.y, region.width, region.height);
                        textContext.clip();
                        for (const group of groups)
                            drawTextGroup(textContext, group, region.x, region.y);
                    }
                    finally {
                        textContext.restore();
                    }
                }
                upload(textImage, textCanvas);
            }
            resizeWork(output, width, height);
            target(null);
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);
            for (const [index, member] of prepared.entries()) {
                const region = regions[index];
                if (member === null || region === undefined)
                    throw new Error('Missing occurrence member.');
                const drawY = height - region.y - region.height;
                gl.viewport(region.x, drawY, region.width, region.height);
                gl.useProgram(display);
                texture(display, 'sourceImage', member.original, 0);
                texture(display, 'candidateImage', member.candidate, 1);
                texture(display, 'textImage', textImage, 2);
                texture(display, 'validFlag', valid, 3);
                gl.uniform2i(gl.getUniformLocation(display, 'drawOrigin'), region.x, drawY);
                gl.uniform2i(gl.getUniformLocation(display, 'textOrigin'), region.x, region.y);
                gl.uniform2i(gl.getUniformLocation(display, 'sourceOffset'), member.bounds.x, member.bounds.y);
                gl.uniform1i(gl.getUniformLocation(display, 'outputHeight'), region.height);
                gl.uniform1i(gl.getUniformLocation(display, 'replacement'), member.replacement ? 1 : 0);
                gl.drawArrays(gl.TRIANGLES, 0, 3);
            }
            for (const predicate of predicates)
                queries.push(queryPredicate(predicate));
            surface = transferOutputSurface(width, height);
            const proof = Object.freeze({ kind: 'pixel-proof' } as const);
            surfaces.set(surface, { bytes: surfaceBytes, proof });
            setTransfer(0);
            displayBytes += surfaceBytes;
            options.probeEvent?.({ kind: 'probe-count', name: 'displays.created', value: 1 });
            memory('displayBytes', surfaceBytes);
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
            replayBytes -= scratchBytes;
            memory('replayBytes', -scratchBytes);
            for (const canvas of scratchExports)
                releaseDisplay(canvas, true);
            setTransfer(0);
            if (!isDisposed()) {
                const current = (output.width * output.height + textCanvas.width * textCanvas.height) * 4;
                memory('canvasBytes', current - canvasBytes);
                canvasBytes = current;
            }
        }
    }
    function isDisposed(): boolean {
        return disposed;
    }
    function compose(requests: readonly PixelCompositionRequest[]): readonly ({
        surface: HTMLCanvasElement;
        regions: readonly PixelBounds[];
        proof: PixelProof;
    } | null)[] {
        if (disposed || composing)
            return requests.map(() => null);
        let capacity = BITMAP_LIMITS.proofs - proofs.size;
        const staged: ReturnType<typeof composeOccurrence>[] = [];
        composing = true;
        try {
            for (const request of requests) {
                if (capacity === 0) {
                    options.resourceEvent?.({
                        kind: 'usage',
                        name: 'proofs',
                        value: BITMAP_LIMITS.proofs - capacity,
                        limit: BITMAP_LIMITS.proofs,
                    });
                    options.resourceEvent?.({ kind: 'refused', name: 'proofs', requested: 1 });
                    staged.push(null);
                    continue;
                }
                try {
                    const result = composeOccurrence(request);
                    staged.push(result);
                    if (result !== null)
                        capacity--;
                }
                catch (error) {
                    if (!(error instanceof PixelCapacityRefusal))
                        throw error;
                    staged.push(null);
                }
                if (isDisposed())
                    throw new Error('Bitmap pixel device ended during composition.');
            }
            check();
            gl.flush();
            for (const item of staged)
                if (item !== null) {
                    proofs.set(item.proof, item.queries);
                }
            return requests.map((_, index) => {
                const item = staged[index];
                return item == null ? null : { surface: item.surface, regions: item.regions, proof: item.proof };
            });
        }
        catch (error) {
            for (const item of staged)
                if (item !== null) {
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
        const entry = surfaces.get(surface);
        if (entry === undefined)
            return null;
        if (owned) {
            surface.width = 1;
            surface.height = 1;
        }
        surfaces.delete(surface);
        if (entry.proof !== null)
            options.probeEvent?.({ kind: 'probe-count', name: 'displays.released', value: 1 });
        if (entry.proof === null)
            exportBytes -= entry.bytes;
        else
            displayBytes -= entry.bytes;
        memory(entry.proof === null ? 'exportBytes' : 'displayBytes', -entry.bytes);
        if (entry.proof !== null) {
            const queries = proofs.get(entry.proof);
            if (queries !== undefined) {
                proofs.delete(entry.proof);
                releaseQueries(queries);
            }
        }
        if (disposed) {
            reportResources();
            options.resourceEvent?.({ kind: 'frame' });
        }
        return entry.proof;
    }
    function poll(): readonly {
        proof: PixelProof;
        visible: boolean;
        failure?: PixelProofFailure | null;
        groups?: readonly PixelGroupProof[];
    }[] {
        const results: ReturnType<typeof poll>[number][] = [];
        for (const [proof, queries] of proofs) {
            const last = queries.at(-1);
            if (last === undefined || !gl.getQueryParameter(last.query, gl.QUERY_RESULT_AVAILABLE))
                break;
            proofs.delete(proof);
            const groups = queries.map(({ query, diagnostic, groupIndex }) => {
                const visible = Boolean(gl.getQueryParameter(query, gl.QUERY_RESULT));
                let index = 0;
                if (!visible && diagnostic !== null)
                    for (const [bit, query] of diagnostic.bits.entries())
                        if (gl.getQueryParameter(query, gl.QUERY_RESULT))
                            index += 2 ** bit;
                const result: PixelGroupProof = {
                    groupIndex: groupIndex ?? 0,
                    visible,
                    ...(diagnostic === null
                        ? {}
                        : { failure: visible ? null : (diagnostic.checks[index - 1] ?? null) }),
                };
                return result;
            });
            const result: ReturnType<typeof poll>[number] = { proof, visible: groups.every((group) => group.visible) };
            if (last.groupIndex !== null)
                result.groups = groups;
            else if (groups[0]?.failure !== undefined)
                result.failure = groups[0].failure;
            results.push(result);
            releaseQueries(queries);
        }
        return results;
    }
    function dispose(): void {
        if (disposed)
            return;
        disposed = true;
        if (listenerAttached)
            output.removeEventListener('webglcontextlost', contextLost);
        listenerAttached = false;
        for (const image of images)
            release(image);
        for (const queries of proofs.values())
            releaseQueries(queries);
        proofs.clear();
        captures.clear();
        options.probeEvent?.({ kind: 'probe-count', name: 'effects.released', value: effects.size });
        effects.clear();
        snapshots.clear();
        for (const p of programs)
            gl.deleteProgram(p);
        gl.deleteFramebuffer(framebuffer);
        gl.deleteVertexArray(vao);
        output.width = 1;
        output.height = 1;
        textCanvas.width = 1;
        textCanvas.height = 1;
        memory('canvasBytes', -canvasBytes);
        canvasBytes = 0;
        setTransfer(0);
    }
    function reclaim(): void {
        if (disposed || composing)
            return;
        if (needsReclamation ||
            (effects.size === 0 && snapshots.size === 0 && captures.size === 0 && surfaces.size === 0)) {
            output.width = output.height = textCanvas.width = textCanvas.height = 1;
            memory('canvasBytes', 8 - canvasBytes);
            canvasBytes = 8;
        }
        needsReclamation = false;
    }
    function reportResources(): void {
        if (options.resourceEvent === undefined)
            return;
        options.resourceEvent({ kind: 'usage', name: 'effects', value: effects.size, limit: null });
        options.resourceEvent({ kind: 'usage', name: 'captures', value: captures.size, limit: null });
        options.resourceEvent({ kind: 'usage', name: 'displays', value: surfaces.size, limit: null });
        options.resourceEvent({ kind: 'usage', name: 'origins', value: snapshots.size, limit: null });
        options.resourceEvent({ kind: 'usage', name: 'pixelBytes', value: allocatedBytes(), limit: limitBytes });
        options.resourceEvent({ kind: 'usage', name: 'proofs', value: proofs.size, limit: BITMAP_LIMITS.proofs });
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
        bounds,
        effectBytes: (handle: PixelEffect) => {
            const effect = effects.get(handle);
            return effect === undefined ? 0 : effect.before.bytes + effect.after.bytes;
        },
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
        needsReclamation: () => needsReclamation && !composing,
        hasPendingQueries: () => proofs.size > 0,
        reportResources,
    };
}
export type BitmapPixelDevice = ReturnType<typeof createBitmapPixelDevice>;
