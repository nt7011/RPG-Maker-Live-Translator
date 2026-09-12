import { bitmapDemandContext } from './bitmap-translation-demand.js';
import { bindTextTranslation, joinStyledText, textTemplate, sameTextPaint, type TextPaint, type StyledText, type TextTemplate, type TextTranslation, } from '../../stores/styled-text.js';
import { createBitmapTextReveal, bitmapTextRevealEnd, type BitmapTextReveal } from '../../stores/bitmap-text-reveal.js';
import { timed, type RuntimeTiming } from '../diagnostic-timing.js';
import { BITMAP_LIMITS } from '../../stores/bitmap-limits.js';
import type { RuntimeResourceObserver } from '../diagnostics-ingress.js';
import type { NativeLifetime } from '../native-lifetime.js';
import type { BitmapPixelDevice, PixelProof } from '../../gpu/bitmap-pixel-device.js';
import type { BitmapRenderBacking, BitmapRenderPlan, BitmapRenderReplacement, BitmapRenderUse, createBitmapRenderHost, } from '../../presentation/bitmap-render-host.js';
import { textOrigin, type BitmapContent } from '../../stores/bitmap-content.js';
import { fragmentVertices, supportsBitmapFragmentOrder, layoutBitmapCharacters, type BitmapCharacterRaster, type BitmapFragment, } from '../../stores/bitmap-fragment-geometry.js';
import { createBitmapFragmentGroups, type BitmapFragmentGroup, type BitmapPhysicalMember, type VisibleBitmapFragmentGroup, } from '../../stores/bitmap-fragment-groups.js';
import { bitmapCopiedClue, bitmapCopiedEvidence, type BitmapCopiedClue, type BitmapCopiedClueReader, type BitmapCopiedEvidence, } from '../../stores/bitmap-fragment-clues.js';
import type { SemanticTextRevisionHandle } from '../../stores/semantic-text-store.js';
import { bitmapTextSpacing, indexBitmapSourceCharacters, type BitmapTextMeasure, } from '../../stores/bitmap-text-layout.js';
import type { TextObservationRef } from '../../semantic-adapters/contract.js';
interface Occurrence {
    groups: readonly BitmapFragmentGroup[];
    members: readonly BitmapPhysicalMember[];
    contents: readonly BitmapContent[];
    source: StyledText;
    clue: BitmapCopiedClue | null;
    clueVersion: number;
    closed: boolean;
    handle: SemanticTextRevisionHandle;
    display: {
        surface: HTMLCanvasElement;
        backing: BitmapRenderBacking;
        regions: readonly {
            x: number;
            y: number;
            width: number;
            height: number;
        }[];
        rasters: readonly BitmapCharacterRaster[];
        submitted: () => void;
    } | null;
    target: {
        result: TextTranslation;
        text: StyledText;
        reveal: BitmapTextReveal | null;
        palette: readonly TextPaint[];
        paintEnds: readonly number[];
        bindingEnds: readonly number[];
        bindingComplete: boolean;
        coverage: number;
        semantic: boolean;
    } | null;
    dirty: boolean;
}
interface Candidate {
    readonly visible: readonly VisibleBitmapFragmentGroup[];
    readonly clue: BitmapCopiedClue | null;
}
function markDirty(owner: Pick<Occurrence, 'dirty' | 'closed'>): () => void {
    return () => {
        if (!owner.closed)
            owner.dirty = true;
    };
}
function sameGroups(occurrence: Occurrence, candidate: Candidate): boolean {
    return (occurrence.groups.length === candidate.visible.length &&
        occurrence.groups.every((group, index) => group === candidate.visible[index]?.group));
}
function sameContents(a: readonly BitmapContent[], b: readonly BitmapContent[]): boolean {
    return a.length === b.length && a.every((content, index) => content === b[index]);
}
export function createBitmapFragmentPresentation(options: {
    readonly timing?: RuntimeTiming | undefined;
    readonly lifetime: NativeLifetime;
    readonly resourceEvent?: RuntimeResourceObserver | undefined;
    readonly retain: (contents: readonly BitmapContent[]) => (() => void) | null;
    readonly releaseDisplay: (surface: HTMLCanvasElement) => void;
    readonly host: ReturnType<typeof createBitmapRenderHost>;
    readonly content: (source: HTMLCanvasElement) => BitmapContent | null;
    readonly capture: (content: BitmapContent) => boolean;
    readonly currentContent: (source: HTMLCanvasElement) => BitmapContent | null;
    readonly request: (predecessor: SemanticTextRevisionHandle | null, template: TextTemplate, changed: () => void, completeSource: TextObservationRef | null) => SemanticTextRevisionHandle;
    readonly release: (handle: SemanticTextRevisionHandle) => void;
    readonly translation: (handle: SemanticTextRevisionHandle) => TextTranslation | null;
    readonly proof: (proof: PixelProof, handle: SemanticTextRevisionHandle, rejected?: () => void) => () => void;
    readonly measure: BitmapTextMeasure;
    readonly semantic?: BitmapCopiedClueReader & {
        readonly version: () => number;
    };
}) {
    const occurrences = new Set<Occurrence>();
    const associations = new WeakMap<BitmapFragmentGroup, Occurrence>();
    const evidence = new WeakMap<BitmapFragmentGroup, {
        contents: readonly BitmapContent[];
        version: number;
        value: BitmapCopiedEvidence | null;
    }>();
    let disposed = false;
    function isDisposed(): boolean {
        return disposed;
    }
    const semanticVersion = () => options.semantic?.version() ?? 0;
    const closed = {
        claimed: new Set<object>(),
        plan: {
            replacements: [],
            isCurrent: () => false,
            submitted: () => {
            },
        },
    };
    function withdraw(occurrence: Occurrence): void {
        const display = occurrence.display;
        occurrence.display = null;
        if (display !== null)
            options.host.release(display.backing);
    }
    function retire(occurrence: Occurrence): void {
        if (occurrence.closed)
            return;
        occurrence.closed = true;
        occurrences.delete(occurrence);
        for (const group of occurrence.groups)
            if (associations.get(group) === occurrence)
                associations.delete(group);
        occurrence.groups = [];
        occurrence.members = [];
        occurrence.contents = [];
        occurrence.target = null;
        withdraw(occurrence);
        options.release(occurrence.handle);
    }
    const physical = createBitmapFragmentGroups({
        ...options,
        retired: (group, replacement) => {
            const occurrence = associations.get(group);
            if (occurrence === undefined)
                return;
            withdraw(occurrence);
            if (!replacement)
                retire(occurrence);
        },
    });
    function groupEvidence(item: VisibleBitmapFragmentGroup): BitmapCopiedEvidence | null {
        const reader = options.semantic;
        if (reader === undefined)
            return null;
        const old = evidence.get(item.group), version = semanticVersion();
        if (old?.contents === item.group.contents && old.version === version)
            return old.value;
        const value = bitmapCopiedEvidence(item.group.contents, reader);
        evidence.set(item.group, { contents: item.group.contents, version, value });
        return value;
    }
    function candidates(visible: readonly VisibleBitmapFragmentGroup[]): readonly Candidate[] {
        const proposals: Candidate[] = [];
        const reader = options.semantic;
        if (reader !== undefined) {
            const sources = new Map<TextObservationRef, {
                item: VisibleBitmapFragmentGroup;
                value: BitmapCopiedEvidence;
            }[]>();
            for (const item of visible) {
                const value = groupEvidence(item);
                if (value === null)
                    continue;
                sources.getOrInsertComputed(value.source.observation, () => []).push({ item, value });
            }
            for (const entries of sources.values()) {
                entries.sort((a, b) => a.value.start - b.value.start);
                const selected = entries.map((entry) => entry.item);
                if (selected.length === 1 &&
                    selected[0]?.group.members.length === 1 &&
                    selected[0].group.contents[0]?.kind === 'text')
                    continue;
                const clue = bitmapCopiedClue(selected.flatMap((item) => item.group.contents), reader);
                if (clue === null)
                    continue;
                const candidate = { visible: selected, clue };
                const old = selected[0] === undefined ? undefined : associations.get(selected[0].group);
                const unchanged = old !== undefined &&
                    sameGroups(old, candidate) &&
                    sameContents(old.contents, selected.flatMap((item) => item.group.contents));
                if (!unchanged && !supportsBitmapFragmentOrder(selected.flatMap((item) => item.fragments)))
                    continue;
                proposals.push(candidate);
            }
        }
        const claimed = new Set(proposals.flatMap((candidate) => candidate.visible.map((item) => item.group)));
        return [
            ...proposals,
            ...visible
                .filter((item) => item.group.baseline && !claimed.has(item.group))
                .map((item) => ({ visible: [item], clue: null })),
        ];
    }
    function prepareOnce(uses: readonly BitmapRenderUse[], compose: (requests: Parameters<BitmapPixelDevice['compose']>[0], claimed: ReadonlySet<object>) => ReturnType<BitmapPixelDevice['compose']>): {
        plan: BitmapRenderPlan;
        claimed: ReadonlySet<object>;
    } {
        if (isDisposed())
            return closed;
        const visibleGroups = physical.prepare(uses);
        if (isDisposed())
            return closed;
        const available = new Set(visibleGroups.map((item) => item.group));
        const supplied = visibleGroups.filter((item) => {
            const old = associations.get(item.group);
            return old === undefined || old.groups.every((group) => group.closed || available.has(group));
        });
        const next = candidates(supplied);
        const predecessors = next.map((candidate) => {
            const members = candidate.visible.flatMap((item) => item.group.members);
            const matches = [...occurrences].filter((old) => {
                if (sameGroups(old, candidate)) {
                    return ((old.clue?.complete !== true && candidate.clue?.complete !== true) ||
                        (old.clue?.complete === true &&
                            candidate.clue?.complete === true &&
                            old.clue.end <= candidate.clue.end &&
                            old.clue.source.observation === candidate.clue.source.observation));
                }
                return (old.clue?.complete === true &&
                    candidate.clue?.complete === true &&
                    old.clue.end <= candidate.clue.end &&
                    old.clue.source.observation === candidate.clue.source.observation &&
                    old.members.every((member) => members.some((next) => next.owner === member.owner)));
            });
            return matches.length === 1 ? (matches[0] ?? null) : null;
        });
        for (let index = 0; index < predecessors.length; index++) {
            const old = predecessors[index];
            if (old !== null && predecessors.filter((other) => other === old).length > 1)
                for (let next = index; next < predecessors.length; next++)
                    if (predecessors[next] === old)
                        predecessors[next] = null;
        }
        const touched = new Set(supplied.map((item) => item.group));
        for (const occurrence of [...occurrences])
            if (!predecessors.includes(occurrence) &&
                occurrence.groups.some((group) => group.closed || touched.has(group)))
                retire(occurrence);
        const visible: {
            occurrence: Occurrence;
            fragments: BitmapFragment[];
        }[] = [];
        for (const [index, candidate] of next.entries()) {
            if (!candidate.visible.every((item) => physical.register(item.group, item.fragments)))
                continue;
            if (isDisposed())
                return closed;
            let occurrence = predecessors[index] ?? undefined;
            const groups = candidate.visible.map((item) => item.group), contents = groups.flatMap((group) => group.contents), members = groups.flatMap((group) => group.members), fragments = candidate.visible.flatMap((item) => item.fragments), clue = candidate.clue;
            const changed = occurrence === undefined ||
                !sameContents(occurrence.contents, contents) ||
                occurrence.clue?.source.observation !== clue?.source.observation ||
                occurrence.clue?.complete !== clue?.complete ||
                occurrence.clue?.end !== clue?.end;
            if (occurrence === undefined) {
                const created: Omit<Occurrence, 'handle'> = {
                    groups,
                    contents,
                    members,
                    clue,
                    clueVersion: semanticVersion(),
                    source: clue?.observed ?? joinStyledText(contents.map((content) => textOrigin(content).source)),
                    closed: false,
                    display: null,
                    dirty: true,
                    target: null,
                };
                const template = clue?.template ?? textTemplate(created.source);
                let handle: SemanticTextRevisionHandle;
                try {
                    handle = options.request(null, template, markDirty(created), clue?.complete === true ? clue.source.observation : null);
                }
                catch (error) {
                    created.closed = true;
                    for (const group of groups)
                        physical.retire(group);
                    throw error;
                }
                if (isDisposed()) {
                    created.closed = true;
                    options.release(handle);
                    return closed;
                }
                occurrence = Object.assign(created, { handle });
                occurrences.add(occurrence);
            }
            else if (changed) {
                withdraw(occurrence);
                if (isDisposed())
                    return closed;
                occurrence.groups = groups;
                occurrence.contents = contents;
                occurrence.members = members;
                occurrence.clue = clue;
                occurrence.source =
                    clue?.observed ?? joinStyledText(contents.map((content) => textOrigin(content).source));
                const template = clue?.template ?? textTemplate(occurrence.source);
                occurrence.handle = options.request(occurrence.handle, template, markDirty(occurrence), clue?.complete === true ? clue.source.observation : null);
                if (isDisposed()) {
                    options.release(occurrence.handle);
                    return closed;
                }
                occurrence.dirty = true;
            }
            occurrence.clueVersion = semanticVersion();
            for (const group of groups)
                associations.set(group, occurrence);
            const first = fragments[0];
            if (first === undefined)
                continue;
            const keys = Object.keys(first.use.sampling);
            if (!fragments.every((fragment) => Object.keys(fragment.use.sampling).length === keys.length &&
                keys.every((key) => fragment.use.sampling[key] === first.use.sampling[key])))
                continue;
            if (occurrence.display !== null && !options.host.accepts(occurrence.display.backing, first.use)) {
                withdraw(occurrence);
                occurrence.dirty = true;
            }
            visible.push({ occurrence, fragments });
        }
        for (const item of supplied)
            if (!item.group.baseline && !associations.has(item.group))
                physical.retire(item.group);
        const claimed = new Set(uses
            .filter((use) => {
            const group = physical.owner(use.owner);
            return group !== undefined && associations.has(group);
        })
            .map((use) => use.owner));
        const ready: {
            occurrence: Occurrence;
            handle: SemanticTextRevisionHandle;
            contents: readonly BitmapContent[];
            fragments: BitmapFragment[];
            rasters: readonly BitmapCharacterRaster[];
        }[] = [];
        for (const { occurrence, fragments } of visible) {
            if (!occurrence.dirty)
                continue;
            withdraw(occurrence);
            if (isDisposed())
                return closed;
            const result = options.translation(occurrence.handle);
            if (result === null || result.text === occurrence.handle.sourceText)
                continue;
            let target = occurrence.target;
            if (target?.result !== result ||
                target.semantic !== (occurrence.clue !== null) ||
                target.palette.length !== occurrence.source.runs.length ||
                (!target.bindingComplete &&
                    target.coverage !== (occurrence.clue?.end ?? occurrence.source.text.length)) ||
                target.paintEnds.some((end, index) => index !== occurrence.source.runs.length - 1 && end !== occurrence.source.runs[index]?.end) ||
                target.palette.some((paint, index) => {
                    const run = occurrence.source.runs[index];
                    return run === undefined || !sameTextPaint(paint, run.paint);
                })) {
                const bindingEnds = target?.result === result
                    ? target.bindingEnds
                    : indexBitmapSourceCharacters(result.text).drawableEnds;
                const clue = occurrence.clue;
                const bound = bindTextTranslation(result, occurrence.source, clue === null
                    ? undefined
                    : {
                        template: clue.template,
                        sourceEnds: clue.index.drawableEnds,
                        targetEnds: bindingEnds,
                    });
                const reveal = target?.result === result
                    ? target.reveal
                    : clue === null
                        ? null
                        : createBitmapTextReveal(clue.template, result, clue.index);
                target = {
                    result,
                    bindingEnds,
                    bindingComplete: bound.text === result.text,
                    coverage: occurrence.clue?.end ?? occurrence.source.text.length,
                    paintEnds: occurrence.source.runs.map((run) => run.end),
                    palette: occurrence.source.runs.map((run) => run.paint),
                    semantic: occurrence.clue !== null,
                    text: bound,
                    reveal,
                };
                occurrence.target = target;
            }
            let translation = target.text;
            const clue = occurrence.clue;
            if (clue?.complete === true && target.reveal !== null) {
                const end = bitmapTextRevealEnd(target.reveal, clue.end);
                if (end < translation.text.length)
                    translation = {
                        text: translation.text.slice(0, end),
                        runs: translation.runs
                            .filter((_, index) => (translation.runs[index - 1]?.end ?? 0) < end)
                            .map((run) => ({ ...run, end: Math.min(end, run.end) })),
                    };
            }
            const rasters = layoutBitmapCharacters(occurrence.members, occurrence.contents, clue === null ? translation : bitmapTextSpacing(translation), options.measure, clue?.positions, target.reveal?.sourcePositions);
            if (rasters === null && clue !== null) {
                options.semantic?.contradict(clue.source.observation);
                return closed;
            }
            if (rasters !== null)
                ready.push({
                    occurrence,
                    handle: occurrence.handle,
                    contents: occurrence.contents,
                    fragments,
                    rasters,
                });
        }
        {
            const results = compose(ready.map((item) => ({
                members: item.fragments.map((fragment, index) => {
                    const raster = item.rasters[index];
                    if (raster === undefined)
                        throw new Error('Missing character raster.');
                    return { source: fragment.use.source, content: fragment.content, ...raster };
                }),
            })), claimed);
            function current(item: (typeof ready)[number]): boolean {
                return (!isDisposed() &&
                    occurrences.has(item.occurrence) &&
                    item.occurrence.handle === item.handle &&
                    item.occurrence.contents === item.contents &&
                    item.occurrence.groups.every((group) => !group.closed) &&
                    (item.occurrence.clue === null || item.occurrence.clueVersion === semanticVersion()) &&
                    item.fragments.every((fragment) => options.currentContent(fragment.use.source) === fragment.content));
            }
            const unowned = new Set(results.flatMap((result) => (result === null ? [] : [result.surface])));
            try {
                for (const [index, result] of results.entries()) {
                    if (isDisposed())
                        continue;
                    const item = ready[index], first = item?.fragments[0];
                    if (item === undefined || first === undefined || !current(item))
                        continue;
                    if (result === null) {
                        const token = item.occurrence.clue?.source.observation;
                        if (token !== undefined)
                            options.semantic?.contradict(token);
                        continue;
                    }
                    const backing = options.host.createBacking(result.surface, first.use, options.releaseDisplay.bind(null, result.surface));
                    let adopted = false;
                    try {
                        if (!current(item))
                            continue;
                        const token = item.occurrence.clue?.source.observation;
                        const submitted = options.proof(result.proof, item.handle, token === undefined
                            ? undefined
                            : () => {
                                if (current(item) && item.occurrence.display?.surface === result.surface)
                                    options.semantic?.contradict(token);
                            });
                        if (!current(item))
                            continue;
                        item.occurrence.display = {
                            surface: result.surface,
                            backing,
                            regions: result.regions,
                            rasters: item.rasters,
                            submitted,
                        };
                        item.occurrence.dirty = false;
                        adopted = true;
                        unowned.delete(result.surface);
                    }
                    finally {
                        if (!adopted)
                            options.host.release(backing);
                    }
                }
            }
            finally {
                for (const surface of unowned)
                    options.releaseDisplay(surface);
            }
        }
        const selected = visible.flatMap((item) => {
            const display = item.occurrence.display;
            if (display === null)
                return [];
            const replacements: BitmapRenderReplacement[] = [];
            for (const [index, fragment] of item.fragments.entries()) {
                const raster = display.rasters[index], region = display.regions[index];
                const vertices = raster === undefined ? null : fragmentVertices(fragment, raster.bounds);
                if (vertices === null || region === undefined)
                    return [];
                replacements.push({ use: fragment.use, backing: display.backing, region, vertices });
            }
            return [{ ...item, display, replacements }];
        });
        const replacements = selected.flatMap((item) => item.replacements);
        return {
            claimed,
            plan: {
                replacements,
                isCurrent: () => !disposed &&
                    selected.every((item) => item.occurrence.display === item.display &&
                        item.occurrence.groups.every((group) => !group.closed) &&
                        (item.occurrence.clue === null || item.occurrence.clueVersion === semanticVersion()) &&
                        item.fragments.every((fragment) => options.currentContent(fragment.use.source) === fragment.content)),
                submitted: () => {
                    for (const item of selected)
                        item.display.submitted();
                },
            },
        };
    }
    function prepare(uses: readonly BitmapRenderUse[], compose: Parameters<typeof prepareOnce>[1]) {
        let version: number;
        let result: ReturnType<typeof prepareOnce>;
        do {
            version = semanticVersion();
            result = prepareOnce(uses, compose);
        } while (!isDisposed() && version !== semanticVersion());
        return result;
    }
    function dispose(): void {
        disposed = true;
        for (const occurrence of [...occurrences])
            retire(occurrence);
        physical.dispose();
    }
    return {
        reportResources: () => options.resourceEvent?.({
            kind: 'usage',
            name: 'occurrences',
            value: occurrences.size,
            limit: BITMAP_LIMITS.occurrences,
        }),
        revokeClues: () => {
            for (const occurrence of [...occurrences])
                if (occurrence.clue !== null) {
                    const groups = occurrence.groups;
                    retire(occurrence);
                    for (const group of groups)
                        if (!group.baseline)
                            physical.retire(group);
                }
        },
        demand: (owner: object) => {
            const group = physical.owner(owner);
            const occurrence = group === undefined ? undefined : associations.get(group);
            if (occurrence === undefined || occurrence.closed)
                return null;
            const member = occurrence.members.findIndex((member) => member.owner.deref() === owner);
            const content = occurrence.contents[member];
            if (content === undefined)
                return null;
            const root = textOrigin(content);
            return {
                handle: occurrence.handle,
                pieces: root.regions.map((region) => ({
                    member: region,
                    context: bitmapDemandContext(region.draw === undefined ? [] : (options.semantic?.read(region.draw) ?? [])),
                    region: {
                        x: (region.x * content.width) / root.width,
                        y: (region.y * content.height) / root.height,
                        width: (region.width * content.width) / root.width,
                        height: (region.height * content.height) / root.height,
                    },
                })),
                changed: markDirty(occurrence),
            };
        },
        hasCompleteSource: (token: TextObservationRef) => occurrences
            .values()
            .some((occurrence) => occurrence.clue?.complete === true && occurrence.clue.source.observation === token),
        prepare: timed(options.timing, 'fragment-admission', prepare, ([uses]) => [uses.length, 0]),
        dispose,
    };
}
