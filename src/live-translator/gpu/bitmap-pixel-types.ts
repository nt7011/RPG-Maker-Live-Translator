import type { BitmapTextDraw } from '../stores/bitmap-text-layout.js';
import type { BitmapContent } from '../stores/bitmap-content.js';
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
    readonly reason: 'text-effect-empty' | 'text-effect-mismatch' | 'background-mismatch' | 'repaint-evidence-unavailable' | 'expansion-occupied' | 'neighbor-collision';
}
export interface PixelBounds {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
}
export interface PixelTextEvidence {
    readonly effects: readonly PixelEffect[];
    readonly sourceRegions: readonly {
        readonly effect: PixelEffect | null;
        readonly bounds: PixelBounds;
    }[];
}
export interface PixelTextCandidate {
    readonly draws: readonly BitmapTextDraw[];
    readonly targetRegions: readonly PixelBounds[];
}
export interface PixelTextGroup extends PixelTextEvidence, PixelTextCandidate {
    readonly fallback?: PixelTextCandidate | null;
}
export type PixelCompositionMember = {
    readonly source: HTMLCanvasElement;
} & ({
    readonly groups: readonly PixelTextGroup[];
    readonly preserve: readonly PixelTextEvidence[];
} | ({
    readonly content: BitmapContent;
    readonly bounds: PixelBounds;
} & ({
    readonly draws: readonly BitmapTextDraw[];
} | {
    readonly preserveOriginal: true;
})));
export type PixelCompositionRequest = {
    readonly members: readonly PixelCompositionMember[];
} | {
    readonly source: HTMLCanvasElement;
    readonly groups: readonly PixelTextGroup[];
    readonly preserve: readonly PixelTextEvidence[];
};
export interface PixelCompositionRefusal {
    readonly refusal: 'capacity' | 'unavailable-evidence';
}
export type PixelCompositionResult = PixelCompositionRefusal | {
    readonly surface: HTMLCanvasElement;
    readonly regions: readonly PixelBounds[];
    readonly proof: PixelProof;
};
export interface PixelGroupProof {
    readonly groupIndex: number;
    readonly visible: boolean;
    readonly failure?: PixelProofFailure | null;
}
export class PixelCapacityRefusal extends Error {
}
export type ImageOwner = 'capture' | 'effect' | 'origin' | 'temporary';
export interface Image {
    owner: ImageOwner;
    readonly texture: WebGLTexture;
    readonly width: number;
    readonly height: number;
    readonly bytes: number;
}
export interface Capture {
    source: WeakRef<HTMLCanvasElement>;
    width: number;
    height: number;
    damage: PixelBounds | null;
    before: Image | null;
    blank: boolean;
}
export interface Effect {
    sequence: number;
    source: object;
    width: number;
    height: number;
    damage: PixelBounds;
    evidence: PixelBounds;
    before: Image;
    after: Image;
}
export interface FailureTrace {
    readonly image: Image;
    readonly checks: PixelProofFailure[];
}
export interface TraceCheck extends Omit<PixelProofFailure, 'reason'> {
    readonly trace: FailureTrace;
}
export interface FailureQueries {
    readonly bits: readonly WebGLQuery[];
    readonly checks: readonly PixelProofFailure[];
}
export interface ProofQueries {
    readonly query: WebGLQuery;
    readonly diagnostic: FailureQueries | null;
    readonly groupIndex: number | null;
}
export interface PublicationPredicate {
    readonly valid: Image;
    readonly trace: FailureTrace | null;
    readonly groupIndex: number | null;
}
export interface SelectedEffect {
    readonly effect: Effect;
    readonly groupIndex: number;
    readonly regions: readonly PixelBounds[];
    readonly complete: boolean;
}
export interface PixelDrawing {
    readonly gl: WebGL2RenderingContext;
    readonly allocate: (width: number, height: number, owner?: ImageOwner) => Image;
    readonly release: (image: Image) => void;
    readonly target: (image: Image | null, width?: number, height?: number) => void;
    readonly texture: (program: WebGLProgram, name: string, image: Image, unit: number) => void;
    readonly uniform: (program: WebGLProgram, name: string) => WebGLUniformLocation | null;
    readonly program: (vertex: string, fragment: string) => WebGLProgram;
    readonly upload: (image: Image, canvas: HTMLCanvasElement, x?: number, y?: number) => void;
    readonly copy: (from: Image, to: Image, x?: number, y?: number) => void;
    readonly flag: (value: number) => Image;
}
