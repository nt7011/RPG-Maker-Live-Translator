import { characters } from './styled-text.js';
import { textOrigin, type BitmapContent } from './bitmap-content.js';
import { fragmentPlacement, groupBitmapFragments, type BitmapFragment, type BitmapFragmentMember, } from './bitmap-fragment-geometry.js';
import { BITMAP_LIMITS } from './bitmap-limits.js';
import type { BitmapRenderUse } from '../presentation/bitmap-render-host.js';
import type { NativeLifetime } from '../runtime/native-lifetime.js';
import type { RuntimeResourceObserver } from '../runtime/diagnostics-ingress.js';
export interface BitmapPhysicalMember extends BitmapFragmentMember {
    readonly owner: WeakRef<object>;
}
export interface BitmapFragmentGroup {
    members: readonly BitmapPhysicalMember[];
    contents: readonly BitmapContent[];
    closed: boolean;
    baseline: boolean;
    release: (() => void) | null;
}
export interface VisibleBitmapFragmentGroup {
    readonly group: BitmapFragmentGroup;
    readonly fragments: readonly BitmapFragment[];
}
export function createBitmapFragmentGroups(options: {
    readonly lifetime: NativeLifetime;
    readonly resourceEvent?: RuntimeResourceObserver | undefined;
    readonly content: (source: HTMLCanvasElement) => BitmapContent | null;
    readonly retain: (contents: readonly BitmapContent[]) => (() => void) | null;
    readonly capture: (content: BitmapContent) => boolean;
    readonly retired: (group: BitmapFragmentGroup, replacement: boolean) => void;
}) {
    const groups = new Set<BitmapFragmentGroup>();
    const owners = new WeakMap<object, {
        group: BitmapFragmentGroup;
        reference: WeakRef<object>;
    }>();
    let disposed = false;
    function isDisposed(): boolean {
        return disposed;
    }
    function retire(group: BitmapFragmentGroup, replacement = false): void {
        if (group.closed)
            return;
        group.closed = true;
        groups.delete(group);
        for (const member of group.members) {
            options.lifetime.forget(member.owner);
            const owner = member.owner.deref();
            if (owner !== undefined && owners.get(owner)?.group === group)
                owners.delete(owner);
        }
        group.release?.();
        group.release = null;
        group.contents = [];
        group.members = [];
        options.retired(group, replacement);
    }
    function capture(contents: readonly BitmapContent[]): (() => void) | null {
        const release = options.retain(contents);
        if (release === null)
            return null;
        let accepted = false;
        try {
            accepted = contents.every(options.capture) && !disposed;
        }
        finally {
            if (!accepted)
                release();
        }
        return accepted ? release : null;
    }
    function register(group: BitmapFragmentGroup, fragments: readonly BitmapFragment[]): boolean {
        if (disposed || group.closed)
            return false;
        if (group.release !== null)
            return true;
        if (groups.size >= BITMAP_LIMITS.occurrences) {
            options.resourceEvent?.({ kind: 'refused', name: 'occurrences', requested: 1 });
            return false;
        }
        const release = capture(group.contents);
        if (release === null)
            return false;
        group.release = release;
        groups.add(group);
        for (const [index, member] of group.members.entries()) {
            const owner = fragments[index]?.use.owner;
            if (owner === undefined)
                throw new Error('Missing physical fragment owner.');
            owners.set(owner, { group, reference: member.owner });
            options.lifetime.watch(member.owner, group, retire);
        }
        return true;
    }
    function prepare(uses: readonly BitmapRenderUse[]): readonly VisibleBitmapFragmentGroup[] {
        if (isDisposed())
            return [];
        const current = new Map<object, BitmapFragment>(), duplicates = new Set<object>();
        for (const use of uses) {
            if ((use.owner as {
                destroyed?: unknown;
            }).destroyed === true) {
                const group = owners.get(use.owner)?.group;
                if (group !== undefined)
                    retire(group);
                continue;
            }
            const content = options.content(use.source);
            if (content === null)
                continue;
            const fragment = { use, content };
            if (fragmentPlacement(fragment) === null)
                continue;
            if (current.has(use.owner))
                duplicates.add(use.owner);
            current.set(use.owner, fragment);
        }
        for (const owner of duplicates)
            current.delete(owner);
        if (isDisposed())
            return [];
        const present = new Set(current.keys().map((owner) => owners.get(owner)?.group));
        const admissions = present.has(undefined) || present.size > 1 ? groupBitmapFragments([...current.values()]) : [];
        for (const fragments of admissions) {
            const existing = new Set(fragments.flatMap((fragment) => {
                const group = owners.get(fragment.use.owner)?.group;
                return group === undefined ? [] : [group];
            }));
            const positions = new Map(fragments.map((fragment, index) => [owners.get(fragment.use.owner)?.reference, index]));
            if (existing.values().some((group) => {
                let previous = -1;
                return group.members.some((member) => {
                    const next = positions.get(member.owner);
                    if (next === undefined || next <= previous)
                        return true;
                    previous = next;
                    return false;
                });
            }))
                continue;
            const previous = existing.size === 1 ? existing.values().next().value : undefined;
            if (previous !== undefined && previous.members.length >= fragments.length)
                continue;
            const members = fragments.flatMap((fragment): BitmapPhysicalMember[] => {
                const reference = fragmentPlacement(fragment);
                return reference === null
                    ? []
                    : [
                        {
                            reference,
                            sourceText: textOrigin(fragment.content).source.text,
                            owner: owners.get(fragment.use.owner)?.reference ?? new WeakRef(fragment.use.owner),
                        },
                    ];
            });
            if (members.length !== fragments.length)
                continue;
            const contents = fragments.map((fragment) => fragment.content);
            const release = capture(contents);
            if (release === null)
                continue;
            if (previous !== undefined) {
                const old = previous.release;
                previous.contents = contents;
                previous.baseline = true;
                previous.members = members;
                previous.release = release;
                old?.();
                for (const [index, member] of members.entries()) {
                    const owner = fragments[index]?.use.owner;
                    if (owner === undefined)
                        continue;
                    if (!owners.has(owner))
                        options.lifetime.watch(member.owner, previous, retire);
                    owners.set(owner, { group: previous, reference: member.owner });
                }
            }
            else {
                if (existing.size === 0 && groups.size >= BITMAP_LIMITS.occurrences) {
                    release();
                    continue;
                }
                for (const group of existing)
                    retire(group, true);
                if (isDisposed()) {
                    release();
                    return [];
                }
                const group = { members, contents, baseline: true, closed: false, release };
                groups.add(group);
                for (const [index, member] of members.entries()) {
                    const owner = fragments[index]?.use.owner;
                    if (owner === undefined)
                        continue;
                    owners.set(owner, { group, reference: member.owner });
                    options.lifetime.watch(member.owner, group, retire);
                }
            }
        }
        const selected = new Set(current
            .keys()
            .map((owner) => owners.get(owner)?.group)
            .filter((group) => group !== undefined));
        const references = new Map(current.values().map((fragment) => [owners.get(fragment.use.owner)?.reference, fragment] as const));
        const visible: VisibleBitmapFragmentGroup[] = [];
        for (const group of selected) {
            const fragments = group.members.map((member) => references.get(member.owner));
            if (fragments.some((fragment) => fragment === undefined))
                continue;
            const complete = fragments as BitmapFragment[];
            const contents = complete.map((fragment) => fragment.content);
            if (contents.some((content, index) => content !== group.contents[index])) {
                const texts = contents.map((content) => textOrigin(content).source.text);
                if (characters(texts.join('')).length !== texts.reduce((n, text) => n + characters(text).length, 0))
                    continue;
                const release = capture(contents);
                if (release === null)
                    continue;
                const members = group.members.map((member, index) => {
                    const oldContent = group.contents[index], nextContent = contents[index], sourceText = texts[index];
                    if (oldContent === undefined || nextContent === undefined || sourceText === undefined)
                        throw new Error('Missing physical fragment content.');
                    const old = textOrigin(oldContent), next = textOrigin(nextContent);
                    const [a, b, c, d, x, y] = member.reference;
                    return {
                        ...member,
                        sourceText,
                        reference: [
                            (a * old.width) / next.width,
                            (b * old.width) / next.width,
                            (c * old.height) / next.height,
                            (d * old.height) / next.height,
                            x,
                            y,
                        ] as const,
                    };
                });
                const oldRelease = group.release;
                group.contents = contents;
                group.members = members;
                group.release = release;
                oldRelease?.();
            }
            visible.push({ group, fragments: complete });
        }
        for (const fragment of current.values())
            if (!owners.has(fragment.use.owner)) {
                const reference = fragmentPlacement(fragment);
                if (reference === null)
                    continue;
                visible.push({
                    fragments: [fragment],
                    group: {
                        closed: false,
                        baseline: false,
                        release: null,
                        members: [
                            {
                                owner: new WeakRef(fragment.use.owner),
                                reference,
                                sourceText: textOrigin(fragment.content).source.text,
                            },
                        ],
                        contents: [fragment.content],
                    },
                });
            }
        return visible;
    }
    return {
        prepare,
        register,
        retire,
        owner: (native: object) => owners.get(native)?.group,
        dispose: () => {
            disposed = true;
            for (const group of groups)
                retire(group);
        },
    };
}
