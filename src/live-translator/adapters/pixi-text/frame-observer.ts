import type { PixiTextRuntimeCapabilities, PixiTextSourceKind } from './runtime-capabilities.js';
type PropertySource = Record<PropertyKey, unknown>;
export interface PixiTextSourceSnapshot {
    readonly sourceId: string;
    readonly source: object;
    readonly kind: PixiTextSourceKind;
    readonly text: string;
    readonly visible: boolean;
    readonly revision: number;
    readonly frameId: number;
}
export interface PixiTextSourceChange {
    readonly previous: PixiTextSourceSnapshot;
    readonly current: PixiTextSourceSnapshot;
    readonly sourceChanged: boolean;
    readonly visibilityChanged: boolean;
    readonly kindChanged: boolean;
}
export type PixiTextFrameResult = Readonly<{
    readonly status: 'reconciled';
    readonly frameId: number;
    readonly visited: number;
    readonly entered: readonly PixiTextSourceSnapshot[];
    readonly changed: readonly PixiTextSourceChange[];
    readonly departed: readonly PixiTextSourceSnapshot[];
}> | Readonly<{
    readonly status: 'duplicate';
    readonly frameId: number;
    readonly visited: 0;
    readonly entered: readonly [
    ];
    readonly changed: readonly [
    ];
    readonly departed: readonly [
    ];
}> | Readonly<{
    readonly status: 'incomplete';
    readonly frameId: number;
    readonly visited: number;
    readonly reason: string;
    readonly entered: readonly [
    ];
    readonly changed: readonly [
    ];
    readonly departed: readonly [
    ];
}>;
export interface PixiFrameObserverOptions {
    readonly capabilities: PixiTextRuntimeCapabilities;
    readonly identityPrefix?: unknown;
    readonly isTranslatorOwned?: (value: unknown) => boolean;
    readonly maxNodes?: unknown;
    readonly maxDepth?: unknown;
}
export interface PixiTextFrameObserver {
    scan(root: unknown, frameId: unknown): PixiTextFrameResult;
    retireAll(frameId?: unknown): readonly PixiTextSourceSnapshot[];
    getActiveSnapshots(): readonly PixiTextSourceSnapshot[];
}
export interface PixiTextFrameObserverModule {
    create(options: PixiFrameObserverOptions): PixiTextFrameObserver;
}
interface CapturedSource {
    readonly source: object;
    readonly kind: PixiTextSourceKind;
    readonly text: string;
    readonly visible: boolean;
}
interface SourceAuthority {
    readonly sourceId: string;
    readonly source: object;
    snapshot: PixiTextSourceSnapshot;
}
interface TraversalEntry {
    readonly value: object;
    readonly ancestorsVisible: boolean;
    readonly depth: number;
}
type CaptureResult = Readonly<{
    readonly ok: true;
    readonly visited: number;
    readonly sources: ReadonlyMap<object, CapturedSource>;
}> | Readonly<{
    readonly ok: false;
    readonly visited: number;
    readonly reason: string;
}>;
const observerFreeze = Object.freeze;
const observerReflectGet = Reflect.get;
const observerNumberIsFinite = Number.isFinite;
const observerNumberIsSafeInteger = Number.isSafeInteger;
const EMPTY_LIST: readonly [
] = observerFreeze([]);
function isPropertySource(value: unknown): value is PropertySource {
    return (typeof value === 'object' && value !== null) || typeof value === 'function';
}
function readProperty(value: object, key: PropertyKey): unknown {
    return observerReflectGet(value, key, value);
}
function positiveInteger(value: unknown, fallback: number, maximum: number): number {
    return observerNumberIsSafeInteger(value) && (value as number) > 0 ? Math.min(value as number, maximum) : fallback;
}
function normalizedFrameId(value: unknown, fallback: number): number {
    return observerNumberIsSafeInteger(value) && (value as number) >= 0 ? (value as number) : fallback;
}
function normalizedIdentityPrefix(value: unknown): string {
    if (typeof value !== 'string')
        return 'pixi';
    const trimmed = value.trim();
    return trimmed || 'pixi';
}
function localVisibility(value: object): boolean {
    const visible = readProperty(value, 'visible');
    const renderable = readProperty(value, 'renderable');
    const alpha = readProperty(value, 'alpha');
    return (visible !== false &&
        renderable !== false &&
        !(typeof alpha === 'number' && observerNumberIsFinite(alpha) && alpha <= 0));
}
function freezeSnapshot(snapshot: PixiTextSourceSnapshot): PixiTextSourceSnapshot {
    observerFreeze(snapshot);
    return snapshot;
}
function freezeList<Value>(values: Value[]): readonly Value[] {
    observerFreeze(values);
    return values;
}
function freezeFrameResult<Result extends PixiTextFrameResult>(result: Result): Result {
    observerFreeze(result);
    return result;
}
export function createPixiTextFrameObserverModule(): PixiTextFrameObserverModule {
    function create(optionsValue: PixiFrameObserverOptions): PixiTextFrameObserver {
        const candidate: unknown = optionsValue;
        if (!isPropertySource(candidate)) {
            throw new TypeError('[PIXI Text] Frame observer options are required.');
        }
        const capabilitiesValue = readProperty(candidate, 'capabilities');
        if (!isPropertySource(capabilitiesValue) ||
            typeof readProperty(capabilitiesValue, 'classifyDisplayObject') !== 'function') {
            throw new TypeError('[PIXI Text] Runtime classification capability is required.');
        }
        if (typeof readProperty(capabilitiesValue, 'readText') !== 'function') {
            throw new TypeError('[PIXI Text] Public text read capability is required.');
        }
        const capabilities = capabilitiesValue as unknown as PixiTextRuntimeCapabilities;
        const identityPrefix = normalizedIdentityPrefix(readProperty(candidate, 'identityPrefix'));
        const maxNodes = positiveInteger(readProperty(candidate, 'maxNodes'), 50000, 1000000);
        const maxDepth = positiveInteger(readProperty(candidate, 'maxDepth'), 256, 4096);
        const ownedCandidate = readProperty(candidate, 'isTranslatorOwned');
        const isTranslatorOwned = typeof ownedCandidate === 'function' ? (ownedCandidate as (value: unknown) => boolean) : () => false;
        const sourceAuthorities = new WeakMap<object, SourceAuthority>();
        const activeAuthorities = new Map<string, SourceAuthority>();
        let sourceSequence = 0;
        let fallbackFrameSequence = 0;
        let lastFrameId = -1;
        function createSourceId(): string {
            sourceSequence += 1;
            const suffix = sourceSequence.toString(36);
            return `${identityPrefix}:${suffix}`;
        }
        function capture(root: unknown): CaptureResult {
            if (!isPropertySource(root)) {
                return observerFreeze({ ok: false, visited: 0, reason: 'pixi-stage-root-unavailable' });
            }
            const sources = new Map<object, CapturedSource>();
            const visitedObjects = new Set<object>();
            const stack: TraversalEntry[] = [{ value: root, ancestorsVisible: true, depth: 0 }];
            let visited = 0;
            while (stack.length > 0) {
                const entry = stack.pop();
                if (!entry || visitedObjects.has(entry.value))
                    continue;
                if (visited >= maxNodes) {
                    return observerFreeze({ ok: false, visited, reason: 'pixi-stage-node-limit' });
                }
                if (entry.depth > maxDepth) {
                    return observerFreeze({ ok: false, visited, reason: 'pixi-stage-depth-limit' });
                }
                visitedObjects.add(entry.value);
                visited += 1;
                let ownVisible: boolean;
                try {
                    ownVisible = localVisibility(entry.value);
                }
                catch {
                    return observerFreeze({ ok: false, visited, reason: 'pixi-display-state-read-failed' });
                }
                const visible = entry.ancestorsVisible && ownVisible;
                let translatorOwned: boolean;
                try {
                    translatorOwned = isTranslatorOwned(entry.value);
                }
                catch {
                    return observerFreeze({ ok: false, visited, reason: 'pixi-owned-source-check-failed' });
                }
                if (!translatorOwned) {
                    let kind: PixiTextSourceKind | null;
                    try {
                        kind = capabilities.classifyDisplayObject(entry.value);
                    }
                    catch {
                        return observerFreeze({ ok: false, visited, reason: 'pixi-source-classification-failed' });
                    }
                    if (kind) {
                        const textRead = capabilities.readText(entry.value);
                        if (!textRead.ok) {
                            return observerFreeze({ ok: false, visited, reason: textRead.reason });
                        }
                        sources.set(entry.value, {
                            source: entry.value,
                            kind,
                            text: textRead.text,
                            visible,
                        });
                    }
                }
                let children: unknown;
                try {
                    children = readProperty(entry.value, 'children');
                }
                catch {
                    return observerFreeze({ ok: false, visited, reason: 'pixi-display-children-read-failed' });
                }
                if (children === undefined || children === null)
                    continue;
                if (!Array.isArray(children)) {
                    return observerFreeze({ ok: false, visited, reason: 'pixi-display-children-invalid' });
                }
                let childCount: number;
                try {
                    childCount = children.length;
                }
                catch {
                    return observerFreeze({ ok: false, visited, reason: 'pixi-display-children-read-failed' });
                }
                for (let index = childCount - 1; index >= 0; index -= 1) {
                    let child: unknown;
                    try {
                        child = children[index];
                    }
                    catch {
                        return observerFreeze({ ok: false, visited, reason: 'pixi-display-child-read-failed' });
                    }
                    if (!isPropertySource(child))
                        continue;
                    stack[stack.length] = { value: child, ancestorsVisible: visible, depth: entry.depth + 1 };
                }
            }
            return observerFreeze({ ok: true, visited, sources });
        }
        function scan(root: unknown, frameValue: unknown): PixiTextFrameResult {
            fallbackFrameSequence += 1;
            const frameId = normalizedFrameId(frameValue, fallbackFrameSequence);
            if (frameId === lastFrameId) {
                return freezeFrameResult({
                    status: 'duplicate',
                    frameId,
                    visited: 0,
                    entered: EMPTY_LIST,
                    changed: EMPTY_LIST,
                    departed: EMPTY_LIST,
                });
            }
            const captured = capture(root);
            if (!captured.ok) {
                return freezeFrameResult({
                    status: 'incomplete',
                    frameId,
                    visited: captured.visited,
                    reason: captured.reason,
                    entered: EMPTY_LIST,
                    changed: EMPTY_LIST,
                    departed: EMPTY_LIST,
                });
            }
            const entered: PixiTextSourceSnapshot[] = [];
            const changed: PixiTextSourceChange[] = [];
            const departed: PixiTextSourceSnapshot[] = [];
            const presentIds = new Set<string>();
            for (const capturedSource of captured.sources.values()) {
                let authority = sourceAuthorities.get(capturedSource.source);
                if (!authority) {
                    const sourceId = createSourceId();
                    const snapshot = freezeSnapshot({
                        sourceId,
                        source: capturedSource.source,
                        kind: capturedSource.kind,
                        text: capturedSource.text,
                        visible: capturedSource.visible,
                        revision: 1,
                        frameId,
                    });
                    authority = { sourceId, source: capturedSource.source, snapshot };
                    sourceAuthorities.set(capturedSource.source, authority);
                    activeAuthorities.set(sourceId, authority);
                    entered[entered.length] = snapshot;
                    presentIds.add(sourceId);
                    continue;
                }
                const previous = authority.snapshot;
                const wasActive = activeAuthorities.has(authority.sourceId);
                const sourceChanged = previous.text !== capturedSource.text;
                const visibilityChanged = previous.visible !== capturedSource.visible;
                const kindChanged = previous.kind !== capturedSource.kind;
                const current = freezeSnapshot({
                    sourceId: authority.sourceId,
                    source: authority.source,
                    kind: capturedSource.kind,
                    text: capturedSource.text,
                    visible: capturedSource.visible,
                    revision: previous.revision + (sourceChanged || kindChanged ? 1 : 0),
                    frameId,
                });
                authority.snapshot = current;
                activeAuthorities.set(authority.sourceId, authority);
                presentIds.add(authority.sourceId);
                if (!wasActive)
                    entered[entered.length] = current;
                else if (sourceChanged || visibilityChanged || kindChanged) {
                    const change: PixiTextSourceChange = {
                        previous,
                        current,
                        sourceChanged,
                        visibilityChanged,
                        kindChanged,
                    };
                    observerFreeze(change);
                    changed[changed.length] = change;
                }
            }
            for (const [sourceId, authority] of activeAuthorities) {
                if (presentIds.has(sourceId))
                    continue;
                departed[departed.length] = authority.snapshot;
                activeAuthorities.delete(sourceId);
            }
            lastFrameId = frameId;
            return freezeFrameResult({
                status: 'reconciled',
                frameId,
                visited: captured.visited,
                entered: freezeList(entered),
                changed: freezeList(changed),
                departed: freezeList(departed),
            });
        }
        function retireAll(frameValue: unknown = fallbackFrameSequence + 1): readonly PixiTextSourceSnapshot[] {
            const frameId = normalizedFrameId(frameValue, fallbackFrameSequence + 1);
            const departed: PixiTextSourceSnapshot[] = [];
            for (const authority of activeAuthorities.values()) {
                const previous = authority.snapshot;
                const current = freezeSnapshot({ ...previous, frameId });
                authority.snapshot = current;
                departed[departed.length] = current;
            }
            activeAuthorities.clear();
            lastFrameId = frameId;
            fallbackFrameSequence = Math.max(fallbackFrameSequence, frameId);
            return freezeList(departed);
        }
        function getActiveSnapshots(): readonly PixiTextSourceSnapshot[] {
            const snapshots: PixiTextSourceSnapshot[] = [];
            for (const authority of activeAuthorities.values())
                snapshots[snapshots.length] = authority.snapshot;
            return freezeList(snapshots);
        }
        return observerFreeze({ scan, retireAll, getActiveSnapshots });
    }
    return observerFreeze({ create });
}
