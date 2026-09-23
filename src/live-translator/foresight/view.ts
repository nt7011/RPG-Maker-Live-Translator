import type { ForesightLocation, ForesightNodeKind, ForesightOutcome, ForesightStop } from './graph.js';
import type { ForesightViewLimits } from '../configuration/foresight.js';
export type { ForesightLocation, ForesightNodeKind, ForesightStop } from './graph.js';
export type ForesightPreparation = 'unrequested' | 'pending' | 'ready' | 'skipped' | 'failed';
export interface ForesightProjection {
    readonly state: 'building' | 'complete' | 'limited';
    readonly work: number;
    readonly reachable: number;
    readonly collapsed: number;
    readonly hiddenStops: number;
    readonly projected: number;
    readonly omittedNodes: number;
}
export interface ForesightStopSite {
    readonly location: ForesightLocation | null;
    readonly reason: ForesightStop;
    readonly index: number;
    readonly code: number | null;
}
export interface ForesightPreparedText {
    readonly state: ForesightPreparation;
    readonly translation: string | null;
    readonly translationTruncated: boolean;
}
export interface ForesightViewText {
    readonly choice: number | null;
    readonly preview: string;
    readonly truncated: boolean;
    readonly preparation: ForesightPreparation;
    readonly translation: string | null;
    readonly translationTruncated: boolean;
}
export interface ForesightViewNode {
    readonly outcome: ForesightOutcome;
    readonly location: ForesightLocation | null;
    readonly omittedNext: number;
    readonly id: number;
    readonly index: number;
    readonly kind: ForesightNodeKind;
    readonly arm: number | null;
    readonly valid: boolean;
    readonly next: readonly number[];
    readonly texts: readonly ForesightViewText[];
    readonly stops: readonly ForesightStopSite[];
}
export interface ForesightViewGraph {
    readonly projection: ForesightProjection | null;
    readonly nodes: readonly ForesightViewNode[];
    readonly truncated: boolean;
}
export interface ForesightViewStats {
    readonly reads: number;
    readonly nodes: number;
    readonly candidates: number;
    readonly units: number;
    readonly stops: Readonly<Partial<Record<ForesightStop, number>>>;
    readonly lastStop: ForesightStopSite | null;
}
export interface ForesightView {
    readonly revision: number;
    readonly showSpoilers: boolean;
    readonly limits: ForesightViewLimits;
    readonly state: 'waiting' | 'scanning' | 'preparing' | 'complete' | 'unavailable';
    readonly waiting: 'no-submission' | 'origin-unavailable' | null;
    readonly anchor: Readonly<{
        id: number;
        textId: number;
        index: number;
    }> | null;
    readonly stats: ForesightViewStats | null;
    readonly graph: ForesightViewGraph;
    readonly prepared: number;
    readonly failed: number;
    readonly outstanding: boolean;
}
