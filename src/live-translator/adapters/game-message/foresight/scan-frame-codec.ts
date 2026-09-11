const SCAN_FRAME_FIELDS = Object.freeze([
    'listGeneration',
    'listIdentity',
    'listLength',
    'index',
    'endIndex',
    'expectedIndent',
    'interpreterId',
    'listId',
    'commonEventId',
    'commonEventName',
    'parentInterpreterId',
    'parentListId',
    'parentCommandIndex',
    'parentCommandCode',
    'nestedListType',
    'nestedListName',
    'nestedListPath',
    'nestedListIndex',
    'branchLabel',
    'branchIndex',
    'branchCount',
    'resumeBranchDepth',
    'resumeBranchPath',
] as const);
type ScanFrameField = (typeof SCAN_FRAME_FIELDS)[number];
type ScanFrameFieldSnapshot = Partial<Record<ScanFrameField, unknown>>;
const QUEUED_FRAME_IDENTITY_FIELDS = Object.freeze([
    'listIdentity',
    'index',
    'endIndex',
    'expectedIndent',
] as const satisfies readonly ScanFrameField[]);
export interface ForesightScanFrameCodecPolicy {
    readonly maxDepth: number;
    readonly maxWork: number;
}
export interface ForesightScanFrameCodec {
    readonly cloneFrames: (frames: unknown) => unknown[];
    readonly cloneFrame: (frame: unknown) => unknown;
    readonly createIdentity: (frames: unknown, identifyListIdentity: (identity: unknown) => string) => string | null;
}
interface CapturedFrameNode {
    readonly fields: ScanFrameFieldSnapshot;
    readonly children: CapturedFrameNode[];
    readonly referenceId: number | null;
}
interface CaptureContext {
    readonly allowCycles: boolean;
    readonly fields: readonly ScanFrameField[];
    readonly nodes: WeakMap<object, CapturedFrameNode>;
    readonly active: WeakSet<object>;
    work: number;
    nextReferenceId: number;
}
function isObjectIdentity(value: unknown): value is object {
    return (typeof value === 'object' && value !== null) || typeof value === 'function';
}
function readDescriptorValue(receiver: object, descriptor: PropertyDescriptor | undefined): unknown {
    if (!descriptor)
        return undefined;
    if ('value' in descriptor)
        return descriptor.value;
    const getter = descriptor.get as ((this: object) => unknown) | undefined;
    return getter ? Reflect.apply(getter, receiver, []) : undefined;
}
function captureSequence(value: unknown, remainingWork: number): unknown[] {
    if (!Array.isArray(value))
        return [];
    const descriptors = Object.getOwnPropertyDescriptors(value) as unknown as Record<PropertyKey, PropertyDescriptor>;
    const lengthDescriptor = descriptors['length'];
    const length = lengthDescriptor && 'value' in lengthDescriptor ? Number(lengthDescriptor.value) : Number.NaN;
    if (!Number.isSafeInteger(length) || length < 0) {
        throw new TypeError('[Foresight] Frame sequence length is invalid.');
    }
    if (length > remainingWork) {
        throw new RangeError('[Foresight] Pending frame graph exceeds its work budget.');
    }
    const values: unknown[] = new Array(length);
    for (let index = 0; index < length; index += 1) {
        values[index] = readDescriptorValue(value, descriptors[String(index)]);
    }
    return values;
}
function captureFrameFields(source: unknown, selectedFields: readonly ScanFrameField[]): {
    readonly fields: ScanFrameFieldSnapshot;
    readonly pending: unknown;
} {
    const descriptors: Record<PropertyKey, PropertyDescriptor> = isObjectIdentity(source)
        ? Object.getOwnPropertyDescriptors(source)
        : {};
    const fields = {} as ScanFrameFieldSnapshot;
    for (const field of selectedFields) {
        fields[field] = isObjectIdentity(source) ? readDescriptorValue(source, descriptors[field]) : undefined;
    }
    return {
        fields,
        pending: isObjectIdentity(source) ? readDescriptorValue(source, descriptors['pendingNestedFrames']) : undefined,
    };
}
function normalizePolicyBoundary(value: number, name: string): number {
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new TypeError(`[Foresight] ${name} must be a non-negative safe integer.`);
    }
    return value;
}
export function createForesightScanFrameCodec(createScanFrame: (options?: unknown) => unknown, policy: ForesightScanFrameCodecPolicy): ForesightScanFrameCodec {
    const maxDepth = normalizePolicyBoundary(policy.maxDepth, 'Frame depth budget');
    const maxWork = normalizePolicyBoundary(policy.maxWork, 'Frame work budget');
    function captureNode(source: unknown, depth: number, context: CaptureContext): CapturedFrameNode {
        context.work += 1;
        if (context.work > maxWork) {
            throw new RangeError('[Foresight] Pending frame graph exceeds its work budget.');
        }
        if (depth > maxDepth) {
            throw new RangeError('[Foresight] Pending frame graph exceeds its depth budget.');
        }
        const identity = isObjectIdentity(source) ? source : null;
        if (identity) {
            const existing = context.nodes.get(identity);
            if (existing) {
                if (context.active.has(identity) && !context.allowCycles) {
                    throw new TypeError('[Foresight] Pending frame graph contains a cycle.');
                }
                return existing;
            }
        }
        const captured = captureFrameFields(source, context.fields);
        const node: CapturedFrameNode = {
            fields: captured.fields,
            children: [],
            referenceId: identity ? context.nextReferenceId : null,
        };
        if (identity) {
            context.nextReferenceId += 1;
            context.nodes.set(identity, node);
            context.active.add(identity);
        }
        try {
            const children = captureSequence(captured.pending, maxWork - context.work);
            for (const child of children)
                node.children.push(captureNode(child, depth + 1, context));
        }
        finally {
            if (identity)
                context.active.delete(identity);
        }
        return node;
    }
    function captureGraph(roots: readonly unknown[], fields: readonly ScanFrameField[], allowCycles: boolean): CapturedFrameNode[] {
        if (roots.length > maxWork) {
            throw new RangeError('[Foresight] Pending frame graph exceeds its work budget.');
        }
        const context: CaptureContext = {
            allowCycles,
            fields,
            nodes: new WeakMap<object, CapturedFrameNode>(),
            active: new WeakSet<object>(),
            work: 0,
            nextReferenceId: 0,
        };
        return roots.map((root) => captureNode(root, 0, context));
    }
    function cloneGraph(roots: readonly CapturedFrameNode[]): unknown[] {
        const clones = new Map<CapturedFrameNode, unknown>();
        function cloneNode(node: CapturedFrameNode): unknown {
            if (clones.has(node))
                return clones.get(node);
            const pendingNestedFrames = Object.freeze(node.children.map(cloneNode));
            const frame = createScanFrame({ ...node.fields, pendingNestedFrames });
            if (!isObjectIdentity(frame)) {
                throw new TypeError('[Foresight] Scan-frame construction did not return an object.');
            }
            clones.set(node, frame);
            return frame;
        }
        return roots.map(cloneNode);
    }
    function cloneFrames(frames: unknown): unknown[] {
        const roots = captureSequence(frames, maxWork);
        return cloneGraph(captureGraph(roots, SCAN_FRAME_FIELDS, false));
    }
    function cloneFrame(frame: unknown): unknown {
        const cloned = cloneGraph(captureGraph([frame], SCAN_FRAME_FIELDS, false))[0];
        if (!cloned)
            throw new TypeError('[Foresight] Scan frame could not be cloned.');
        return cloned;
    }
    function encodeIdentityComponent(value: string): string {
        return `${String(value.length)}:${value}`;
    }
    function identityInteger(value: unknown): string | null {
        if (value === null)
            return 'null';
        if (value === undefined)
            return 'undefined';
        const valueType = typeof value;
        if (valueType !== 'number' && valueType !== 'string' && valueType !== 'boolean' && valueType !== 'bigint') {
            return null;
        }
        const numeric = Number(value);
        if (!Number.isFinite(numeric))
            return null;
        return `${valueType}:${String(Math.floor(numeric))}`;
    }
    function serializeIdentity(roots: readonly CapturedFrameNode[], identifyListIdentity: (identity: unknown) => string): string | null {
        const emitted = new Set<CapturedFrameNode>();
        function serializeNode(node: CapturedFrameNode): string | null {
            if (node.referenceId !== null && emitted.has(node))
                return `r${String(node.referenceId)};`;
            if (node.referenceId !== null)
                emitted.add(node);
            const listIdentity = identifyListIdentity(node.fields.listIdentity);
            if (typeof listIdentity !== 'string') {
                throw new TypeError('[Foresight] Queued frame list identity must be a string.');
            }
            const indexIdentity = identityInteger(node.fields.index);
            const endIndexIdentity = identityInteger(node.fields.endIndex);
            const expectedIndentIdentity = identityInteger(node.fields.expectedIndent);
            if (indexIdentity === null || endIndexIdentity === null || expectedIndentIdentity === null)
                return null;
            const fields = [listIdentity, indexIdentity, endIndexIdentity, expectedIndentIdentity];
            const serializedChildren: string[] = [];
            for (const child of node.children) {
                const serialized = serializeNode(child);
                if (serialized === null)
                    return null;
                serializedChildren.push(serialized);
            }
            const children = serializedChildren.join(',');
            return `f${node.referenceId === null ? 'v' : String(node.referenceId)}(${fields
                .map(encodeIdentityComponent)
                .join('')})[${children}]`;
        }
        const serializedRoots: string[] = [];
        for (const root of roots) {
            const serialized = serializeNode(root);
            if (serialized === null)
                return null;
            serializedRoots.push(serialized);
        }
        return `q${String(roots.length)}[${serializedRoots.join(',')}]`;
    }
    function createIdentity(frames: unknown, identifyListIdentity: (identity: unknown) => string): string | null {
        if (typeof identifyListIdentity !== 'function') {
            throw new TypeError('[Foresight] Queued frame list identity provider must be a function.');
        }
        let graph: CapturedFrameNode[];
        try {
            graph = captureGraph(captureSequence(frames, maxWork), QUEUED_FRAME_IDENTITY_FIELDS, true);
        }
        catch {
            return null;
        }
        return serializeIdentity(graph, identifyListIdentity);
    }
    return Object.freeze({ cloneFrames, cloneFrame, createIdentity });
}
