import type { BitmapDrawRef, TextObservationRef, TextRange, NativeDrawDiagnostics, } from '../semantic-adapters/contract.js';
import type { RuntimeDiagnosticField } from '../runtime/diagnostics-ingress.js';
import type { BitmapCommandAtom } from './bitmap-command-rows.js';
import type { BitmapAssociationCandidate, BitmapTextAssociation } from './bitmap-text-associations.js';
import type { BitmapSemanticSource } from './bitmap-semantic-clues.js';
export type SemanticContextStage = 'observation' | 'clue' | 'association' | 'layout' | 'presentation';
export interface SemanticContextDecision {
    readonly stage: SemanticContextStage;
    readonly reason: string;
    readonly source?: BitmapSemanticSource;
    readonly area?: NonNullable<BitmapAssociationCandidate['clue']>['allocation'];
}
interface SourceEvidence {
    readonly id: number;
    readonly text: string;
    readonly length: number;
    readonly family: string;
    complete: string;
    ingress: string;
    matchingText: string;
    rejection?: Omit<SemanticContextDecision, 'source'>;
}
interface DrawEvidence {
    readonly observation: TextObservationRef | null;
    readonly method: string;
    readonly reason: string;
    readonly text: string;
    readonly range: TextRange | null;
    readonly nativeSource: string | null;
    readonly nativeSourceLength: number | null;
    readonly native: NativeDrawDiagnostics | null;
}
export function createBitmapSemanticDiagnostics() {
    let nextId = 1;
    const sources = new WeakMap<TextObservationRef, SourceEvidence>();
    const draws = new WeakMap<BitmapDrawRef, DrawEvidence>();
    const hooks: string[] = [];
    function reject(token: TextObservationRef, decision: Omit<SemanticContextDecision, 'source'>): void {
        const source = sources.get(token);
        if (source === undefined || source.rejection !== undefined)
            return;
        source.rejection = {
            stage: decision.stage,
            reason: decision.reason,
            ...(decision.area === undefined ? {} : { area: decision.area === null ? null : { ...decision.area } }),
        };
    }
    return {
        reject,
        hook(name: string, available: boolean): void {
            hooks.push(`${name}:${available ? 'installed' : 'unavailable'}`);
        },
        source(source: BitmapSemanticSource, complete: string): void {
            sources.set(source.observation, {
                id: nextId++,
                text: source.nativeText.slice(0, 256),
                length: source.nativeText.length,
                matchingText: source.text.slice(0, 256),
                family: source.family,
                complete,
                ingress: 'accepted',
            });
        },
        complete(token: TextObservationRef, reason: string): void {
            const source = sources.get(token);
            if (source !== undefined)
                source.complete = reason;
        },
        matching(token: TextObservationRef, text: string): void {
            const source = sources.get(token);
            if (source !== undefined)
                source.matchingText = text.slice(0, 256);
        },
        ingress(token: TextObservationRef, reason: string): void {
            const source = sources.get(token);
            if (source !== undefined)
                source.ingress = reason;
        },
        draw(draw: BitmapDrawRef, observation: TextObservationRef | null, method: string, reason: string, text: string, range: TextRange | null = null, nativeSource?: string, native?: NativeDrawDiagnostics): void {
            const prior = draws.get(draw);
            draws.set(draw, {
                observation,
                method,
                reason,
                text: text.slice(0, 256),
                range,
                native: native ?? prior?.native ?? null,
                nativeSource: nativeSource === undefined ? (prior?.nativeSource ?? null) : nativeSource.slice(0, 256),
                nativeSourceLength: nativeSource === undefined ? (prior?.nativeSourceLength ?? null) : nativeSource.length,
            });
        },
        refuse(candidate: BitmapAssociationCandidate, decision: SemanticContextDecision): void {
            for (const source of candidate.clue?.sources ?? [])
                reject(source.observation, decision);
        },
        collect() {
            const decisions = new Map<BitmapCommandAtom, SemanticContextDecision>();
            return {
                reject(atoms: readonly BitmapCommandAtom[], decision: SemanticContextDecision): void {
                    if (decision.source !== undefined)
                        reject(decision.source.observation, decision);
                    for (const atom of atoms)
                        if (!decisions.has(atom))
                            decisions.set(atom, decision);
                },
                fields(row: BitmapTextAssociation, selected: number, active: number, size: {
                    readonly width: number;
                    readonly height: number;
                }): readonly RuntimeDiagnosticField[] {
                    const evidence = row.reading.flatMap((atom) => {
                        const found = atom.draw === undefined ? undefined : draws.get(atom.draw);
                        return found === undefined ? [] : [found];
                    });
                    const localDecision = row.reading
                        .values()
                        .map((atom) => decisions.get(atom))
                        .find((value) => value !== undefined);
                    const tokens = new Set(evidence.flatMap((item) => (item.observation === null ? [] : [item.observation])));
                    const witnesses = row.clue?.sources;
                    const composed = witnesses !== undefined && witnesses.length > 1;
                    const admittedSources = witnesses?.flatMap((item) => {
                        const found = sources.get(item.observation);
                        return found === undefined ? [] : [found];
                    }) ?? [];
                    const token = witnesses?.[0].observation ??
                        localDecision?.source?.observation ??
                        tokens.values().next().value;
                    const source = token === undefined ? undefined : sources.get(token);
                    const decision = source?.rejection ?? localDecision;
                    const native = evidence.find((item) => item.native?.allocationReason != null)?.native ?? evidence[0]?.native;
                    const missing = evidence.find((item) => item.reason !== 'range-matched');
                    const sourceText = composed
                        ? witnesses
                            .map((source) => source.nativeText)
                            .join('')
                            .slice(0, 256)
                        : (source?.text ?? missing?.nativeSource ?? null);
                    const sourceLength = composed
                        ? witnesses.reduce((length, source) => length + source.nativeText.length, 0)
                        : (source?.length ?? missing?.nativeSourceLength ?? null);
                    const allocation = row.clue?.allocation ?? decision?.area ?? null;
                    const refusal = source?.rejection?.stage === 'layout' || source?.rejection?.stage === 'presentation'
                        ? source.rejection
                        : undefined;
                    const associationExpected = row.clue !== undefined ||
                        localDecision?.source !== undefined ||
                        evidence.some((item) => item.observation !== null || item.method !== 'Bitmap.drawText');
                    const status = row.clue !== undefined ? 'accepted' : selected === 0 ? 'disabled' : 'rejected';
                    const reason = row.clue !== undefined
                        ? 'context-admitted'
                        : selected === 0
                            ? 'no-adapters-selected'
                            : active === 0
                                ? 'all-producers-failed'
                                : (decision?.reason ?? missing?.reason ?? 'no-admitted-draw-membership');
                    const values: Record<string, string | number | boolean | null> = {
                        status,
                        associationExpected,
                        stage: row.clue !== undefined ? 'association' : (decision?.stage ?? 'observation'),
                        reason,
                        ...(composed
                            ? { observationIds: admittedSources.map((source) => source.id).join(',') }
                            : { observationId: source?.id ?? null }),
                        family: source?.family ?? null,
                        sourceText,
                        matchingText: composed ? row.source.text.slice(0, 256) : (source?.matchingText ?? null),
                        sourceLength,
                        sourceTruncated: sourceLength !== null && sourceText !== null && sourceLength > sourceText.length,
                        completeSource: source?.complete ?? 'unobserved',
                        clueIngress: source?.ingress ?? 'unobserved',
                        observationCount: tokens.size,
                        method: missing?.method ?? evidence[0]?.method ?? null,
                        drawText: missing?.text ?? evidence[0]?.text ?? null,
                        drawCount: row.reading.length,
                        observedDrawCount: evidence.filter((item) => item.observation !== null).length,
                        matchedDrawCount: evidence.filter((item) => item.range !== null).length,
                        physicalGroupCount: row.groups.length,
                        adaptersSelected: selected,
                        adaptersActive: active,
                        startupHooks: hooks.join(', '),
                        rangeStart: composed ? 0 : (evidence.find((item) => item.range !== null)?.range?.start ?? null),
                        rangeEnd: composed
                            ? (row.clue?.rangeEnd ?? null)
                            : (evidence.findLast((item) => item.range !== null)?.range?.end ?? null),
                        bitmapSize: [size.width, size.height].join('x'),
                        allocation: allocation === null
                            ? null
                            : [allocation.x, allocation.y, allocation.width, allocation.height].join(','),
                        areaReason: decision?.reason ?? (allocation === null ? (native?.allocationReason ?? null) : null),
                        nativeOwner: native?.owner ?? null,
                        textOperation: native?.operation ?? null,
                        presentationStage: refusal?.stage ?? null,
                        presentationReason: refusal?.reason ?? null,
                    };
                    return Object.entries(values).map(([name, value]) => ({ name, value }));
                },
            };
        },
    };
}
export type BitmapSemanticDiagnostics = ReturnType<typeof createBitmapSemanticDiagnostics>;
