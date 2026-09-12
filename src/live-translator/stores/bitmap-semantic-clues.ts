import type { NativeTextObservation, NativeSourceSpan, SemanticClue, TextRange, Rect, BitmapDrawRef, TextObservationRef, BitmapSurfaceRef, SemanticClueProducer, } from '../semantic-adapters/contract.js';
import { copyTextTemplate, sameTextIgnoringWhitespace, type TextTemplate } from './styled-text.js';
import { BITMAP_LIMITS } from './bitmap-limits.js';
import { indexBitmapSourceCharacters, type BitmapSourceCharacterIndex } from './bitmap-text-layout.js';
import type { BitmapSemanticDiagnostics } from './bitmap-semantic-diagnostics.js';
import type { NativeLifetime } from '../runtime/native-lifetime.js';
function fields(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
    if (typeof value !== 'object' || value === null)
        return null;
    const prototype: unknown = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null)
        return null;
    const own = Reflect.ownKeys(value);
    if (own.length !== keys.length || own.some((key) => typeof key !== 'string' || !keys.includes(key)))
        return null;
    const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of keys) {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (descriptor === undefined || !('value' in descriptor))
            return null;
        result[key] = descriptor.value as unknown;
    }
    return result;
}
function array(value: unknown, limit: number): readonly unknown[] | null {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype)
        return null;
    const length = Object.getOwnPropertyDescriptor(value, 'length')?.value as unknown;
    if (typeof length !== 'number' ||
        !Number.isSafeInteger(length) ||
        length < 0 ||
        length > limit ||
        Reflect.ownKeys(value).length !== length + 1)
        return null;
    const copied: unknown[] = [];
    for (let index = 0; index < length; index++) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (descriptor === undefined || !('value' in descriptor))
            return null;
        copied.push(descriptor.value as unknown);
    }
    return copied;
}
function range(value: unknown, length: number): TextRange | null {
    const data = fields(value, ['start', 'end']);
    const start = data?.['start'], end = data?.['end'];
    return typeof start === 'number' &&
        typeof end === 'number' &&
        Number.isSafeInteger(start) &&
        Number.isSafeInteger(end) &&
        start >= 0 &&
        end > start &&
        end <= length
        ? Object.freeze({ start, end })
        : null;
}
function rectangle(value: unknown): Rect | null {
    const data = fields(value, ['x', 'y', 'width', 'height']);
    if (data === null)
        return null;
    const x = data['x'], y = data['y'], width = data['width'], height = data['height'];
    return typeof x === 'number' &&
        typeof y === 'number' &&
        typeof width === 'number' &&
        typeof height === 'number' &&
        [x, y, width, height, x + width, y + height].every(Number.isFinite) &&
        width > 0 &&
        height > 0
        ? Object.freeze({ x, y, width, height })
        : null;
}
function plainSource(text: string): boolean {
    if (text.length === 0)
        return false;
    for (const character of text) {
        const code = character.charCodeAt(0);
        if ((code < 32 || (code >= 127 && code <= 159)) && !/[\s\p{White_Space}]/u.test(character))
            return false;
    }
    return true;
}
export function admitSemanticClues(observation: NativeTextObservation, sourceText: string, proposed: unknown, reportRejected?: (reason: string) => void): readonly SemanticClue[] {
    const rejected = (reason: string): readonly SemanticClue[] => {
        reportRejected?.(reason);
        return [];
    };
    const values = array(proposed, 3);
    if (values === null)
        return rejected('invalid-clue-array');
    const accepted: SemanticClue[] = [];
    for (const value of values) {
        if (typeof value !== 'object' || value === null) {
            return rejected('invalid-clue-shape');
        }
        const descriptor = Object.getOwnPropertyDescriptor(value, 'kind');
        const kind = descriptor !== undefined && 'value' in descriptor ? (descriptor.value as unknown) : null;
        if (kind === 'normalized-source') {
            const data = fields(value, ['kind', 'spans', 'complete']);
            const proposedSpans = array(data?.['spans'], sourceText.length);
            const spans: NativeSourceSpan[] = [];
            let cursor = 0;
            if (observation.kind === 'source' &&
                observation.text === sourceText &&
                typeof data?.['complete'] === 'boolean' &&
                proposedSpans !== null) {
                for (const proposedSpan of proposedSpans) {
                    const span = fields(proposedSpan, ['kind', 'start', 'end']);
                    const offsets = span === null ? null : range({ start: span['start'], end: span['end'] }, sourceText.length);
                    if (offsets?.start !== cursor ||
                        (span?.['kind'] !== 'text' && span?.['kind'] !== 'control' && span?.['kind'] !== 'pause') ||
                        (span['kind'] === 'text' && !plainSource(sourceText.slice(offsets.start, offsets.end))))
                        break;
                    spans.push(Object.freeze({ kind: span['kind'], ...offsets }));
                    cursor = offsets.end;
                }
                if (cursor === sourceText.length && spans.length > 0 && spans.length === proposedSpans.length) {
                    accepted.push(Object.freeze({ kind, spans: Object.freeze(spans), complete: data['complete'] }));
                    continue;
                }
            }
            return rejected('invalid-normalized-source');
        }
        else if (kind === 'safe-area') {
            if (observation.kind !== 'draw') {
                return rejected('safe-area-without-draw');
            }
            const data = fields(value, ['kind', 'rect']);
            const rect = rectangle(data?.['rect']);
            if (rect !== null)
                accepted.push(Object.freeze({ kind, rect }));
            else
                return rejected('invalid-safe-area');
        }
        else if (kind === 'ordered-members') {
            if (observation.kind !== 'draw') {
                return rejected('membership-without-draw');
            }
            const data = fields(value, ['kind', 'members']);
            const members = array(data?.['members'], observation.draws.length);
            if (members === null || members.length === 0) {
                return rejected('invalid-members-array');
            }
            const copied: {
                readonly draw: BitmapDrawRef;
                readonly range: TextRange;
            }[] = [];
            const used = new Set<BitmapDrawRef>();
            const observedDraws = new Map<BitmapDrawRef, (typeof observation.draws)[number]>();
            for (const entry of observation.draws)
                if (!observedDraws.has(entry.draw))
                    observedDraws.set(entry.draw, entry);
            let end = -1;
            for (const member of members) {
                const entry = fields(member, ['draw', 'range']);
                const observed = observedDraws.get(entry?.['draw'] as BitmapDrawRef);
                const offsets = range(entry?.['range'], sourceText.length);
                if (observed?.range === null ||
                    observed === undefined ||
                    offsets === null ||
                    used.has(observed.draw) ||
                    offsets.start < end ||
                    observed.range.start !== offsets.start ||
                    observed.range.end !== offsets.end ||
                    !sameTextIgnoringWhitespace(sourceText.slice(offsets.start, offsets.end), observed.text))
                    break;
                used.add(observed.draw);
                copied.push(Object.freeze({ draw: observed.draw, range: offsets }));
                end = offsets.end;
            }
            if (copied.length === members.length)
                accepted.push(Object.freeze({ kind, members: Object.freeze(copied) }));
            else
                return rejected('member-does-not-match-observed-draw-range');
        }
        else
            return rejected('unknown-clue-kind');
    }
    return Object.freeze(accepted);
}
interface Producer {
    readonly adapter: SemanticClueProducer;
    enabled: boolean;
}
export interface BitmapSemanticSource {
    readonly observation: TextObservationRef;
    readonly nativeText: string;
    readonly text: string;
    readonly template: TextTemplate;
    readonly spans: readonly NativeSourceSpan[];
    readonly family: NativeTextObservation['family'];
    readonly native: WeakRef<object>;
}
interface SourceRecord extends BitmapSemanticSource {
    text: string;
    template: TextTemplate;
    spans: readonly NativeSourceSpan[];
    readonly normalizers: Set<Producer>;
    ambiguous: boolean;
    readonly complete: Set<Producer>;
    rejected: boolean;
    characters: BitmapSourceCharacterIndex | null;
}
interface DrawContribution {
    readonly source: SourceRecord;
    readonly producer: Producer;
    readonly range: TextRange | null;
    readonly area: Rect | null;
    readonly surface: BitmapSurfaceRef;
}
export interface BitmapSemanticProvenance {
    readonly source: BitmapSemanticSource;
    readonly range: TextRange | null;
    readonly area: Rect | null;
    readonly surface: BitmapSurfaceRef;
}
function matchingSourceRange(source: BitmapSemanticSource, native: TextRange): TextRange | null {
    let offset = 0;
    let start: number | null = null;
    for (const span of source.spans) {
        if (span.kind !== 'text') {
            if (native.start < span.end && native.end > span.start)
                return null;
            continue;
        }
        if (native.start >= span.start && native.start < span.end)
            start = offset + native.start - span.start;
        if (start !== null && native.end > span.start && native.end <= span.end)
            return Object.freeze({ start, end: offset + native.end - span.start });
        offset += span.end - span.start;
    }
    return null;
}
export function createBitmapSemanticClues(options: {
    readonly adapters: readonly SemanticClueProducer[];
    readonly lifetime: NativeLifetime;
    readonly changed: (surface?: object) => void;
    readonly reportFailure: (error: unknown) => void;
    readonly diagnostics?: BitmapSemanticDiagnostics;
}) {
    const producers: Producer[] = options.adapters.map((adapter) => ({ adapter, enabled: true }));
    let sources = new WeakMap<TextObservationRef, SourceRecord>();
    let draws = new WeakMap<BitmapDrawRef, readonly DrawContribution[]>();
    let copies = new WeakMap<BitmapDrawRef, {
        origin: BitmapDrawRef;
        surface: BitmapSurfaceRef;
    }>();
    let surfaces = new WeakMap<object, BitmapSurfaceRef>();
    const pending = new Map<TextObservationRef, SourceRecord>();
    let pendingByNative = new WeakMap<object, TextObservationRef>();
    function withdrawPending(observation: TextObservationRef): void {
        const source = pending.get(observation);
        if (source === undefined)
            return;
        pending.delete(observation);
        options.lifetime.forget(source.native);
    }
    function route(observation: NativeTextObservation, source: SourceRecord) {
        const contributions: {
            producer: Producer;
            clues: readonly SemanticClue[];
        }[] = [];
        for (const producer of producers) {
            if (!producer.enabled)
                continue;
            try {
                contributions.push({
                    producer,
                    clues: admitSemanticClues(observation, source.nativeText, producer.adapter(observation), (reason) => {
                        if (!producer.enabled)
                            return;
                        producer.enabled = false;
                        options.diagnostics?.ingress(source.observation, reason);
                        options.changed();
                    }),
                });
            }
            catch (error) {
                producer.enabled = false;
                options.diagnostics?.ingress(source.observation, 'producer-threw');
                options.changed();
                try {
                    options.reportFailure(error);
                }
                catch {
                }
            }
        }
        return contributions.filter(({ producer }) => producer.enabled);
    }
    function completeSource(observation: TextObservationRef): BitmapSemanticSource | null {
        const source = sources.get(observation);
        return source !== undefined &&
            source.text.length > 0 &&
            !source.rejected &&
            source.complete.values().some((producer) => producer.enabled)
            ? source
            : null;
    }
    function rejectSource(observation: TextObservationRef, reason = 'contradicted-by-bitmap-evidence'): void {
        const source = sources.get(observation);
        if (source === undefined || source.rejected)
            return;
        source.rejected = true;
        options.diagnostics?.reject(observation, { stage: 'clue', reason });
        withdrawPending(observation);
        options.changed();
    }
    return {
        enabled: () => producers.some((producer) => producer.enabled),
        activeCount: () => producers.filter((producer) => producer.enabled).length,
        sourceActive: (observation: TextObservationRef): boolean => {
            const source = sources.get(observation);
            return (source !== undefined &&
                !source.rejected &&
                !source.ambiguous &&
                producers.some((producer) => producer.enabled) &&
                (source.normalizers.size === 0 || source.normalizers.values().some((producer) => producer.enabled)));
        },
        disable(): void {
            for (const producer of producers)
                producer.enabled = false;
            for (const token of pending.keys())
                withdrawPending(token);
            options.changed();
        },
        observeSource(native: object, text: string, family: NativeTextObservation['family']): TextObservationRef | null {
            const previous = pendingByNative.get(native);
            if (previous !== undefined)
                withdrawPending(previous);
            pendingByNative.delete(native);
            if (!producers.some((producer) => producer.enabled) || text.length === 0 || text.length > 16384)
                return null;
            const observation = Object.freeze({}) as TextObservationRef;
            const source: SourceRecord = {
                observation,
                nativeText: text,
                text,
                template: copyTextTemplate({ sourceText: text, styleEnds: [text.length] }),
                spans: Object.freeze([Object.freeze({ kind: 'text', start: 0, end: text.length })]),
                normalizers: new Set(),
                ambiguous: false,
                family,
                native: new WeakRef(native),
                complete: new Set(),
                rejected: false,
                characters: null,
            };
            sources.set(observation, source);
            options.diagnostics?.source(source, 'pending');
            const snapshot = Object.freeze({ kind: 'source' as const, observation, family, text });
            const normalized = route(snapshot, source).flatMap(({ producer, clues }) => clues.flatMap((clue) => (clue.kind === 'normalized-source' ? [{ producer, clue }] : [])));
            const first = normalized[0]?.clue;
            if (first !== undefined) {
                source.ambiguous = normalized.some(({ clue }) => clue.spans.length !== first.spans.length ||
                    clue.spans.some((span, index) => {
                        const other = first.spans[index];
                        return other?.kind !== span.kind || other.start !== span.start || other.end !== span.end;
                    }));
                if (source.ambiguous)
                    options.diagnostics?.ingress(observation, 'conflicting-source-normalization');
                else {
                    source.spans = first.spans;
                    let matching = '';
                    const controls: {
                        offset: number;
                        kind: 'control' | 'pause';
                    }[] = [];
                    for (const span of source.spans) {
                        if (span.kind === 'text')
                            matching += text.slice(span.start, span.end);
                        else
                            controls.push({ offset: matching.length, kind: span.kind });
                    }
                    source.text = matching;
                    source.template = copyTextTemplate({
                        sourceText: matching,
                        styleEnds: [
                            ...new Set([
                                ...controls
                                    .map(({ offset }) => offset)
                                    .filter((offset) => offset > 0 && offset < matching.length),
                                ...(matching.length === 0 ? [] : [matching.length]),
                            ]),
                        ],
                        controls,
                    });
                    for (const { producer, clue } of normalized) {
                        source.normalizers.add(producer);
                        if (clue.complete)
                            source.complete.add(producer);
                    }
                }
            }
            options.diagnostics?.matching(observation, source.text);
            if (completeSource(observation) !== null && pending.size < BITMAP_LIMITS.associations) {
                pending.set(observation, source);
                pendingByNative.set(native, observation);
                options.lifetime.watch(source.native, observation, withdrawPending);
            }
            else {
                options.diagnostics?.complete(observation, source.complete.size > 0
                    ? 'pending-source-capacity-exceeded'
                    : plainSource(text)
                        ? 'no-complete-source-clue'
                        : 'source-normalization-unavailable');
                source.complete.clear();
            }
            if (source.complete.size > 0)
                options.diagnostics?.complete(observation, 'available');
            return observation;
        },
        issueDraw: (): BitmapDrawRef => Object.freeze({}) as BitmapDrawRef,
        copyDraw(draw: BitmapDrawRef, destination: object): BitmapDrawRef {
            const surface = surfaces.getOrInsertComputed(destination, () => Object.freeze({}) as BitmapSurfaceRef);
            const copied = Object.freeze({}) as BitmapDrawRef;
            copies.set(copied, { origin: copies.get(draw)?.origin ?? draw, surface });
            return copied;
        },
        copiedFrom(draw: BitmapDrawRef, surface: object): boolean {
            const copied = copies.get(draw), token = surfaces.get(surface);
            return (copied !== undefined &&
                token !== undefined &&
                (draws.get(copied.origin) ?? []).some((relation) => relation.surface === token));
        },
        observeDraw(observation: TextObservationRef, surface: object, entries: Extract<NativeTextObservation, {
            kind: 'draw';
        }>['draws'], allocation: Rect | null): void {
            const source = sources.get(observation);
            if (source === undefined || entries.length === 0 || entries.length > BITMAP_LIMITS.evidence)
                return;
            if (completeSource(observation) !== null &&
                entries.some((entry) => {
                    const native = entry.range;
                    const matching = native === null ? null : matchingSourceRange(source, native);
                    return (native === null ||
                        matching === null ||
                        !sameTextIgnoringWhitespace(source.nativeText.slice(native.start, native.end), entry.text) ||
                        !sameTextIgnoringWhitespace(source.text.slice(matching.start, matching.end), entry.text));
                }))
                rejectSource(observation);
            const surfaceRef = surfaces.getOrInsertComputed(surface, () => Object.freeze({}) as BitmapSurfaceRef);
            const snapshot = Object.freeze({
                kind: 'draw' as const,
                observation,
                family: source.family,
                surface: surfaceRef,
                draws: Object.freeze(entries.map((entry) => Object.freeze({
                    draw: entry.draw,
                    text: entry.text,
                    range: entry.range === null ? null : Object.freeze({ ...entry.range }),
                }))),
                allocation: allocation === null ? null : Object.freeze({ ...allocation }),
            });
            const batch = route(snapshot, source);
            const indexed = batch.map(({ producer, clues }) => {
                const ranges = new Map<BitmapDrawRef, TextRange[]>();
                for (const clue of clues) {
                    if (clue.kind !== 'ordered-members')
                        continue;
                    for (const member of clue.members) {
                        ranges.getOrInsertComputed(member.draw, () => []).push(member.range);
                    }
                }
                const areas = clues.filter((clue) => clue.kind === 'safe-area').map((clue) => clue.rect);
                return { producer, ranges, area: intersectSemanticAreas(areas) };
            });
            for (const entry of snapshot.draws) {
                const contributions: DrawContribution[] = [];
                for (const { producer, ranges, area } of indexed) {
                    const native = ranges.get(entry.draw)?.[0];
                    const range = native === undefined || source.ambiguous ? null : matchingSourceRange(source, native);
                    if (range !== null || area !== null)
                        contributions.push({ source, producer, range, area, surface: surfaceRef });
                }
                if (!draws.has(entry.draw))
                    draws.set(entry.draw, Object.freeze(contributions));
            }
            options.changed(surface);
        },
        provenance: (draw: BitmapDrawRef): readonly BitmapSemanticProvenance[] => {
            const copied = copies.get(draw);
            const contributions = copied === undefined
                ? (draws.get(draw) ?? [])
                : [
                    ...(draws.get(draw) ?? []),
                    ...(draws.get(copied.origin) ?? []).map((relation) => ({
                        ...relation,
                        surface: copied.surface,
                        area: null,
                    })),
                ];
            return contributions.filter((item) => item.producer.enabled &&
                !item.source.rejected &&
                !item.source.ambiguous &&
                (item.source.normalizers.size === 0 ||
                    item.source.normalizers.values().some((producer) => producer.enabled)));
        },
        completeSource,
        characters: (observation: TextObservationRef): BitmapSourceCharacterIndex | null => {
            const source = sources.get(observation);
            if (source === undefined)
                return null;
            return (source.characters ??= indexBitmapSourceCharacters(source.text, source.template.controls?.filter(({ kind }) => kind === 'pause').map(({ offset }) => offset)));
        },
        rejectSource,
        pendingSources(): readonly BitmapSemanticSource[] {
            for (const token of pending.keys())
                if (completeSource(token) === null)
                    withdrawPending(token);
            return [...pending.values()];
        },
        attached: withdrawPending,
        observeSourceChange(observation: TextObservationRef): void {
            const source = sources.get(observation);
            withdrawPending(observation);
            if (source === undefined || source.complete.size === 0)
                return;
            source.complete.clear();
            options.diagnostics?.complete(observation, 'native-source-changed');
            options.changed();
        },
        surfaceRef(surface: object): BitmapSurfaceRef | null {
            return surfaces.get(surface) ?? null;
        },
        dispose(): void {
            for (const producer of producers)
                producer.enabled = false;
            for (const token of pending.keys())
                withdrawPending(token);
            pendingByNative = new WeakMap();
            sources = new WeakMap();
            draws = new WeakMap();
            copies = new WeakMap();
            surfaces = new WeakMap();
        },
    };
}
export function intersectSemanticAreas(areas: readonly Rect[]): Rect | null {
    if (areas.length === 0)
        return null;
    const x = Math.max(...areas.map((area) => area.x)), y = Math.max(...areas.map((area) => area.y));
    const width = Math.min(...areas.map((area) => area.x + area.width)) - x;
    const height = Math.min(...areas.map((area) => area.y + area.height)) - y;
    return width > 0 && height > 0 ? Object.freeze({ x, y, width, height }) : null;
}
