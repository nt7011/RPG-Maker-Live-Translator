declare const observationBrand: unique symbol;
declare const drawBrand: unique symbol;
declare const surfaceBrand: unique symbol;
export interface TextObservationRef {
    readonly [observationBrand]: never;
}
export interface BitmapDrawRef {
    readonly [drawBrand]: never;
}
export interface BitmapSurfaceRef {
    readonly [surfaceBrand]: never;
}
export interface TextRange {
    readonly start: number;
    readonly end: number;
}
export interface NativeSourceSpan extends TextRange {
    readonly kind: 'text' | 'control' | 'pause';
}
export interface Rect {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
}
interface ObservationBase {
    readonly observation: TextObservationRef;
    readonly family: 'window' | 'game-message';
}
export type NativeTextObservation = (ObservationBase & {
    readonly kind: 'source';
    readonly text: string;
}) | (ObservationBase & {
    readonly kind: 'draw';
    readonly surface: BitmapSurfaceRef;
    readonly draws: readonly {
        readonly draw: BitmapDrawRef;
        readonly text: string;
        readonly range: TextRange | null;
    }[];
    readonly allocation: Rect | null;
});
export type SemanticClue = {
    readonly kind: 'ordered-members';
    readonly members: readonly {
        readonly draw: BitmapDrawRef;
        readonly range: TextRange;
    }[];
} | {
    readonly kind: 'safe-area';
    readonly rect: Rect;
} | {
    readonly kind: 'normalized-source';
    readonly spans: readonly NativeSourceSpan[];
    readonly complete: boolean;
};
export type SemanticClueProducer = (observation: NativeTextObservation) => readonly SemanticClue[];
export interface SemanticAdapter {
    readonly observe: SemanticClueProducer;
    readonly captures: readonly NativeCaptureFactory[];
}
export type NativeMethod = (this: unknown, ...args: unknown[]) => unknown;
export interface NativeBitmapDraw {
    readonly bitmap: object;
    readonly source: object;
    readonly text: string;
    readonly width: number;
    readonly height: number;
}
export interface NativeAllocationContext extends NativeBitmapDraw {
    readonly receiver: object;
    readonly textState: object | null;
    readonly x: number | null;
    readonly y: number | null;
    readonly maxWidth: number | null;
}
export interface NativeDrawDiagnostics {
    readonly owner: string | null;
    readonly operation: string | null;
    readonly allocationReason: string | null;
}
export interface NativeCapture {
    readonly capture?: (command: NativeBitmapDraw, draw: BitmapDrawRef) => void;
    readonly allocation?: (context: NativeAllocationContext, rejected?: (reason: string) => void) => Rect | null;
}
export type NativeCaptureFactory = (host: NativeCaptureHost) => NativeCapture;
export interface NativeCaptureHost {
    readonly scope: object;
    readonly maxDraws: number;
    readonly enabled: () => boolean;
    readonly method: (target: object | null, key: string, wrap: (native: NativeMethod) => NativeMethod) => void;
    readonly safely: (action: () => void) => void;
    readonly normalize: (text: unknown) => string | null;
    readonly matches: (a: string, b: string) => boolean;
    readonly observeSource: (native: object, text: string, family: NativeTextObservation['family']) => TextObservationRef | null;
    readonly observeSourceChange: (source: TextObservationRef) => void;
    readonly observeDraw: (source: TextObservationRef, surface: object, draws: Extract<NativeTextObservation, {
        kind: 'draw';
    }>['draws'], allocation: Rect | null) => void;
    readonly allocation: (context: NativeAllocationContext, rejected?: (reason: string) => void) => Rect | null;
    readonly diagnostic?: (draw: BitmapDrawRef, source: TextObservationRef | null, method: string, reason: string, text: string, range: TextRange | null, nativeSource?: string, native?: NativeDrawDiagnostics) => void;
}
