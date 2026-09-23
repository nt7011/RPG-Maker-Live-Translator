import { bitmapCopiedCandidates, bitmapCopiedPredecessors, bitmapCopiedFieldPredecessors, completeSource, sameClue, sameContents, } from '../stores/bitmap-copied-associations.js';
import { prepareBitmapCopiedFields, planBitmapCopiedFields, type BitmapCopiedNativeFields, } from '../stores/bitmap-copied-fields.js';
import { bitmapSourceCorrespondence } from '../stores/bitmap-source-correspondence.js';
import { bitmapDemandContext } from '../stores/bitmap-translation-demand.js';
import { joinStyledText, textTemplate, type StyledText, type TextTemplate, type TextTranslation, } from '../stores/styled-text.js';
import { bitmapTextRevealEnd } from '../stores/bitmap-text-reveal.js';
import { prepareBitmapTargetText, bitmapTargetPrefix, type BitmapTargetText } from '../stores/bitmap-target-text.js';
import { timed, type RuntimeTiming } from '../runtime/diagnostic-timing.js';
import { BITMAP_LIMITS } from '../stores/bitmap-limits.js';
import type { RuntimeResourceObserver } from '../runtime/diagnostics-ingress.js';
import type { NativeLifetime } from '../runtime/native-lifetime.js';
import type { BitmapPixelDevice, PixelProof, PixelBounds } from '../gpu/bitmap-pixel-device.js';
import type { BitmapRenderBacking, BitmapRenderPlan, BitmapRenderReplacement, BitmapRenderUse, createBitmapRenderHost, } from './bitmap-render-host.js';
import { textOrigin, type BitmapContent } from '../stores/bitmap-content.js';
import { fragmentVertices, layoutBitmapCharacters, type BitmapCharacterRaster, type BitmapFragment, } from '../stores/bitmap-fragment-geometry.js';
import { createBitmapFragmentGroups, type BitmapFragmentGroup, type BitmapPhysicalMember, type VisibleBitmapFragmentGroup, } from '../stores/bitmap-fragment-groups.js';
import { bitmapCopiedEvidence, type BitmapCopiedField, type BitmapCopiedClueReader, type BitmapCopiedEvidence, } from '../stores/bitmap-fragment-clues.js';
import type { SemanticTextRevisionHandle } from '../stores/semantic-text-store.js';
import { bitmapTextSpacing, type BitmapTextMeasure } from '../stores/bitmap-text-layout.js';
import type { TextObservationRef, BitmapDrawRef } from '../semantic-adapters/contract.js';
interface Field extends BitmapCopiedField {
    source: StyledText;
    handle: SemanticTextRevisionHandle;
    target: BitmapTargetText | null;
}
type FieldRaster = BitmapCharacterRaster | {
    readonly preserveOriginal: true;
    readonly bounds: PixelBounds;
};
interface Occurrence {
    groups: readonly BitmapFragmentGroup[];
    members: readonly BitmapPhysicalMember[];
    contents: readonly BitmapContent[];
    fields: readonly Field[];
    clueVersion: number;
    translationRevision: number;
    closed: boolean;
    display: {
        surface: HTMLCanvasElement;
        backing: BitmapRenderBacking;
        regions: readonly PixelBounds[];
        rasters: readonly FieldRaster[];
        translationRevision: number;
        submitted: () => void;
        withdrawn: (() => void) | null;
    } | null;
    dirty: boolean;
    capacityRevision: number | null;
}
function markDirty(owner: Pick<Occurrence, 'dirty' | 'closed' | 'translationRevision'>): () => void {
    return () => {
        if (owner.closed)
            return;
        owner.translationRevision++;
        owner.dirty = true;
    };
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
    readonly availabilityRevision: () => number;
    readonly reconcile: (fields: readonly {
        readonly predecessor: SemanticTextRevisionHandle | null;
        readonly template: TextTemplate;
        readonly completeSource: TextObservationRef | null;
        readonly sources: readonly TextObservationRef[];
        readonly controlInvalidated: boolean;
    }[], retired: readonly SemanticTextRevisionHandle[], changed: () => void) => readonly SemanticTextRevisionHandle[];
    readonly release: (handle: SemanticTextRevisionHandle, sources: readonly TextObservationRef[]) => void;
    readonly translation: (handle: SemanticTextRevisionHandle) => TextTranslation | null;
    readonly proof: (proof: PixelProof, handles: readonly SemanticTextRevisionHandle[]) => () => void;
    readonly withdrawn?: (handles: readonly SemanticTextRevisionHandle[]) => void;
    readonly refused?: (handles: readonly SemanticTextRevisionHandle[], reason: string) => void;
    readonly measure: BitmapTextMeasure;
    readonly semantic?: BitmapCopiedClueReader & {
        readonly version: () => number;
        readonly invalidated: (draw: BitmapDrawRef) => boolean;
    };
}) {
    const occurrences = new Set<Occurrence>();
    const associations = new WeakMap<BitmapFragmentGroup, Occurrence>();
    const evidence = new WeakMap<BitmapFragmentGroup, {
        contents: readonly BitmapContent[];
        version: number;
        value: BitmapCopiedEvidence | null;
        partition: readonly BitmapCopiedField[] | null;
        native: BitmapCopiedNativeFields | null;
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
        if (display !== null && !occurrence.closed)
            display.withdrawn?.();
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
        withdraw(occurrence);
        for (const field of occurrence.fields)
            options.release(field.handle, field.clue?.sources.map((source) => source.observation) ?? []);
        occurrence.fields = [];
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
    function groupEvidence(item: VisibleBitmapFragmentGroup) {
        const reader = options.semantic;
        const old = evidence.get(item.group), version = semanticVersion();
        if (old?.contents === item.group.contents && old.version === version)
            return old;
        const native = old?.contents === item.group.contents
            ? old.native
            : item.group.baseline
                ? prepareBitmapCopiedFields(item.group.contents)
                : null;
        const correspondence = reader === undefined || native === null
            ? []
            : bitmapSourceCorrespondence(native.members.map((member) => ({
                text: member.text,
                relations: member.draw === undefined ? [] : reader.read(member.draw),
            })), reader.characters);
        const partition = planBitmapCopiedFields(item.group.contents, native, correspondence, reader);
        const value = reader === undefined || partition !== null
            ? null
            : bitmapCopiedEvidence(item.group.contents, reader, native === null ? undefined : correspondence);
        const result = { contents: item.group.contents, version, value, partition, native };
        evidence.set(item.group, result);
        return result;
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
        const version = semanticVersion();
        const available = new Set(visibleGroups.map((item) => item.group));
        const supplied = visibleGroups.filter((item) => {
            const old = associations.get(item.group);
            return old === undefined || old.groups.every((group) => group.closed || available.has(group));
        });
        const next = bitmapCopiedCandidates(supplied, new Map(supplied.map((item) => [item.group, groupEvidence(item)])), associations, options.semantic);
        const predecessors = bitmapCopiedPredecessors(next, occurrences, associations);
        const retainedPredecessors = new Set(predecessors);
        const touched = new Set(supplied.map((item) => item.group));
        for (const occurrence of [...occurrences])
            if (!retainedPredecessors.has(occurrence) &&
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
            const groups = candidate.visible.map((item) => item.group), contents = groups.flatMap((group) => group.contents), members = groups.flatMap((group) => group.members), fragments = candidate.visible.flatMap((item) => item.fragments);
            const changed = occurrence === undefined ||
                !sameContents(occurrence.contents, contents) ||
                occurrence.fields.length !== candidate.fields.length ||
                occurrence.fields.some((field, index) => {
                    const next = candidate.fields[index];
                    return field.start !== next?.start || field.end !== next.end || !sameClue(field.clue, next.clue);
                });
            if (occurrence === undefined) {
                occurrence = {
                    groups,
                    contents,
                    members,
                    fields: [],
                    clueVersion: version,
                    translationRevision: 0,
                    closed: false,
                    display: null,
                    dirty: true,
                    capacityRevision: null,
                };
                occurrences.add(occurrence);
            }
            if (changed) {
                withdraw(occurrence);
                if (isDisposed())
                    return closed;
                const oldFields = occurrence.fields;
                const oldMembers = occurrence.members;
                const predecessors = bitmapCopiedFieldPredecessors(oldFields, oldMembers, candidate.fields, members);
                const proposed = candidate.fields.map((field) => ({
                    ...field,
                    source: field.clue?.observed ??
                        joinStyledText(contents.slice(field.start, field.end).map((content) => textOrigin(content).source)),
                }));
                const retained = new Set(predecessors);
                const retired = oldFields.filter((field) => !retained.has(field)).map((field) => field.handle);
                let handles: readonly SemanticTextRevisionHandle[];
                try {
                    handles = options.reconcile(proposed.map((field, index) => ({
                        predecessor: predecessors[index]?.handle ?? null,
                        template: field.clue?.template ?? textTemplate(field.source),
                        completeSource: completeSource(field.clue),
                        sources: field.clue?.sources.map((source) => source.observation) ?? [],
                        controlInvalidated: contents
                            .slice(field.start, field.end)
                            .some((content) => textOrigin(content).evidence?.some((item) => item.draw !== undefined && options.semantic?.invalidated(item.draw)) === true),
                    })), retired, markDirty(occurrence));
                }
                catch (error) {
                    retire(occurrence);
                    for (const group of groups)
                        physical.retire(group);
                    throw error;
                }
                if (isDisposed() || occurrence.closed) {
                    for (const handle of handles)
                        options.release(handle, []);
                    return closed;
                }
                occurrence.groups = groups;
                occurrence.contents = contents;
                occurrence.members = members;
                occurrence.fields = proposed.map((field, index) => {
                    const handle = handles[index];
                    if (handle === undefined)
                        throw new Error('Missing copied field successor.');
                    return { ...field, handle, target: predecessors[index]?.target ?? null };
                });
                occurrence.dirty = true;
            }
            occurrence.clueVersion = version;
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
        if (version !== semanticVersion())
            return closed;
        const claimed = new Set(uses
            .filter((use) => {
            const group = physical.owner(use.owner)?.group;
            return group !== undefined && associations.has(group);
        })
            .map((use) => use.owner));
        const ready: {
            occurrence: Occurrence;
            fields: readonly Field[];
            handles: readonly SemanticTextRevisionHandle[];
            contents: readonly BitmapContent[];
            fragments: BitmapFragment[];
            rasters: readonly FieldRaster[];
            translationRevision: number;
        }[] = [];
        for (const { occurrence, fragments } of visible) {
            if (occurrence.capacityRevision !== null && occurrence.capacityRevision !== options.availabilityRevision())
                occurrence.dirty = true;
            if (!occurrence.dirty)
                continue;
            occurrence.dirty = false;
            occurrence.capacityRevision = null;
            withdraw(occurrence);
            if (isDisposed())
                return closed;
            const translationRevision = occurrence.translationRevision;
            const rasters: FieldRaster[] = [];
            const handles: SemanticTextRevisionHandle[] = [];
            let supported = true;
            for (const field of occurrence.fields) {
                const result = options.translation(field.handle);
                if (result === null || result.text === field.handle.sourceText) {
                    rasters.push(...occurrence.contents.slice(field.start, field.end).map((content) => ({
                        preserveOriginal: true as const,
                        bounds: { x: 0, y: 0, width: content.width, height: content.height },
                    })));
                    continue;
                }
                const clue = field.clue;
                const target = prepareBitmapTargetText(field.source, result, clue?.end ?? field.source.text.length, clue === null ? null : { template: clue.template, index: clue.index }, field.target);
                field.target = target;
                const translation = clue?.complete === true && target.reveal !== null
                    ? bitmapTargetPrefix(target.text, bitmapTextRevealEnd(target.reveal, clue.end))
                    : target.text;
                const laidOut = layoutBitmapCharacters(occurrence.members.slice(field.start, field.end), occurrence.contents.slice(field.start, field.end), clue === null ? translation : bitmapTextSpacing(translation), options.measure, clue?.positions, target.reveal?.sourcePositions);
                if (laidOut === null) {
                    supported = false;
                    break;
                }
                rasters.push(...laidOut);
                handles.push(field.handle);
            }
            if (occurrence.translationRevision !== translationRevision)
                continue;
            if (!supported && options.refused !== undefined) {
                const attempted = occurrence.fields
                    .filter((field) => {
                    const result = options.translation(field.handle);
                    return result !== null && result.text !== field.handle.sourceText;
                })
                    .map((field) => field.handle);
                options.refused(attempted, 'copied-text-layout-unavailable');
            }
            if (handles.length > 0 && supported)
                ready.push({
                    occurrence,
                    fields: occurrence.fields,
                    handles,
                    contents: occurrence.contents,
                    fragments,
                    rasters,
                    translationRevision,
                });
        }
        if (version !== semanticVersion())
            return closed;
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
                    item.occurrence.fields === item.fields &&
                    item.occurrence.contents === item.contents &&
                    item.occurrence.groups.every((group) => !group.closed) &&
                    item.occurrence.clueVersion === semanticVersion() &&
                    item.fragments.every((fragment) => options.currentContent(fragment.use.source) === fragment.content) &&
                    item.occurrence.translationRevision === item.translationRevision);
            }
            const unowned = new Set(results.flatMap((result) => ('surface' in result ? [result.surface] : [])));
            try {
                for (const [index, result] of results.entries()) {
                    if (isDisposed())
                        continue;
                    const item = ready[index], first = item?.fragments[0];
                    if (item === undefined || first === undefined || !current(item))
                        continue;
                    if ('refusal' in result) {
                        options.refused?.(item.handles, result.refusal);
                        item.occurrence.capacityRevision =
                            result.refusal === 'capacity' ? options.availabilityRevision() : null;
                        continue;
                    }
                    const backing = options.host.createBacking(result.surface, first.use, options.releaseDisplay.bind(null, result.surface));
                    let adopted = false;
                    try {
                        if (!current(item))
                            continue;
                        const submitted = options.proof(result.proof, item.handles);
                        if (!current(item))
                            continue;
                        item.occurrence.display = {
                            surface: result.surface,
                            backing,
                            regions: result.regions,
                            rasters: item.rasters,
                            translationRevision: item.translationRevision,
                            submitted,
                            withdrawn: options.withdrawn?.bind(undefined, item.handles) ?? null,
                        };
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
            if (item.occurrence.translationRevision !== display?.translationRevision)
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
                        item.occurrence.clueVersion === semanticVersion() &&
                        item.fragments.every((fragment) => options.currentContent(fragment.use.source) === fragment.content) &&
                        item.occurrence.translationRevision === item.display.translationRevision),
                submitted: () => {
                    for (const item of selected)
                        item.display.submitted();
                },
            },
        };
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
                if (occurrence.fields.some((field) => field.clue !== null)) {
                    const groups = occurrence.groups;
                    retire(occurrence);
                    for (const group of groups)
                        if (!group.baseline)
                            physical.retire(group);
                }
        },
        demand: (owner: object) => {
            const registration = physical.owner(owner);
            if (registration === undefined)
                return null;
            const occurrence = associations.get(registration.group);
            if (occurrence === undefined || occurrence.closed)
                return null;
            const member = occurrence.members.findIndex((member) => member.owner === registration.reference);
            const content = occurrence.contents[member];
            const field = occurrence.fields.find((field) => field.start <= member && member < field.end);
            if (content === undefined || field === undefined)
                return null;
            const root = textOrigin(content);
            return {
                handle: field.handle,
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
            .some((occurrence) => occurrence.fields.some((field) => completeSource(field.clue) === token)),
        prepare: timed(options.timing, 'fragment-admission', prepareOnce, ([uses]) => [uses.length, 0]),
        dispose,
    };
}
