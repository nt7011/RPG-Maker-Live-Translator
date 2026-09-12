import { resolveBitmapSourceGeometry, sameBitmapRow } from '../../stores/bitmap-line-geometry.js';
import { textTemplate } from '../../stores/styled-text.js';
import { createTextRecordsPublication } from '../text-records.js';
import { acceptBitmapGrowingText, closeBitmapGrowingText, continuesBitmapGrowingText, supportsBitmapGrowingText, type BitmapGrowingText, } from '../../stores/bitmap-growing-text.js';
import type { SemanticAdapter, TextObservationRef } from '../../semantic-adapters/contract.js';
import { createBitmapSemanticDiagnostics } from '../../stores/bitmap-semantic-diagnostics.js';
import { createBitmapSemanticClues, type BitmapSemanticSource } from '../../stores/bitmap-semantic-clues.js';
import { layoutBitmapAssociation, supportsBitmapAssociation, type BitmapAssociationLayout, } from '../../stores/bitmap-association-layout.js';
import { createSemanticTextObserver } from '../../observer-hooks/semantic-text-observer.js';
import type { BitmapTextDraw } from '../../stores/bitmap-text-layout.js';
import { BITMAP_LIMITS } from '../../stores/bitmap-limits.js';
import { captureRuntimeTiming, timed } from '../diagnostic-timing.js';
import { observeBitmapCaptureAbort } from '../bitmap-capture-diagnostics.js';
import type { RuntimeResourceObserver } from '../diagnostics-ingress.js';
import { createNativeLifetime } from '../native-lifetime.js';
import { createBitmapContentStore, textOrigin } from '../../stores/bitmap-content.js';
import { prepareBitmapCopiedRows, type BitmapCopiedRows } from '../../stores/bitmap-copied-rows.js';
import { createBitmapFragmentPresentation } from './bitmap-fragment-presentation.js';
import { createBitmapPixelDevice, type BitmapPixelDevice, type PixelCapture, type PixelProof, type PixelProofFailure, type PixelGroupProof, type PixelBounds, type PixelEffect, } from '../../gpu/bitmap-pixel-device.js';
import { installBitmapCommandObserver, createBitmapSourceReader, type BitmapTextCommand, type BitmapCanvasWrite, } from '../../observer-hooks/bitmap/bitmap-command-observer.js';
import { locateProperty, type OwnedHookDisposal, type OwnedHookLease, type OwnedHookSpec, } from '../../observer-hooks/owned-hook-installer.js';
import { createBitmapRenderHost, type BitmapRenderBacking, type BitmapRenderUse, type BitmapDemandUse, } from '../../presentation/bitmap-render-host.js';
import { assembleBitmapCommandRows, boundsIntersect, type BitmapCommandAtom, type BitmapTextBarriers, } from '../../stores/bitmap-command-rows.js';
import { assembleBitmapTextAssociations, bitmapAssociationPredecessors, bitmapSemanticCandidates, type BitmapTextAssociation, } from '../../stores/bitmap-text-associations.js';
import { createSemanticTextStore, type SemanticTextChangeSet, type SemanticTranslationAttempt, type SemanticTextRevisionHandle, } from '../../stores/semantic-text-store.js';
import { createSemanticTextTranslationHandoff } from './semantic-text-translation.js';
import { createBitmapTranslationDemand, bitmapRegionsVisible, bitmapDemandContext, type BitmapTranslationDemand, } from './bitmap-translation-demand.js';
import type { RuntimeDiagnosticFact, RuntimeDiagnosticsIngress } from '../diagnostics-ingress.js';
import type { TranslationManagerService } from '../translation-manager/manager.js';
import { commitDescriptorTransaction, compensateDescriptorTransaction, createOwnDataDescriptorShadowUpdate, type DescriptorTransactionUpdate, } from '../descriptor-transaction.js';
export interface BitmapCoreLifetimeLease {
    readonly dispose: () => OwnedHookDisposal;
}
export interface BitmapCoreOptions {
    readonly scope: Record<PropertyKey, unknown>;
    readonly coreGeneration: number;
    readonly diagnostics: RuntimeDiagnosticsIngress;
    readonly translationService: Pick<TranslationManagerService, 'requestBatch'>;
    readonly reportFailure: (failure: unknown) => void;
    readonly claimLifetimeOwner: (lease: BitmapCoreLifetimeLease) => void;
    readonly semanticAdapters?: readonly SemanticAdapter[];
    readonly nativeHooks?: readonly OwnedHookSpec[];
}
interface Association extends BitmapTextAssociation {
    readonly handle: SemanticTextRevisionHandle;
    readonly growing: BitmapGrowingText | null;
    layoutCache: BitmapAssociationLayout | null;
}
interface PendingTemplate {
    readonly source: BitmapSemanticSource;
    readonly handle: SemanticTextRevisionHandle;
    changed: (() => void) | null;
}
interface DisplayProof {
    facts: readonly RuntimeDiagnosticFact[];
    visible: boolean | null;
    submitted: boolean;
    rejected: ((groups: readonly PixelGroupProof[] | undefined) => void) | null;
    failure?: PixelProofFailure | null;
    groups?: readonly PixelGroupProof[];
}
interface SourceState {
    readonly id: number;
    bitmap: WeakRef<object> | null;
    readonly source: WeakRef<HTMLCanvasElement>;
    closed: boolean;
    width: number;
    height: number;
    epoch: number;
    atoms: BitmapCommandAtom[];
    associations: readonly Association[];
    backing: BitmapRenderBacking | null;
    display: HTMLCanvasElement | null;
    proof: DisplayProof | null;
    dirty: boolean;
    observed: boolean;
    retryOnUse: boolean;
    rejectionEpoch: number;
}
interface Capture {
    readonly state: SourceState;
    readonly y: number;
    readonly lineHeight: number;
    readonly token: PixelCapture;
    readonly commands: Pick<BitmapCommandAtom, 'text' | 'layout' | 'geometry' | 'sequence' | 'draw'>[];
    bounds: PixelBounds | null;
    valid: boolean;
}
function object(value: unknown, label: string): object {
    if ((typeof value !== 'object' || value === null) && typeof value !== 'function')
        throw new TypeError(`${label} is unavailable.`);
    return value;
}
function prototype(scope: Record<PropertyKey, unknown>, key: string): object {
    return object(Reflect.get(object(scope[key], key), 'prototype'), `${key}.prototype`);
}
export function installBitmapCore(options: BitmapCoreOptions): void {
    const { scope, coreGeneration, diagnostics } = options;
    const timing = captureRuntimeTiming(diagnostics, coreGeneration);
    const abort = observeBitmapCaptureAbort(diagnostics.acceptBitmapTextRejection, coreGeneration, abortCapture);
    function resourceObserver(accept: RuntimeDiagnosticsIngress['acceptResourceEvent']): RuntimeResourceObserver | undefined {
        return accept === undefined
            ? undefined
            : (event) => {
                try {
                    accept(coreGeneration, event);
                }
                catch {
                }
            };
    }
    const resourceEvent = resourceObserver(diagnostics.acceptResourceEvent);
    const probeEvent = resourceObserver(diagnostics.acceptResourceProbeEvent);
    const bitmapPrototype = prototype(scope, 'Bitmap'), canvasPrototype = prototype(scope, 'HTMLCanvasElement'), contextPrototype = prototype(scope, 'CanvasRenderingContext2D');
    const sceneManager = object(scope['SceneManager'], 'SceneManager');
    const pixi = object(scope['PIXI'], 'PIXI');
    const renderBoundary = typeof locateProperty(sceneManager, 'renderScene')?.descriptor.value === 'function'
        ? { target: sceneManager, key: 'renderScene', accepts: (receiver: unknown) => receiver === sceneManager }
        : {
            target: object(Reflect.get(object(Reflect.get(pixi, 'Application'), 'PIXI.Application'), 'prototype'), 'PIXI.Application.prototype'),
            key: 'render',
            accepts: (receiver: unknown) => receiver === (scope['Graphics'] as Record<string, unknown> | undefined)?.['_app'],
        };
    const document = object(scope['document'], 'document');
    const createElement = Reflect.get(document, 'createElement') as (tag: string) => HTMLCanvasElement;
    const Offscreen = scope['OffscreenCanvas'] as new (width: number, height: number) => OffscreenCanvas;
    if (typeof createElement !== 'function' || typeof Offscreen !== 'function')
        throw new Error('Synchronous GPU publication is unavailable.');
    const resolveSource = createBitmapSourceReader(bitmapPrototype, canvasPrototype);
    const host = createBitmapRenderHost({
        timing,
        pixi,
        acceptsSource: (source) => bySource.has(source) || content.has(source),
        observe: (source, reason) => {
            const state = bySource.get(source);
            if (state === undefined || !isActive())
                return;
            state.observed = true;
            probeEvent?.({ kind: 'probe-source', id: state.id, action: 'sampled' });
            if (reason === null || state.rejectionEpoch === state.epoch)
                return;
            state.rejectionEpoch = state.epoch;
            for (const row of assembleBitmapCommandRows(state.atoms))
                diagnostics.acceptBitmapTextRejection?.({
                    stage: 'physical',
                    reason,
                    sourceText: row.source.text.slice(0, 256),
                    sourceTruncated: row.source.text.length > 256,
                });
        },
        prepare: timed(timing, 'render-preparation', prepareBatch, ([uses]) => [uses.length, 0]),
        reportFailure: failure,
        demand: observeDemand,
        releaseOutput: (output) => {
            priorities.releaseOutput(output);
            for (const value of demand.values()) {
                if (!value.outputs.delete(output))
                    continue;
                for (const key of value.outputs.keys())
                    value.outputs.set(key, null);
            }
        },
    });
    const semantic = createSemanticTextStore();
    const priorities = createBitmapTranslationDemand({
        isCurrent: semantic.isCurrent,
        presentationChanged: () => {
            textRecords.changed();
        },
        changed: (handles) => {
            translations.reconcileDemand(handles);
        },
    });
    const textRecords = createTextRecordsPublication({
        scope,
        generation: coreGeneration,
        store: semantic,
        onScreenGameMessages: priorities.onScreenGameMessages,
    });
    const translations = createSemanticTextTranslationHandoff({
        requester: options.translationService,
        coreGeneration,
        diagnostics,
        readPriority: priorities.priority,
        requestChanged: semantic.setRequest,
        exchangeChanged: semantic.setTranslatorExchange,
    });
    const lifetime = createNativeLifetime(failure, probeEvent);
    const states = new Set<SourceState>();
    const byBitmap = new WeakMap<object, SourceState>(), bySource = new WeakMap<HTMLCanvasElement, SourceState>();
    const pendingProofs = new Map<PixelProof, DisplayProof>();
    const regionOccurrences = new WeakMap<object, WeakMap<object, object>>();
    function regionOccurrence(driver: object, member: object): object {
        return regionOccurrences
            .getOrInsertComputed(driver, () => new WeakMap())
            .getOrInsertComputed(member, () => Object.freeze({}));
    }
    const pendingTemplates = new Map<TextObservationRef, PendingTemplate>();
    const renderEpochs = new Map<SourceState, number>();
    const demand = new Map<SemanticTextRevisionHandle, {
        outputs: Map<number, boolean | null>;
        episode: object;
    }>();
    let gpu: BitmapPixelDevice | null = null, observer: OwnedHookLease | null = null, publication: DescriptorTransactionUpdate | null = null;
    let active = false, disposed = false, disposing = false, flushing = false;
    let nextId = 1, clueVersion = 0, sequence = 0, displayRevision = 0, retainedAtoms = 0;
    const batches = new Map<SourceState, Capture>(), captures = new Map<BitmapTextCommand, Capture>();
    let pendingCopiedAtoms = 0;
    const copiedReservations = new Map<BitmapCopiedRows, number>();
    const textBarriers = new WeakMap<HTMLCanvasElement, BitmapTextBarriers>();
    const growingRequests = new WeakMap<SemanticTextRevisionHandle, BitmapGrowingText>();
    const semanticDiagnostics = diagnostics.accept === undefined || !options.semanticAdapters?.length
        ? undefined
        : createBitmapSemanticDiagnostics();
    const clues = options.semanticAdapters?.length
        ? createBitmapSemanticClues({
            adapters: options.semanticAdapters.map((adapter) => adapter.observe),
            lifetime,
            changed: (surface) => {
                clueVersion++;
                if (surface === undefined)
                    fragments.revokeClues();
                const selected = surface === undefined
                    ? states
                    : [...states].filter((state) => state === bySource.get(surface as HTMLCanvasElement) ||
                        state.atoms.some((atom) => atom.draw !== undefined && clues?.copiedFrom(atom.draw, surface) === true));
                for (const state of selected) {
                    state.dirty = true;
                    withdraw(state);
                }
            },
            reportFailure: options.reportFailure,
            ...(semanticDiagnostics === undefined ? {} : { diagnostics: semanticDiagnostics }),
        })
        : null;
    const semanticObserver = clues === null
        ? null
        : createSemanticTextObserver({
            scope,
            adapters: options.semanticAdapters ?? [],
            clues,
            reportFailure: options.reportFailure,
            ...(semanticDiagnostics === undefined ? {} : { diagnostics: semanticDiagnostics }),
        });
    function probeSource(state: SourceState, action = 'updated'): void {
        if (probeEvent === undefined || state.closed)
            return;
        try {
            const effects = new Set(state.atoms.flatMap((atom) => (atom.effect === null ? [] : [atom.effect])));
            const statuses = state.associations.map((row) => semantic.read(row.handle)?.state);
            probeEvent({
                kind: 'probe-source',
                id: state.id,
                action,
                values: [
                    state.width,
                    state.height,
                    state.epoch,
                    state.atoms.length,
                    state.associations.length,
                    effects.size,
                    effects.values().reduce((sum, effect) => sum + (gpu?.effectBytes(effect) ?? 0), 0),
                    state.display === null ? 0 : state.display.width * state.display.height * 4,
                    Number(state.dirty),
                    Number(state.observed),
                    statuses.filter((status) => status === 'translating').length,
                    statuses.filter((status) => status === 'available').length,
                    state.atoms.filter((atom) => atom.effect === null).length,
                ],
                text: state.atoms
                    .slice(0, 3)
                    .map((atom) => atom.text.slice(0, 32))
                    .join(''),
                ...(action === 'created' ? { site: (new Error().stack ?? 'unavailable').slice(0, 2048) } : {}),
            });
        }
        catch {
        }
    }
    function probeCensus(): void {
        if (probeEvent === undefined)
            return;
        probeEvent({
            kind: 'probe-census',
            values: [
                states.size,
                retainedAtoms,
                captures.size,
                batches.size,
                batches.values().reduce((sum, batch) => sum + batch.commands.length, 0),
            ],
        });
    }
    function retireBitmap(state: SourceState): void {
        retire(state, 'gc-bitmap');
    }
    function retireCanvas(state: SourceState): void {
        retire(state, 'gc-canvas');
    }
    function rejectCopy(reason: string, atoms: readonly Pick<BitmapCommandAtom, 'text'>[]): void {
        const sink = diagnostics.acceptBitmapTextRejection;
        if (sink === undefined || atoms.length === 0)
            return;
        try {
            let sourceText = '', sourceTruncated = false;
            for (const [index, atom] of atoms.entries()) {
                const room = 256 - sourceText.length;
                sourceText += atom.text.slice(0, room);
                if (atom.text.length > room || (sourceText.length === 256 && index + 1 < atoms.length)) {
                    sourceTruncated = true;
                    break;
                }
            }
            sink({
                stage: 'physical',
                reason,
                sourceText,
                sourceTruncated,
                fields: [{ name: 'commandCount', value: atoms.length }],
            });
        }
        catch {
        }
    }
    function releaseCopyReservation(copy: BitmapCopiedRows): void {
        const count = copiedReservations.get(copy);
        if (count === undefined)
            return;
        copiedReservations.delete(copy);
        pendingCopiedAtoms -= count;
    }
    function ownRowCopy(rows: BitmapCopiedRows, count: number): BitmapCopiedRows {
        const copy: BitmapCopiedRows = Object.freeze({
            ...rows,
            release: () => {
                releaseCopyReservation(copy);
                rows.release();
            },
        });
        copiedReservations.set(copy, count);
        return copy;
    }
    function prepareRowCopy(receipt: BitmapCanvasWrite): BitmapCopiedRows | null {
        const source = receipt.operation?.kind === 'image' ? receipt.operation.image : receipt.image;
        const donor = bySource.get(source as HTMLCanvasElement);
        if (gpu === null || !isActive())
            return null;
        if (donor === undefined) {
            const inherited = content.peek(source as HTMLCanvasElement);
            if (inherited !== null)
                rejectCopy('copy-appearance-operation-unsupported', [{ text: textOrigin(inherited).source.text }]);
            return null;
        }
        const unfinished = captures
            .entries()
            .filter(([, capture]) => capture.state === donor)
            .toArray();
        if (unfinished.length > 0) {
            rejectCopy('copy-source-command-in-progress', unfinished.map(([command]) => command));
            return null;
        }
        const batch = batches.get(donor);
        if (batch !== undefined)
            seal(batch);
        const reservation = { count: 0 };
        let copied: BitmapCopiedRows | null = null;
        try {
            copied = prepareBitmapCopiedRows({
                receipt,
                atoms: donor.atoms,
                barriers: textBarriers.has(source as HTMLCanvasElement)
                    ? (textBarriers.get(source as HTMLCanvasElement) ?? null)
                    : [],
                device: gpu,
                reject: rejectCopy,
                admit: (count) => {
                    if (retainedAtoms + pendingCopiedAtoms + states.size + captures.size + count + 1 >
                        BITMAP_LIMITS.evidence) {
                        resourceEvent?.({ kind: 'refused', name: 'evidence', requested: count + 1 });
                        return false;
                    }
                    reservation.count = count;
                    pendingCopiedAtoms += count;
                    return true;
                },
            });
            return copied === null ? null : ownRowCopy(copied, reservation.count);
        }
        finally {
            if (copied === null)
                pendingCopiedAtoms -= reservation.count;
        }
    }
    function publishRowCopy(source: HTMLCanvasElement, copy: BitmapCopiedRows): boolean {
        if (!isActive() || source.width !== copy.width || source.height !== copy.height)
            return false;
        const state = stateForSource(source);
        if (state === null || !isActive() || state.closed)
            return false;
        const atoms = copy.atoms.map((atom) => ({
            ...atom,
            sequence: ++sequence,
            ...(atom.draw === undefined || clues === null ? {} : { draw: clues.copyDraw(atom.draw, source) }),
        }));
        releaseCopyReservation(copy);
        state.atoms.push(...atoms);
        retainedAtoms += atoms.length;
        textBarriers.set(source, copy.barriers);
        touch(state);
        return true;
    }
    const content = createBitmapContentStore({
        lifetime,
        resourceEvent,
        rowCopies: {
            prepare: prepareRowCopy,
            publish: publishRowCopy,
            rejected: (reason, text) => {
                rejectCopy(reason, [{ text }]);
            },
        },
        readRoot: (source) => {
            const state = bySource.get(source);
            if (state === undefined || gpu === null || captures.values().some((capture) => capture.state === state))
                return null;
            const batch = batches.get(state);
            if (batch !== undefined)
                seal(batch);
            const rows = assembleBitmapCommandRows(state.atoms, textBarriers.get(source));
            const row = rows.length === 1 ? rows[0] : undefined;
            if (row === undefined || source.width <= 0 || source.height <= 0)
                return null;
            const snapshot = gpu.describeSnapshot(source, [
                {
                    effects: row.effects,
                    draws: row.atoms.map((atom) => ({ text: atom.text, layout: atom.layout })),
                },
            ]);
            let sourceEnd = 0;
            return Object.freeze({
                kind: 'text',
                regions: Object.freeze(row.atoms.map((atom) => Object.freeze({ ...atom.bounds, ...(atom.draw === undefined ? {} : { draw: atom.draw }) }))),
                snapshot,
                source: row.source,
                frame: row.frame,
                placements: Object.freeze(row.reading.map((atom) => {
                    const geometry = atom.geometry;
                    if (geometry === null)
                        throw new Error('An admitted origin requires resolved source placement.');
                    const start = sourceEnd;
                    sourceEnd += atom.text.length;
                    return Object.freeze({ ...geometry, start, end: sourceEnd });
                })),
                sequence: row.atoms[0]?.sequence ?? 0,
                ...(clues?.enabled() !== true
                    ? {}
                    : {
                        evidence: Object.freeze(row.reading.map((atom) => Object.freeze({ draw: atom.draw, text: atom.text }))),
                    }),
                width: source.width,
                height: source.height,
            });
        },
        releaseRoot: (root) => gpu?.releaseSnapshot(root.snapshot),
        captureRoot: (root) => gpu?.captureSnapshot(root.snapshot) ?? false,
    });
    const fragments = createBitmapFragmentPresentation({
        timing,
        lifetime,
        resourceEvent,
        retain: content.retain,
        releaseDisplay,
        host,
        content: content.get,
        currentContent: content.peek,
        capture: content.capture,
        measure: (text, paint) => gpu?.measure(text, paint) ?? { width: NaN, left: 0, right: 0, ascent: 0, descent: 0 },
        ...(clues === null
            ? {}
            : {
                semantic: {
                    read: clues.provenance,
                    complete: clues.completeSource,
                    characters: clues.characters,
                    contradict: clues.rejectSource,
                    version: () => clueVersion,
                },
            }),
        request: (predecessor, template, changed, completeSource) => {
            const pending = predecessor === null && completeSource !== null ? pendingTemplates.get(completeSource) : undefined;
            const adopted = pending !== undefined &&
                !states
                    .values()
                    .some((state) => state.atoms.some((atom) => atom.draw !== undefined &&
                    clues
                        ?.provenance(atom.draw)
                        .some((relation) => relation.source.observation === completeSource)))
                ? pending
                : undefined;
            const plan = semantic.prepareReconciliation({
                successors: [{ predecessor: predecessor ?? adopted?.handle ?? null, template }],
                retired: [],
            });
            plan.commit();
            if (adopted !== undefined) {
                pendingTemplates.delete(adopted.source.observation);
                adopted.changed = changed;
            }
            requestTranslations(plan.changes, undefined, changed);
            const successor = plan.changes.successors[0];
            if (successor === undefined)
                throw new Error('Missing semantic successor.');
            if (completeSource !== null) {
                clues?.attached(completeSource);
                if (pending !== undefined && adopted === undefined)
                    releasePending([pending], 'pending-template-not-adopted');
            }
            return successor.handle;
        },
        release: (handle) => {
            if (semantic.read(handle) === null)
                return;
            semantic.prepareReconciliation({ successors: [], retired: [handle] }).commit();
            translations.revokeBatch([handle]);
            priorities.release([handle]);
            demand.delete(handle);
            report({
                type: 'record.released',
                textId: handle.textId,
                revision: handle.semanticRevision,
                message: 'fragment-occurrence-retired',
            });
        },
        translation: (handle) => {
            const value = semantic.read(handle);
            return value?.state === 'available' ? value.translation : null;
        },
        proof: (token, handle, rejected) => {
            const value = semantic.read(handle);
            const attempt = semantic.currentAttempt(handle);
            const proof: DisplayProof = {
                visible: null,
                submitted: false,
                rejected: rejected ?? null,
                facts: [
                    {
                        type: 'presentation.drawn',
                        message: 'native-batch-submitted',
                        textId: handle.textId,
                        revision: handle.semanticRevision,
                        ...(attempt === null ? {} : { attempt: attempt.sequence }),
                        sourceText: handle.sourceText,
                        translation: value?.state === 'available' ? value.translation.text : '',
                        fields: [
                            { name: 'displayRevision', value: ++displayRevision },
                            { name: 'presentationKind', value: 'final' },
                            { name: 'targetSemanticRevision', value: handle.semanticRevision },
                            { name: 'translationTextId', value: handle.textId },
                            { name: 'translationRevision', value: handle.semanticRevision },
                        ],
                    },
                ],
            };
            pendingProofs.set(token, proof);
            return () => {
                proof.submitted = true;
                reportProof(proof);
            };
        },
    });
    function isActive(): boolean {
        return active && !disposed && !disposing;
    }
    function isDisposed(): boolean {
        return disposed;
    }
    function report(fact: RuntimeDiagnosticFact): void {
        diagnostics.accept?.({ ...fact, coreGeneration });
    }
    function failure(error: unknown): void {
        if (disposing || disposed)
            return;
        dispose();
        try {
            options.reportFailure(error);
        }
        catch {
        }
    }
    function reclaim(): void {
        if (isActive())
            gpu?.reclaim();
    }
    function releaseDisplay(surface: HTMLCanvasElement): void {
        const proof = gpu?.releaseDisplay(surface, true);
        if (proof != null)
            pendingProofs.delete(proof);
    }
    function withdraw(state: SourceState): void {
        const { backing, display } = state;
        state.backing = null;
        state.display = null;
        state.proof = null;
        if (backing !== null)
            host.release(backing);
        else if (display !== null)
            releaseDisplay(display);
        probeSource(state);
    }
    function observeDemand(output: number, uses: readonly BitmapDemandUse[], complete: boolean): void {
        if (!isActive())
            return;
        if (captures.size > 0 || flushing)
            complete = false;
        const seen = new Map<SemanticTextRevisionHandle, {
            supported: boolean;
            changed: () => void;
        }>();
        const observations: BitmapTranslationDemand[] = [];
        for (const use of uses) {
            const joined = fragments.demand(use.owner);
            const state = bySource.get(use.source);
            const associations = joined === null
                ? (state?.associations ?? []).map(({ handle, atoms }) => ({
                    handle,
                    pieces: atoms.map((atom) => ({
                        member: atom,
                        context: bitmapDemandContext(atom.draw === undefined ? [] : (clues?.provenance(atom.draw) ?? [])),
                        region: atom.bounds,
                    })),
                    changed: () => {
                        if (state)
                            state.dirty = true;
                    },
                }))
                : [joined];
            for (const item of associations) {
                for (const piece of item.pieces)
                    observations.push({
                        handle: item.handle,
                        occurrence: regionOccurrence(use.occurrence, piece.member),
                        context: piece.context,
                        visible: bitmapRegionsVisible([piece.region], use.samples),
                    });
                const prior = seen.get(item.handle);
                seen.set(item.handle, { supported: use.supported || prior?.supported === true, changed: item.changed });
            }
        }
        priorities.reconcile(output, observations, complete);
        for (const [handle, value] of demand) {
            if (!semantic.isCurrent(handle)) {
                demand.delete(handle);
                continue;
            }
            if (!complete) {
                if (value.outputs.has(output))
                    value.outputs.set(output, null);
            }
            else if (value.outputs.has(output) && !seen.has(handle))
                value.outputs.set(output, false);
        }
        for (const [handle, use] of seen) {
            if (!semantic.isCurrent(handle))
                continue;
            let value = demand.get(handle);
            const fresh = value === undefined ||
                (value.outputs.size > 0 && value.outputs.values().every((present) => present === false));
            if (value === undefined) {
                value = { outputs: new Map(), episode: Object.freeze({}) };
                demand.set(handle, value);
            }
            if (fresh)
                value.episode = Object.freeze({});
            value.outputs.set(output, complete ? true : null);
            if (!complete || !use.supported || !fresh)
                continue;
            const attempt = semantic.beginTranslation(handle, value.episode);
            if (attempt !== null)
                deliverTranslations([attempt], use.changed);
        }
    }
    function prepareBatch(uses: readonly BitmapRenderUse[]) {
        if (!isActive() || captures.size > 0)
            return null;
        const joined = fragments.prepare(uses, (requests, claimed) => {
            const pending = new Set<SourceState>();
            for (const use of uses) {
                const state = bySource.get(use.source);
                if (state === undefined)
                    continue;
                if (claimed.has(use.owner))
                    continue;
                state.observed = true;
                if (state.dirty && renderEpochs.get(state) === state.epoch)
                    pending.add(state);
            }
            return composePresentations(requests, prepareStates([...pending], true));
        });
        const grouped = new Map<SourceState, BitmapRenderUse[]>();
        for (const use of uses) {
            if (joined.claimed.has(use.owner))
                continue;
            const state = bySource.get(use.source);
            if (state?.display == null || currentSource(state) !== use.source)
                continue;
            grouped.getOrInsertComputed(state, () => []).push(use);
        }
        const selected = [...grouped].flatMap(([state, currentUses]) => {
            const first = currentUses[0];
            if (first === undefined || state.display === null)
                return [];
            const keys = Object.keys(first.sampling);
            if (!currentUses.every((use) => Object.keys(use.sampling).length === keys.length &&
                keys.every((key) => use.sampling[key] === first.sampling[key])))
                return [];
            if (state.backing !== null && !host.accepts(state.backing, first)) {
                withdraw(state);
                state.dirty = true;
                return [];
            }
            const display = state.display, epoch = state.epoch;
            let backing = state.backing;
            if (backing === null) {
                backing = host.createBacking(display, first, releaseDisplay.bind(null, display));
                const source = currentSource(state);
                if (!isActive() || state.display !== display || state.epoch !== epoch || source !== first.source) {
                    host.release(backing);
                    return [];
                }
                state.backing = backing;
            }
            return currentUses.map((use) => ({
                state,
                epoch,
                use,
                backing,
                region: use.frame,
                vertices: use.vertices,
            }));
        });
        return {
            replacements: [...joined.plan.replacements, ...selected],
            isCurrent: () => isActive() &&
                joined.plan.isCurrent() &&
                selected.every((item) => {
                    const source = currentSource(item.state);
                    return (isActive() &&
                        item.state.epoch === item.epoch &&
                        item.state.backing === item.backing &&
                        source === item.use.source);
                }),
            submitted: () => {
                joined.plan.submitted();
                for (const { state, epoch } of selected) {
                    if (state.closed || state.epoch !== epoch)
                        continue;
                    probeEvent?.({ kind: 'probe-source', id: state.id, action: 'submitted' });
                    if (state.proof === null)
                        continue;
                    state.proof.submitted = true;
                    reportProof(state.proof);
                }
            },
        };
    }
    function composePresentations(requests: Parameters<BitmapPixelDevice['compose']>[0], rows: ReturnType<typeof prepareStates>): ReturnType<BitmapPixelDevice['compose']> {
        if (gpu === null || !isActive())
            return requests.map(() => null);
        const combined = [...requests, ...rows];
        const results = combined.length === 0 ? [] : gpu.compose(combined);
        const unowned = new Set(results.flatMap((result) => (result === null ? [] : [result.surface])));
        try {
            for (const [index, item] of rows.entries()) {
                const result = results[requests.length + index];
                if (result != null) {
                    publish(item, result);
                    unowned.delete(result.surface);
                }
                else if (item.epoch === item.state.epoch) {
                    for (const { row } of item.translated)
                        for (const source of row.clue?.sources ?? [])
                            clues?.rejectSource(source.observation, 'gpu-preparation-unavailable');
                    reconcile(item.state);
                    item.state.dirty = true;
                    item.state.retryOnUse = true;
                }
            }
            if (!isActive())
                return requests.map(() => null);
            const joined = results.slice(0, requests.length);
            for (const result of joined)
                if (result !== null)
                    unowned.delete(result.surface);
            return joined;
        }
        finally {
            for (const surface of unowned)
                releaseDisplay(surface);
        }
    }
    function clearAtoms(state: SourceState): void {
        retainedAtoms -= state.atoms.length;
        for (const atom of state.atoms)
            if (atom.effect !== null)
                gpu?.releaseEffect(atom.effect);
        state.atoms = [];
    }
    function touch(state: SourceState): void {
        state.epoch++;
        state.dirty = true;
        withdraw(state);
    }
    function reset(state: SourceState): void {
        for (const row of state.associations)
            closeBitmapGrowingText(row.growing);
        if (!state.closed)
            probeEvent?.({ kind: 'probe-source', id: state.id, action: 'reset' });
        const source = state.source.deref();
        if (source !== undefined)
            content.invalidate(source);
        touch(state);
        clearAtoms(state);
        const batch = batches.get(state);
        if (batch !== undefined)
            abort(batch);
        probeSource(state);
    }
    function abortCapture(batch: Capture): void {
        if (!batch.valid)
            return;
        retainedAtoms -= batch.commands.length;
        batch.valid = false;
        gpu?.abort(batch.token);
        batches.delete(batch.state);
        probeSource(batch.state);
    }
    function seal(batch: Capture): void {
        if (!batch.valid || gpu === null)
            return;
        batches.delete(batch.state);
        batch.valid = false;
        let effect = gpu.finish(batch.token);
        const inkless = batch.commands.every((item) => item.text.trim().length === 0);
        if (inkless && effect !== null) {
            gpu.releaseEffect(effect);
            effect = null;
        }
        if (effect === null && !inkless) {
            retainedAtoms -= batch.commands.length;
            return;
        }
        const bounds = effect === null ? { x: 0, y: 0, width: batch.state.width, height: batch.state.height } : gpu.bounds(effect);
        if (bounds === null) {
            retainedAtoms -= batch.commands.length;
            if (effect !== null)
                gpu.releaseEffect(effect);
            return;
        }
        for (const item of batch.commands)
            batch.state.atoms.push({ ...item, effect, bounds });
        probeSource(batch.state);
    }
    function currentSource(state: SourceState): HTMLCanvasElement | null {
        if (state.closed)
            return null;
        if (state.bitmap === null)
            return state.source.deref() ?? null;
        const bitmap = state.bitmap.deref();
        return bitmap === undefined ? null : resolveSource(bitmap);
    }
    function retire(state: SourceState, reason = 'invalid-source'): void {
        if (state.closed)
            return;
        probeEvent?.({ kind: 'probe-source', id: state.id, action: `retired.${reason}` });
        state.closed = true;
        states.delete(state);
        renderEpochs.delete(state);
        if (state.bitmap !== null)
            lifetime.forget(state.bitmap);
        lifetime.forget(state.source);
        const bitmap = state.bitmap?.deref(), source = state.source.deref();
        if (bitmap !== undefined && byBitmap.get(bitmap) === state)
            byBitmap.delete(bitmap);
        if (source !== undefined && bySource.get(source) === state)
            bySource.delete(source);
        const retired = state.associations.map((row) => row.handle);
        for (const row of state.associations)
            closeBitmapGrowingText(row.growing);
        state.associations = [];
        reset(state);
        semantic.prepareReconciliation({ successors: [], retired }).commit();
        translations.revokeBatch(retired);
        priorities.release(retired);
        for (const handle of retired)
            demand.delete(handle);
        for (const handle of retired)
            report({
                type: 'record.released',
                textId: handle.textId,
                revision: handle.semanticRevision,
                message: 'source-retired',
            });
    }
    function stateForSource(source: HTMLCanvasElement, bitmap?: object): SourceState | null {
        let state = bitmap === undefined ? undefined : byBitmap.get(bitmap);
        if (state !== undefined && state.source.deref() !== source) {
            retire(state, 'rebound');
            state = undefined;
        }
        if (state === undefined) {
            const alias = bySource.get(source);
            if (alias !== undefined && (bitmap === undefined || alias.bitmap === null))
                state = alias;
            else if (alias !== undefined)
                retire(alias, 'alias');
        }
        if (state === undefined) {
            if (!isActive())
                return null;
            state = {
                id: nextId++,
                bitmap: null,
                source: new WeakRef(source),
                closed: false,
                width: source.width,
                height: source.height,
                epoch: 0,
                atoms: [],
                associations: [],
                backing: null,
                display: null,
                proof: null,
                dirty: true,
                observed: false,
                retryOnUse: false,
                rejectionEpoch: -1,
            };
            states.add(state);
            bySource.set(source, state);
            probeSource(state, 'created');
            lifetime.watch(state.source, state, retireCanvas);
        }
        else if (state.width !== source.width || state.height !== source.height)
            reset(state);
        if (bitmap !== undefined && state.bitmap === null) {
            state.bitmap = new WeakRef(bitmap);
            byBitmap.set(bitmap, state);
            lifetime.watch(state.bitmap, state, retireBitmap);
        }
        state.width = source.width;
        state.height = source.height;
        return state;
    }
    function releasePending(entries: readonly PendingTemplate[], reason: string): void {
        const retired = entries.filter((entry) => semantic.isCurrent(entry.handle)).map((entry) => entry.handle);
        for (const entry of entries)
            pendingTemplates.delete(entry.source.observation);
        if (retired.length === 0)
            return;
        semantic.prepareReconciliation({ successors: [], retired }).commit();
        translations.revokeBatch(retired);
        priorities.release(retired);
        for (const handle of retired)
            demand.delete(handle);
        for (const handle of retired)
            report({
                type: 'record.released',
                textId: handle.textId,
                revision: handle.semanticRevision,
                message: reason,
            });
    }
    function trimPending(): void {
        const excess = Math.max(0, semantic.size() - BITMAP_LIMITS.associations);
        if (excess > 0)
            releasePending([...pendingTemplates.values()].reverse().slice(0, excess), 'pending-template-capacity');
    }
    function prepareCompleteSources(): void {
        if (clues === null)
            return;
        const current = clues.pendingSources();
        const tokens = new Set(current.map((source) => source.observation));
        releasePending(pendingTemplates
            .values()
            .filter((entry) => !tokens.has(entry.source.observation))
            .toArray(), 'pending-source-unavailable');
        trimPending();
        for (const source of current) {
            if (pendingTemplates.has(source.observation) || semantic.size() >= BITMAP_LIMITS.associations)
                continue;
            const plan = semantic.prepareReconciliation({
                successors: [{ predecessor: null, template: source.template }],
                retired: [],
            });
            plan.commit();
            const handle = plan.changes.successors[0]?.handle;
            if (handle === undefined)
                throw new Error('Missing complete-source template.');
            const entry: PendingTemplate = { source, handle, changed: null };
            pendingTemplates.set(source.observation, entry);
            requestTranslations(plan.changes, undefined, () => {
                entry.changed?.();
            });
        }
    }
    function pendingIsUnambiguous(token: TextObservationRef, state: SourceState): boolean {
        return (!fragments.hasCompleteSource(token) &&
            !states
                .values()
                .some((other) => other !== state &&
                other.atoms.some((atom) => atom.draw !== undefined &&
                    clues?.provenance(atom.draw).some((relation) => relation.source.observation === token))));
    }
    function reconcileRows(state: SourceState): void {
        const version = clueVersion;
        const context = semanticDiagnostics?.collect();
        const surface = state.source.deref();
        const recordedBarriers = surface === undefined ? undefined : textBarriers.get(surface);
        const barriers: BitmapTextBarriers = recordedBarriers === undefined ? [] : recordedBarriers;
        const groups = assembleBitmapCommandRows(state.atoms, barriers);
        const surfaceRef = surface === undefined ? null : (clues?.surfaceRef(surface) ?? null);
        const candidates = clues === null || surfaceRef === null || gpu === null
            ? []
            : bitmapSemanticCandidates(groups, {
                surface: surfaceRef,
                width: state.width,
                height: state.height,
                barriers,
                read: clues.provenance,
                complete: clues.completeSource,
                contradict: clues.rejectSource,
                characters: clues.characters,
                rejected: (atoms: readonly BitmapCommandAtom[], reason: string, source: BitmapSemanticSource, area?: PixelBounds | null) => {
                    context?.reject(atoms, {
                        stage: 'association',
                        reason,
                        source,
                        ...(area === undefined ? {} : { area }),
                    });
                    clues.rejectSource(source.observation, reason);
                },
            });
        const admitted = candidates.filter((candidate) => {
            const device = gpu;
            if (device !== null &&
                supportsBitmapAssociation(candidate, candidate.clue?.sources.length !== 1
                    ? null
                    : (clues?.characters(candidate.clue.sources[0].observation) ?? null), (reason) => {
                    const decision = {
                        stage: 'layout' as const,
                        reason,
                        ...(candidate.clue === undefined
                            ? {}
                            : { source: candidate.clue.sources[0], area: candidate.clue.allocation }),
                    };
                    semanticDiagnostics?.refuse(candidate, decision);
                    context?.reject(candidate.atoms, decision);
                    for (const source of candidate.clue?.sources ?? [])
                        clues?.rejectSource(source.observation, reason);
                }))
                return true;
            context?.reject(candidate.atoms, {
                stage: 'layout',
                reason: 'source-layout-unsupported',
                ...(candidate.clue === undefined ? {} : { source: candidate.clue.sources[0] }),
            });
            return false;
        });
        const assembled = assembleBitmapTextAssociations(groups, admitted.filter((candidate) => candidate.clue?.sources.every((source) => clues?.sourceActive(source.observation)) ?? true), (candidate, reason) => {
            context?.reject(candidate.atoms, {
                stage: 'association',
                reason,
                ...(candidate.clue === undefined ? {} : { source: candidate.clue.sources[0] }),
            });
            for (const source of candidate.clue?.sources ?? [])
                clues?.rejectSource(source.observation, reason);
        });
        if (version !== clueVersion)
            return;
        const geometric = bitmapAssociationPredecessors(state.associations, assembled);
        const completePredecessors = new Map<TextObservationRef, Association[]>();
        for (const prior of state.associations) {
            if (prior.clue?.complete !== true)
                continue;
            const token = prior.clue.sources[0].observation;
            completePredecessors.getOrInsertComputed(token, () => []).push(prior);
        }
        const predecessors = assembled.map((row, index) => {
            const old = geometric[index];
            if (row.clue?.complete === true) {
                const token = row.clue.sources[0].observation;
                if (old?.clue?.complete === true && old.clue.sources[0].observation === token)
                    return old;
                const members = new Set(row.reading);
                const extensions = (completePredecessors.get(token) ?? []).filter((prior) => prior.reading.every((atom) => members.has(atom)));
                if (extensions.length === 1)
                    return extensions[0] ?? null;
                return null;
            }
            return old?.clue?.complete === true ? null : (old ?? null);
        });
        const claims = new Map<Association, number>();
        for (const prior of predecessors)
            if (prior != null)
                claims.set(prior, (claims.get(prior) ?? 0) + 1);
        for (const [index, prior] of predecessors.entries())
            if (prior != null && claims.get(prior) !== 1)
                predecessors[index] = null;
        const completeSuccessors = new Map<BitmapSemanticSource, number>();
        for (const row of assembled)
            if (row.clue?.complete === true) {
                const source = row.clue.sources[0];
                completeSuccessors.set(source, (completeSuccessors.get(source) ?? 0) + 1);
            }
        const adopted = new Set<PendingTemplate>();
        const successors = assembled.map((row, index) => {
            const complete = row.clue?.complete === true ? row.clue.sources[0] : null;
            const pending = complete === null ? undefined : pendingTemplates.get(complete.observation);
            const predecessor = predecessors[index]?.handle ??
                (pending !== undefined &&
                    pendingIsUnambiguous(pending.source.observation, state) &&
                    complete !== null &&
                    completeSuccessors.get(complete) === 1
                    ? pending.handle
                    : null);
            if (predecessor === pending?.handle)
                adopted.add(pending);
            return {
                predecessor,
                template: row.clue?.template ?? textTemplate(row.source),
            };
        });
        const retained = new Set(predecessors);
        const unused = state.associations.filter((old) => !retained.has(old));
        const plan = semantic.prepareReconciliation({ successors, retired: unused.map((row) => row.handle) });
        plan.commit();
        for (const entry of adopted) {
            entry.changed = () => {
                if (!state.closed)
                    state.dirty = true;
            };
            pendingTemplates.delete(entry.source.observation);
        }
        const previousAssociations = state.associations;
        state.associations = assembled.map((row, index) => {
            const successor = plan.changes.successors[index];
            if (successor === undefined)
                throw new Error('Semantic reconciliation omitted a current association.');
            if (row.clue?.complete === true)
                clues?.attached(row.clue.sources[0].observation);
            const prior = predecessors[index];
            const growing = prior?.growing?.active === true &&
                prior.growing.textId === successor.handle.textId &&
                continuesBitmapGrowingText(prior, row)
                ? prior.growing
                : supportsBitmapGrowingText(row)
                    ? { textId: successor.handle.textId, active: true, latest: null }
                    : null;
            if (growing !== null) {
                growingRequests.set(successor.handle, growing);
                const attempt = semantic.currentAttempt(successor.handle);
                const snapshot = semantic.read(successor.handle);
                if (attempt !== null && snapshot?.state === 'available')
                    acceptBitmapGrowingText(growing, attempt, { kind: 'available', translation: snapshot.translation });
            }
            return { ...row, handle: successor.handle, growing, layoutCache: prior?.layoutCache ?? null };
        });
        const growing = new Set(state.associations.map((row) => row.growing));
        for (const prior of previousAssociations)
            if (!growing.has(prior.growing))
                closeBitmapGrowingText(prior.growing);
        for (const old of unused) {
            report({
                type: 'record.released',
                textId: old.handle.textId,
                revision: old.handle.semanticRevision,
                message: 'source-association-removed',
            });
            if (!isActive())
                return;
        }
        if (clues !== null)
            releasePending([...pendingTemplates.values()].filter((entry) => clues.completeSource(entry.source.observation) === null), 'pending-source-unavailable');
        requestTranslations(plan.changes, state.id, () => {
            state.dirty = true;
        });
        for (const row of state.associations)
            reportContext(state, row, context);
    }
    function reportContext(state: SourceState, row: Association, context = semanticDiagnostics?.collect()): void {
        if (context === undefined)
            return;
        report({
            type: 'semantic.context',
            textId: row.handle.textId,
            revision: row.handle.semanticRevision,
            physicalTextId: state.id,
            physicalRevision: state.epoch,
            bitmapId: state.id,
            message: 'semantic-context-evaluated',
            fields: context.fields(row, options.semanticAdapters?.length ?? 0, clues?.activeCount() ?? 0, state),
        });
    }
    const reconcile = timed(timing, 'reconciliation', reconcileRows, ([state]) => [state.atoms.length, 0]);
    function requestTranslations(changes: SemanticTextChangeSet, bitmapId: number | undefined, changed: () => void): void {
        trimPending();
        for (const handle of changes.issued) {
            report({
                type: handle.semanticRevision === 1 ? 'record.observed' : 'record.changed',
                textId: handle.textId,
                revision: handle.semanticRevision,
                ...(bitmapId === undefined ? {} : { bitmapId }),
                sourceText: handle.sourceText,
            });
            if (!isActive())
                return;
        }
        if (!isActive())
            return;
        const attempts = changes.issued.flatMap((handle) => {
            const attempt = semantic.beginTranslation(handle);
            return attempt === null ? [] : [attempt];
        });
        deliverTranslations(attempts, changed);
        translations.revokeBatch(changes.revoked);
        priorities.release(changes.revoked);
        for (const handle of changes.revoked)
            demand.delete(handle);
    }
    function deliverTranslations(attempts: readonly SemanticTranslationAttempt[], changed: () => void): void {
        const admissions = translations.requestBatch(attempts);
        for (const admission of admissions) {
            const attempt = admission.request;
            const growing = growingRequests.get(attempt.handle);
            if (admission.immediateSettlement !== null) {
                if (growing !== undefined)
                    acceptBitmapGrowingText(growing, attempt, admission.immediateSettlement);
                if (semantic.settleTranslation(attempt, admission.immediateSettlement).kind === 'accepted' &&
                    attempt.recovery)
                    changed();
            }
            else
                void admission.completion.then((settlement) => {
                    if (!isActive())
                        return;
                    const accepted = semantic.settleTranslation(attempt, settlement).kind === 'accepted';
                    const advanced = growing !== undefined && acceptBitmapGrowingText(growing, attempt, settlement);
                    if (accepted || advanced)
                        changed();
                });
        }
    }
    function preparePresentation(state: SourceState): {
        state: SourceState;
        epoch: number;
        clueVersion: number;
        source: HTMLCanvasElement;
        translated: {
            row: Association;
            translation: string;
            layout: BitmapAssociationLayout;
            translationHandle: SemanticTextRevisionHandle;
        }[];
        groups: {
            effects: readonly PixelEffect[];
            draws: readonly BitmapTextDraw[];
            targetRegions?: readonly PixelBounds[];
        }[];
    } | null {
        const source = state.source.deref();
        if (!isActive() ||
            gpu === null ||
            source?.width !== state.width ||
            source.height !== state.height ||
            currentSource(state) !== source)
            return null;
        const epoch = state.epoch;
        const currentClueVersion = clueVersion;
        const device = gpu;
        probeSource(state);
        const translated = state.associations.flatMap((row) => {
            const value = semantic.read(row.handle);
            const candidate = value?.state === 'available'
                ? { handle: row.handle, translation: value.translation }
                : value?.state === 'translating' || value?.state === 'observed'
                    ? row.growing?.latest
                    : null;
            if (candidate == null ||
                candidate.translation.text === candidate.handle.sourceText ||
                candidate.translation.text === row.handle.sourceText)
                return [];
            let layoutReason = 'translated-layout-unavailable';
            const layout = layoutBitmapAssociation(row, candidate.translation, (text, paint) => device.measure(text, paint), row.layoutCache, row.clue?.sources.length !== 1 ? null : (clues?.characters(row.clue.sources[0].observation) ?? null), (reason) => {
                layoutReason = reason;
            });
            if (layout === null) {
                if (row.clue !== undefined) {
                    semanticDiagnostics?.refuse(row, {
                        stage: 'layout',
                        reason: layoutReason,
                        source: row.clue.sources[0],
                        area: row.clue.allocation,
                    });
                    for (const source of row.clue.sources)
                        clues?.rejectSource(source.observation, layoutReason);
                    reportContext(state, row);
                }
                return [];
            }
            row.layoutCache = layout;
            return [{ row, translation: layout.visibleText, layout, translationHandle: candidate.handle }];
        });
        if (translated.length === 0 || currentClueVersion !== clueVersion)
            return null;
        return {
            state,
            epoch,
            clueVersion: currentClueVersion,
            translated,
            source,
            groups: translated.map(({ row, layout }) => ({
                effects: row.effects,
                draws: layout.draws,
                ...(layout.targetRegions === null ? {} : { targetRegions: layout.targetRegions }),
            })),
        };
    }
    function publish(preparedPresentation: NonNullable<ReturnType<typeof preparePresentation>>, result: {
        surface: HTMLCanvasElement;
        proof: PixelProof;
    }): void {
        const { state, epoch, translated, source } = preparedPresentation;
        const current = currentSource(state);
        if (!isActive() ||
            epoch !== state.epoch ||
            preparedPresentation.clueVersion !== clueVersion ||
            current !== source) {
            releaseDisplay(result.surface);
            return;
        }
        state.display = result.surface;
        probeSource(state);
        const revision = ++displayRevision;
        const proof: DisplayProof = {
            visible: null,
            submitted: false,
            rejected: translated.some((item) => item.row.clue !== undefined)
                ? (groups) => {
                    if (!isActive() || state.closed || state.epoch !== epoch || state.display !== result.surface)
                        return;
                    const rejected = translated.filter((item, index) => item.row.clue !== undefined &&
                        groups?.[index]?.visible !== true &&
                        state.associations.some((current) => current.handle === item.row.handle));
                    if (rejected.length === 0)
                        return;
                    if (semanticDiagnostics !== undefined)
                        for (const { row } of rejected)
                            semanticDiagnostics.refuse(row, {
                                stage: 'presentation',
                                reason: 'safe-area-gpu-proof-rejected',
                                ...(row.clue === undefined
                                    ? {}
                                    : { source: row.clue.sources[0], area: row.clue.allocation }),
                            });
                    for (const { row } of rejected)
                        for (const source of row.clue?.sources ?? [])
                            clues?.rejectSource(source.observation, 'safe-area-gpu-proof-rejected');
                }
                : null,
            facts: diagnostics.accept === undefined
                ? []
                : translated.map(({ row, translation, translationHandle }) => {
                    const attempt = semantic.currentAttempt(row.handle);
                    return {
                        type: 'presentation.drawn',
                        message: 'native-batch-submitted',
                        textId: row.handle.textId,
                        revision: row.handle.semanticRevision,
                        ...(attempt === null ? {} : { attempt: attempt.sequence }),
                        physicalTextId: state.id,
                        physicalRevision: epoch,
                        bitmapId: state.id,
                        sourceText: row.handle.sourceText,
                        translation,
                        fields: [
                            { name: 'displayRevision', value: revision },
                            {
                                name: 'presentationKind',
                                value: translationHandle === row.handle ? 'final' : 'growing',
                            },
                            { name: 'targetSemanticRevision', value: row.handle.semanticRevision },
                            { name: 'translationTextId', value: translationHandle.textId },
                            { name: 'translationRevision', value: translationHandle.semanticRevision },
                        ],
                    };
                }),
        };
        state.proof = proof;
        pendingProofs.set(result.proof, proof);
    }
    function reportProof(proof: DisplayProof): void {
        if (proof.visible === null || !proof.submitted)
            return;
        const facts = proof.facts;
        proof.facts = [];
        const rejected = proof.rejected;
        proof.rejected = null;
        if (!proof.visible)
            rejected?.(proof.groups);
        for (const [index, fact] of facts.entries()) {
            const group = proof.groups?.[index];
            const visible = group?.visible ?? proof.visible;
            const failure = group?.failure ?? proof.failure;
            const failedFact = failure == null ? undefined : facts[failure.groupIndex ?? 0];
            report(visible
                ? {
                    ...fact,
                    fields: [
                        ...(fact.fields ?? []),
                        { name: 'nativeSubmission', value: 1 },
                        { name: 'gpuPredicate', value: 1 },
                    ],
                }
                : {
                    ...fact,
                    type: 'presentation.rejected',
                    message: 'gpu-publication-kept-source',
                    fields: [
                        ...(fact.fields ?? []),
                        { name: 'gpuPredicate', value: 0 },
                        { name: 'stage', value: 'presentation' },
                        { name: 'gpuFailureReason', value: failure?.reason ?? 'unavailable' },
                        { name: 'gpuFailureStage', value: failure?.stage ?? null },
                        { name: 'gpuFailureMemberIndex', value: failure?.memberIndex ?? null },
                        { name: 'gpuFailureGroupIndex', value: failure?.groupIndex ?? null },
                        { name: 'gpuFailureEffectSequence', value: failure?.effectSequence ?? null },
                        { name: 'gpuFailureTextId', value: failedFact?.textId ?? null },
                        { name: 'gpuFailureRevision', value: failedFact?.revision ?? null },
                        { name: 'gpuFailureSource', value: failedFact?.sourceText?.slice(0, 256) ?? null },
                        { name: 'gpuFailureSourceTruncated', value: (failedFact?.sourceText?.length ?? 0) > 256 },
                        {
                            name: 'gpuFailureScope',
                            value: failedFact === undefined
                                ? 'unavailable'
                                : failedFact === fact
                                    ? 'self'
                                    : 'other-row',
                        },
                    ],
                });
        }
    }
    function prepareStates(selectedStates: readonly SourceState[], nativeUse = false) {
        const presentations: NonNullable<ReturnType<typeof preparePresentation>>[] = [];
        for (const state of selectedStates) {
            if (!isActive())
                break;
            if (!state.dirty || !state.observed || (state.retryOnUse && !nativeUse))
                continue;
            const source = currentSource(state);
            if (source === null || source !== state.source.deref()) {
                retire(state);
                continue;
            }
            state.dirty = false;
            state.retryOnUse = false;
            withdraw(state);
            let prepared: ReturnType<typeof preparePresentation>;
            let version: number;
            do {
                version = clueVersion;
                reconcile(state);
                prepared = preparePresentation(state);
            } while (isActive() && version !== clueVersion);
            if (prepared !== null)
                presentations.push(prepared);
        }
        return presentations.filter((item) => isActive() &&
            item.epoch === item.state.epoch &&
            item.clueVersion === clueVersion &&
            currentSource(item.state) === item.source);
    }
    function beforeRender(): void {
        if (!isActive() || flushing || captures.size > 0 || gpu === null)
            return;
        const graphics = scope['Graphics'] as Record<string, unknown> | undefined;
        const renderer = graphics?.['_renderer'] ?? (graphics?.['_app'] as Record<string, unknown> | undefined)?.['renderer'];
        if (renderer && typeof renderer === 'object')
            host.connect(renderer);
        host.beginScene();
        flushing = true;
        try {
            for (const batch of [...batches.values()])
                seal(batch);
            prepareCompleteSources();
            gpu.reclaim();
            for (const result of gpu.poll()) {
                const proof = pendingProofs.get(result.proof);
                pendingProofs.delete(result.proof);
                if (proof !== undefined) {
                    proof.visible = result.visible;
                    if (result.failure !== undefined)
                        proof.failure = result.failure;
                    if (result.groups !== undefined)
                        proof.groups = result.groups;
                    reportProof(proof);
                }
            }
            renderEpochs.clear();
            for (const state of states)
                renderEpochs.set(state, state.epoch);
            composePresentations([], prepareStates([...states.values()]));
        }
        finally {
            flushing = false;
        }
    }
    function dispose(): OwnedHookDisposal {
        if (isDisposed())
            return 'already-disposed';
        if (disposing)
            return 'failed';
        disposing = true;
        active = false;
        let failed = false, lost = false;
        try {
            failed ||= !textRecords.dispose();
            for (const state of [...states.values()]) {
                try {
                    retire(state, 'dispose');
                }
                catch {
                    failed = true;
                }
            }
            fragments.dispose();
            content.dispose();
            lifetime.dispose();
            const hostResult = host.dispose();
            failed ||= hostResult === 'failed';
            lost ||= hostResult === 'ownership-lost';
            if (observer !== null) {
                const result = observer.dispose();
                failed ||= result === 'failed';
                lost ||= result === 'ownership-lost';
                if (result !== 'failed')
                    observer = null;
            }
            if (publication !== null) {
                const result = compensateDescriptorTransaction([publication]);
                failed ||= !result.compensated;
                if (result.compensated)
                    publication = null;
            }
            releasePending([...pendingTemplates.values()], 'runtime-disposed');
            translations.dispose();
            clues?.dispose();
            demand.clear();
            priorities.dispose();
            semantic.dispose();
            gpu?.dispose();
            pendingProofs.clear();
            renderEpochs.clear();
            captures.clear();
            batches.clear();
            if (resourceEvent !== undefined) {
                gpu?.reportResources();
                content.reportResources();
                fragments.reportResources();
                resourceEvent({
                    kind: 'usage',
                    name: 'evidence',
                    value: retainedAtoms + pendingCopiedAtoms + states.size + captures.size,
                    limit: BITMAP_LIMITS.evidence,
                });
                probeCensus();
                resourceEvent({ kind: 'disposed' });
            }
            if (!failed)
                disposed = true;
        }
        finally {
            disposing = false;
        }
        return failed ? 'failed' : lost ? 'ownership-lost' : 'disposed';
    }
    try {
        options.claimLifetimeOwner(Object.freeze({ dispose }));
        if (isDisposed())
            throw new Error('Bitmap core lifetime ended during installation.');
        if (probeEvent !== undefined) {
            let engine = 'unavailable', version = 'unavailable', environment = 'unavailable';
            try {
                const utils = scope['Utils'];
                if (typeof utils === 'object' && utils !== null) {
                    engine = String(Reflect.get(utils, 'RPGMAKER_NAME') ?? 'unavailable');
                    version = String(Reflect.get(utils, 'RPGMAKER_VERSION') ?? 'unavailable');
                }
                const navigator = scope['navigator'];
                if (typeof navigator === 'object' && navigator !== null)
                    environment = String(Reflect.get(navigator, 'userAgent') ?? 'unavailable');
            }
            catch {
            }
            probeEvent({ kind: 'probe-context', engine, version, environment });
        }
        if (resourceEvent !== undefined)
            for (const [name, limit] of Object.entries(BITMAP_LIMITS))
                resourceEvent({ kind: 'usage', name, value: 0, limit });
        const device = createBitmapPixelDevice({
            timing,
            resourceEvent,
            probeEvent,
            proofDiagnostics: diagnostics.accept !== undefined,
            createCanvas: () => Reflect.apply(createElement, document, ['canvas']),
            createOffscreenCanvas: () => new Offscreen(1, 1),
            reportFailure: failure,
        });
        if (isDisposed()) {
            device.dispose();
            throw new Error('Bitmap core lifetime ended during pixel device creation.');
        }
        gpu = device;
        const status = Object.freeze({
            getActivitySnapshot: () => Object.freeze({
                generation: coreGeneration,
                pending: active && device.hasPendingQueries(),
                revision: sequence,
            }),
        });
        publication = createOwnDataDescriptorShadowUpdate(scope, 'LiveTranslatorGpuStatus', status);
        if (publication === null || !commitDescriptorTransaction([publication]).committed)
            throw new Error('GPU status publication failed.');
        observer = installBitmapCommandObserver({
            timing,
            visibilityDocument: document as Document,
            bitmapPrototype,
            canvasPrototype,
            contextPrototype,
            sceneManager,
            renderBoundary,
            additionalHooks: [...(semanticObserver?.hooks ?? []), ...(options.nativeHooks ?? [])],
            resolveSource: resolveSource,
            observesAppearance: (source, image) => bySource.has(source) ||
                bySource.has(image as HTMLCanvasElement) ||
                content.has(source) ||
                content.has(image as HTMLCanvasElement),
            begin: (command) => {
                if (!isActive() || gpu === null)
                    return;
                if (gpu.needsReclamation())
                    reclaim();
                if (!isActive())
                    return;
                if (retainedAtoms + pendingCopiedAtoms + states.size + captures.size + 2 > BITMAP_LIMITS.evidence) {
                    resourceEvent?.({
                        kind: 'usage',
                        name: 'evidence',
                        value: retainedAtoms + pendingCopiedAtoms + states.size + captures.size,
                        limit: BITMAP_LIMITS.evidence,
                    });
                    probeCensus();
                    resourceEvent?.({
                        kind: 'refused',
                        name: 'evidence',
                        requested: 2,
                        sourceId: bySource.get(command.source)?.id ?? null,
                        bitmapSourceId: byBitmap.get(command.bitmap)?.id ?? null,
                    });
                    return;
                }
                const state = stateForSource(command.source, command.bitmap);
                if (state === null || !isActive())
                    return;
                content.invalidate(command.source);
                touch(state);
                let batch = batches.get(state);
                if (batch !== undefined) {
                    const b = command.layout.placement;
                    const previous = batch.commands.at(-1);
                    if (!sameBitmapRow(batch, b) ||
                        command.layout.alignment !== 'left' ||
                        previous?.layout.alignment !== 'left' ||
                        previous.geometry?.textRight !== b.x) {
                        seal(batch);
                        batch = undefined;
                    }
                }
                const sourceAtoms = state.atoms.length + (batch?.commands.length ?? 0);
                resourceEvent?.({
                    kind: 'usage',
                    name: 'sourceAtoms',
                    value: sourceAtoms,
                    limit: null,
                });
                if (batch === undefined) {
                    batch = {
                        state,
                        y: command.layout.placement.y,
                        lineHeight: command.layout.placement.lineHeight,
                        token: gpu.begin(command.source),
                        commands: [],
                        bounds: null,
                        valid: true,
                    };
                    batches.set(state, batch);
                }
                captures.set(command, batch);
            },
            write: (receipt) => {
                if (!isActive() || gpu === null)
                    return;
                if (gpu.needsReclamation())
                    reclaim();
                if (!isActive())
                    return;
                content.beforeWrite(receipt);
                const { source, damage, command, erases, sourceIsBlank } = receipt;
                const bounds = damage.kind === 'full' ? { x: 0, y: 0, width: source.width, height: source.height } : damage;
                if (sourceIsBlank)
                    textBarriers.delete(source);
                if (command === null) {
                    if (!erases) {
                        const barriers = textBarriers.get(source);
                        if (barriers !== null) {
                            const count = barriers?.length ?? 0;
                            resourceEvent?.({
                                kind: 'usage',
                                name: 'textBarriers',
                                value: count,
                                limit: BITMAP_LIMITS.textBarriers,
                            });
                            if (count >= BITMAP_LIMITS.textBarriers)
                                resourceEvent?.({ kind: 'refused', name: 'textBarriers', requested: 1 });
                            textBarriers.set(source, count >= BITMAP_LIMITS.textBarriers ? null : [...(barriers ?? []), { ...bounds }]);
                        }
                    }
                }
                const state = bySource.get(source);
                if (state === undefined)
                    return;
                const device = gpu;
                const current = command === null ? undefined : captures.get(command);
                const owned = current?.valid === true;
                if (!owned || erases) {
                    const pending = batches.get(state);
                    if (pending !== undefined && !owned)
                        seal(pending);
                    touch(state);
                    const previousAtomCount = state.atoms.length;
                    const removed = new Set<PixelEffect>();
                    const removedEmpty = new Set<BitmapCommandAtom>();
                    for (const atom of state.atoms) {
                        const geometry = atom.geometry;
                        const textBounds = geometry === null || atom.effect === null
                            ? atom.bounds
                            : {
                                x: geometry.textLeft,
                                y: atom.bounds.y,
                                width: geometry.textRight - geometry.textLeft,
                                height: atom.bounds.height,
                            };
                        if (boundsIntersect(textBounds, bounds)) {
                            if (atom.effect === null)
                                removedEmpty.add(atom);
                            else
                                removed.add(atom.effect);
                        }
                    }
                    state.atoms = state.atoms.filter((atom) => atom.effect === null ? !removedEmpty.has(atom) : !removed.has(atom.effect));
                    for (const effect of removed)
                        device.releaseEffect(effect);
                    if (owned && previousAtomCount !== state.atoms.length)
                        abort(current);
                    retainedAtoms -= previousAtomCount - state.atoms.length;
                    const active = batches.get(state);
                    if (active?.bounds !== null &&
                        active !== undefined &&
                        boundsIntersect(active.bounds, bounds) &&
                        active.commands.length > 0)
                        abort(active);
                }
                if (current?.valid && owned) {
                    if (!device.prepareWrite(current.token, damage, sourceIsBlank)) {
                        abort(current);
                        return;
                    }
                    const old = current.bounds;
                    if (old === null)
                        current.bounds = { ...bounds };
                    else {
                        const x = Math.min(old.x, bounds.x), y = Math.min(old.y, bounds.y);
                        current.bounds = {
                            x,
                            y,
                            width: Math.max(old.x + old.width, bounds.x + bounds.width) - x,
                            height: Math.max(old.y + old.height, bounds.y + bounds.height) - y,
                        };
                    }
                }
                probeSource(state);
            },
            afterWrite: (receipt, returned) => {
                content.afterWrite(receipt, returned);
                const { command } = receipt;
                if (returned || command === null)
                    return;
                const capture = captures.get(command);
                if (capture?.valid)
                    abort(capture);
            },
            finish: (command, returned) => {
                const current = captures.get(command);
                captures.delete(command);
                if (!current?.valid)
                    return;
                if (!returned) {
                    abort(current);
                    return;
                }
                const draw = clues?.enabled() ? clues.issueDraw() : undefined;
                current.commands.push({
                    text: command.text,
                    layout: command.layout,
                    geometry: resolveBitmapSourceGeometry(command.layout, device.measure(command.text, command.layout.paint).width),
                    sequence: ++sequence,
                    ...(draw === undefined ? {} : { draw }),
                });
                if (draw !== undefined)
                    semanticObserver?.capture(command, draw);
                retainedAtoms++;
                resourceEvent?.({
                    kind: 'usage',
                    name: 'sourceAtoms',
                    value: current.state.atoms.length + current.commands.length,
                    limit: null,
                });
                current.state.dirty = true;
            },
            reset: (source) => {
                textBarriers.delete(source);
                content.invalidate(source);
                const state = bySource.get(source);
                if (state !== undefined)
                    reset(state);
            },
            destroy: (bitmap) => {
                const source = resolveSource(bitmap);
                const state = byBitmap.get(bitmap) ?? (source === null ? undefined : bySource.get(source));
                if (state !== undefined)
                    retire(state, 'destroy');
            },
            beforeRender,
            afterRender: () => {
                host.endScene();
                if (!isActive() || resourceEvent === undefined)
                    return;
                gpu?.reportResources();
                resourceEvent({
                    kind: 'usage',
                    name: 'evidence',
                    value: retainedAtoms + pendingCopiedAtoms + states.size + captures.size,
                    limit: BITMAP_LIMITS.evidence,
                });
                content.reportResources();
                fragments.reportResources();
                probeCensus();
                resourceEvent({ kind: 'frame' });
            },
            ...(diagnostics.acceptBitmapTextRejection === undefined
                ? {}
                : {
                    reject: (reason: string, sourceText: string) => diagnostics.acceptBitmapTextRejection?.({
                        stage: 'observer',
                        reason,
                        sourceText: sourceText.slice(0, 256),
                        sourceTruncated: sourceText.length > 256,
                    }),
                }),
            reportFailure: failure,
        });
        active = true;
        textRecords.activate();
        report({ type: 'runtime.event', message: 'bitmap-core-installed' });
    }
    catch (error) {
        dispose();
        throw error;
    }
}
