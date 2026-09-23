export type ForesightNodeKind = 'root' | 'message' | 'choice' | 'condition' | 'branch' | 'merge' | 'battle';
export type ForesightOutcome = 'win' | 'escape' | 'lose' | null;
export type ForesightStop = 'end' | 'unsupported' | 'malformed' | 'messages' | 'reads' | 'nodes' | 'candidates' | 'frontiers' | 'depth' | 'units';
export interface ForesightPosition {
    readonly frame: number;
    readonly index: number;
}
export interface ForesightCandidate extends ForesightPosition {
    readonly distance: number;
    readonly end: number;
    readonly choice: number | null;
    readonly text: string;
}
export interface ForesightStopSite extends ForesightPosition {
    readonly reason: ForesightStop;
    readonly code: number | null;
}
export interface ForesightNode extends ForesightPosition {
    readonly kind: ForesightNodeKind;
    readonly outcome: ForesightOutcome;
    readonly arm: number | null;
    readonly valid: boolean;
    readonly next: readonly number[];
    readonly candidates: readonly ForesightCandidate[];
    readonly stops: readonly ForesightStopSite[];
}
export interface ForesightSource {
    readonly id: number;
    readonly length: number;
}
export interface ForesightAddress {
    readonly source: number;
    readonly index: number;
    readonly path: readonly {
        readonly source: number;
        readonly index: number;
        readonly child: number;
    }[];
}
export interface ForesightLocation {
    readonly commonEvent: number | null;
    readonly index: number;
    readonly via: readonly {
        readonly commonEvent: number | null;
        readonly index: number;
        readonly childCommonEvent: number | null;
    }[];
}
