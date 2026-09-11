export interface WindowTextEntryIdentity {
    readonly slotKey: string;
    readonly replacementAnchorKey: string;
}
export type WindowTextEntryIdentityReader = (entry: unknown) => WindowTextEntryIdentity;
export interface WindowTextEntryReference {
    readonly key: unknown;
    readonly entry: unknown;
}
declare const windowTextEntryRemovalPlanBrand: unique symbol;
export interface WindowTextEntryRemovalPlan {
    readonly [windowTextEntryRemovalPlanBrand]: never;
}
export interface WindowTextEntryStore extends Map<unknown, unknown> {
    getLayoutRevision(): number;
    attachIdentityReader(reader: WindowTextEntryIdentityReader): void;
    refreshEntryIdentity(entry: unknown): void;
    rebuildIdentityIndex(): void;
    entriesForSlot(slotKey: string): readonly WindowTextEntryReference[];
    entriesForReplacementAnchor(anchorKey: string): readonly WindowTextEntryReference[];
    entriesForEntry(entry: unknown): readonly WindowTextEntryReference[];
    hasExactEntry(key: unknown, entry: unknown): boolean;
    prepareExactRemoval(key: unknown, entry: unknown): WindowTextEntryRemovalPlan | null;
    exactRemovalMatches(plan: WindowTextEntryRemovalPlan, side: 'expected' | 'prepared'): boolean;
    commitExactRemoval(plan: WindowTextEntryRemovalPlan): boolean;
    compensateExactRemoval(plan: WindowTextEntryRemovalPlan): boolean;
    markSourceIndexPublished(entry: unknown): void;
    markSourceIndexUnpublished(entry: unknown): void;
    sourceIndexIsAuthoritative(): boolean;
    markPendingInvalidation(entry: unknown): void;
    clearPendingInvalidation(entry: unknown): void;
    pendingInvalidationWorkIsAuthoritative(): boolean;
    sealPendingInvalidationWork(): void;
    pendingInvalidationEntries(): readonly WindowTextEntryReference[];
    markCompletedEntry(entry: unknown): void;
    clearCompletedEntry(entry: unknown): void;
    clearCompletedEntries(): void;
    completedEntries(): readonly WindowTextEntryReference[];
}
interface IndexedEntry {
    readonly key: unknown;
    readonly entry: unknown;
    readonly order: number;
    readonly identity: WindowTextEntryIdentity;
}
interface WindowTextIdentityIndexState {
    readonly identityReader: WindowTextEntryIdentityReader | null;
    readonly recordsByKey: Map<unknown, IndexedEntry>;
    readonly recordsByEntry: WeakMap<object, Set<IndexedEntry>>;
    readonly entriesBySlot: Map<string, Set<IndexedEntry>>;
    readonly entriesByReplacementAnchor: Map<string, Set<IndexedEntry>>;
    readonly pendingInvalidationWork: Set<object>;
    readonly completedEntryWork: Set<object>;
    nextOrder: number;
}
interface EntryRemovalAuthority {
    readonly record: IndexedEntry;
    readonly pendingInvalidation: boolean;
    readonly completed: boolean;
    readonly sourceIndexed: boolean;
    readonly sourceUnindexed: boolean;
    restoredRecord: IndexedEntry | null;
    phase: 'prepared' | 'committed' | 'compensated' | 'spent';
}
const authoredStores = new WeakSet<object>();
function isObjectReference(value: unknown): value is object {
    return (typeof value === 'object' && value !== null) || typeof value === 'function';
}
function normalizeIdentity(value: WindowTextEntryIdentity): WindowTextEntryIdentity {
    const slotKey = value.slotKey || '';
    const replacementAnchorKey = value.replacementAnchorKey || '';
    if (!slotKey || !replacementAnchorKey) {
        throw new TypeError('WindowText entry identity must include a slot and replacement anchor.');
    }
    return Object.freeze({ slotKey, replacementAnchorKey });
}
function sameIdentity(left: WindowTextEntryIdentity, right: WindowTextEntryIdentity): boolean {
    return left.slotKey === right.slotKey && left.replacementAnchorKey === right.replacementAnchorKey;
}
function addToBucket(index: Map<string, Set<IndexedEntry>>, key: string, record: IndexedEntry): void {
    const existing = index.get(key);
    if (existing) {
        existing.add(record);
        return;
    }
    index.set(key, new Set([record]));
}
function removeFromBucket(index: Map<string, Set<IndexedEntry>>, key: string, record: IndexedEntry): void {
    const bucket = index.get(key);
    if (!bucket)
        return;
    bucket.delete(record);
    if (bucket.size === 0)
        index.delete(key);
}
function createIdentityIndexState(identityReader: WindowTextEntryIdentityReader | null): WindowTextIdentityIndexState {
    return {
        identityReader,
        recordsByKey: new Map(),
        recordsByEntry: new WeakMap(),
        entriesBySlot: new Map(),
        entriesByReplacementAnchor: new Map(),
        pendingInvalidationWork: new Set(),
        completedEntryWork: new Set(),
        nextOrder: 1,
    };
}
function addRecordToState(state: WindowTextIdentityIndexState, record: IndexedEntry): void {
    state.recordsByKey.set(record.key, record);
    addToBucket(state.entriesBySlot, record.identity.slotKey, record);
    addToBucket(state.entriesByReplacementAnchor, record.identity.replacementAnchorKey, record);
    if (!isObjectReference(record.entry))
        return;
    const existing = state.recordsByEntry.get(record.entry);
    if (existing) {
        existing.add(record);
        return;
    }
    state.recordsByEntry.set(record.entry, new Set([record]));
}
class AuthoredWindowTextEntryStore extends Map<unknown, unknown> implements WindowTextEntryStore {
    private identityIndex = createIdentityIndexState(null);
    private layoutRevision = 0;
    private sourceIndexedEntries = new WeakSet<object>();
    private readonly unindexedSourceEntries = new Set<object>();
    private readonly authoredRemovalPlans = new WeakSet<object>();
    private readonly removalAuthorities = new WeakMap<object, EntryRemovalAuthority>();
    private pendingInvalidationWorkAuthoritative = false;
    constructor() {
        super();
        authoredStores.add(this);
    }
    attachIdentityReader(reader: WindowTextEntryIdentityReader): void {
        if (typeof reader !== 'function') {
            throw new TypeError('WindowText entry identity reader must be callable.');
        }
        if (this.identityIndex.identityReader === reader)
            return;
        if (this.identityIndex.identityReader) {
            throw new Error('WindowText entry identity ownership cannot be replaced.');
        }
        this.identityIndex = this.buildIdentityIndex(reader);
    }
    getLayoutRevision(): number {
        return this.layoutRevision;
    }
    override set(key: unknown, entry: unknown): this {
        const identity = this.identityReader ? normalizeIdentity(this.identityReader(entry)) : null;
        const previous = this.recordsByKey.get(key) ?? null;
        const hadKey = super.has(key);
        const previousEntry = hadKey ? super.get(key) : undefined;
        const layoutChanged = !hadKey ||
            previousEntry !== entry ||
            (identity !== null && (previous === null || !sameIdentity(previous.identity, identity)));
        const sourceIndexWasPublished = isObjectReference(entry) && this.sourceIndexedEntries.has(entry);
        super.set(key, entry);
        if (this.identityReader && identity) {
            const order = previous?.order ?? this.allocateOrder();
            if (previous)
                this.removeRecord(previous);
            this.addRecord(Object.freeze({ key, entry, order, identity }));
        }
        if (isObjectReference(entry)) {
            if (sourceIndexWasPublished)
                this.sourceIndexedEntries.add(entry);
            else
                this.unindexedSourceEntries.add(entry);
        }
        if (layoutChanged)
            this.advanceLayoutRevision();
        return this;
    }
    override delete(key: unknown): boolean {
        const entry = super.get(key);
        const deleted = super.delete(key);
        if (!deleted)
            return false;
        const record = this.recordsByKey.get(key);
        if (record)
            this.removeRecord(record);
        else if (isObjectReference(entry) && !this.containsEntry(entry))
            this.clearSourceIndexCoverage(entry);
        this.advanceLayoutRevision();
        return true;
    }
    override clear(): void {
        const hadEntries = this.size > 0;
        super.clear();
        this.clearIndex();
        this.sourceIndexedEntries = new WeakSet();
        this.unindexedSourceEntries.clear();
        if (hadEntries)
            this.advanceLayoutRevision();
    }
    refreshEntryIdentity(entry: unknown): void {
        if (!this.identityReader || !isObjectReference(entry))
            return;
        const owned = this.recordsByEntry.get(entry);
        if (!owned || owned.size === 0)
            return;
        const pendingInvalidation = this.pendingInvalidationWork.has(entry);
        const completed = this.completedEntryWork.has(entry);
        const identity = normalizeIdentity(this.identityReader(entry));
        const records = Array.from(owned);
        if (records.every((record) => sameIdentity(record.identity, identity)))
            return;
        for (const previous of records) {
            this.removeRecord(previous);
            this.addRecord(Object.freeze({
                key: previous.key,
                entry: previous.entry,
                order: previous.order,
                identity,
            }));
        }
        if (pendingInvalidation)
            this.pendingInvalidationWork.add(entry);
        if (completed)
            this.completedEntryWork.add(entry);
        this.advanceLayoutRevision();
    }
    rebuildIdentityIndex(): void {
        const identityReader = this.identityReader;
        if (!identityReader)
            return;
        this.identityIndex = this.buildIdentityIndex(identityReader);
    }
    entriesForSlot(slotKey: string): readonly WindowTextEntryReference[] {
        return this.readBucket(this.entriesBySlot.get(slotKey));
    }
    entriesForReplacementAnchor(anchorKey: string): readonly WindowTextEntryReference[] {
        return this.readBucket(this.entriesByReplacementAnchor.get(anchorKey));
    }
    entriesForEntry(entry: unknown): readonly WindowTextEntryReference[] {
        if (!isObjectReference(entry))
            return Object.freeze([]);
        return this.readRecords(this.recordsByEntry.get(entry));
    }
    hasExactEntry(key: unknown, entry: unknown): boolean {
        const record = this.recordsByKey.get(key);
        return Boolean(record && record.entry === entry && super.has(key) && super.get(key) === entry);
    }
    prepareExactRemoval(key: unknown, entry: unknown): WindowTextEntryRemovalPlan | null {
        const record = this.recordsByKey.get(key);
        if (!record || record.entry !== entry || !super.has(key) || super.get(key) !== entry)
            return null;
        const plan = Object.freeze({}) as WindowTextEntryRemovalPlan;
        this.authoredRemovalPlans.add(plan);
        this.removalAuthorities.set(plan, {
            record,
            pendingInvalidation: isObjectReference(entry) && this.pendingInvalidationWork.has(entry),
            completed: isObjectReference(entry) && this.completedEntryWork.has(entry),
            sourceIndexed: isObjectReference(entry) && this.sourceIndexedEntries.has(entry),
            sourceUnindexed: isObjectReference(entry) && this.unindexedSourceEntries.has(entry),
            restoredRecord: null,
            phase: 'prepared',
        });
        return plan;
    }
    exactRemovalMatches(plan: WindowTextEntryRemovalPlan, side: 'expected' | 'prepared'): boolean {
        const authority = this.getRemovalAuthority(plan);
        if (!authority)
            return false;
        if (side === 'prepared') {
            return (authority.phase === 'committed' &&
                !this.recordsByKey.has(authority.record.key) &&
                !super.has(authority.record.key));
        }
        if (authority.phase === 'prepared')
            return this.recordIsCurrent(authority.record);
        return (authority.phase === 'compensated' &&
            authority.restoredRecord !== null &&
            this.recordIsCurrent(authority.restoredRecord));
    }
    commitExactRemoval(plan: WindowTextEntryRemovalPlan): boolean {
        const authority = this.getRemovalAuthority(plan);
        if (authority?.phase !== 'prepared')
            return false;
        if (!this.recordIsCurrent(authority.record)) {
            authority.phase = 'spent';
            return false;
        }
        if (!super.delete(authority.record.key)) {
            authority.phase = 'spent';
            return false;
        }
        this.removeRecord(authority.record);
        authority.phase = 'committed';
        this.advanceLayoutRevision();
        return true;
    }
    compensateExactRemoval(plan: WindowTextEntryRemovalPlan): boolean {
        const authority = this.getRemovalAuthority(plan);
        if (authority?.phase !== 'committed')
            return false;
        const { record } = authority;
        if (this.recordsByKey.has(record.key) || super.has(record.key))
            return false;
        const restored = Object.freeze({
            key: record.key,
            entry: record.entry,
            order: record.order,
            identity: record.identity,
        });
        super.set(restored.key, restored.entry);
        this.addRecord(restored);
        if (isObjectReference(restored.entry)) {
            if (authority.pendingInvalidation)
                this.pendingInvalidationWork.add(restored.entry);
            if (authority.completed)
                this.completedEntryWork.add(restored.entry);
            if (authority.sourceIndexed)
                this.sourceIndexedEntries.add(restored.entry);
            if (authority.sourceUnindexed)
                this.unindexedSourceEntries.add(restored.entry);
        }
        this.restoreNativeOrder();
        authority.restoredRecord = restored;
        authority.phase = 'compensated';
        this.advanceLayoutRevision();
        return true;
    }
    markSourceIndexPublished(entry: unknown): void {
        if (!isObjectReference(entry))
            return;
        this.sourceIndexedEntries.add(entry);
        this.unindexedSourceEntries.delete(entry);
    }
    markSourceIndexUnpublished(entry: unknown): void {
        if (!isObjectReference(entry))
            return;
        this.sourceIndexedEntries.delete(entry);
        if (this.recordsByEntry.get(entry)?.size || this.containsEntry(entry))
            this.unindexedSourceEntries.add(entry);
    }
    sourceIndexIsAuthoritative(): boolean {
        return this.unindexedSourceEntries.size === 0;
    }
    markPendingInvalidation(entry: unknown): void {
        this.pendingInvalidationWorkAuthoritative = true;
        this.addEntryWork(this.pendingInvalidationWork, entry);
    }
    clearPendingInvalidation(entry: unknown): void {
        if (isObjectReference(entry))
            this.pendingInvalidationWork.delete(entry);
    }
    pendingInvalidationEntries(): readonly WindowTextEntryReference[] {
        return this.readEntryWork(this.pendingInvalidationWork);
    }
    pendingInvalidationWorkIsAuthoritative(): boolean {
        return this.pendingInvalidationWorkAuthoritative;
    }
    sealPendingInvalidationWork(): void {
        this.pendingInvalidationWorkAuthoritative = true;
    }
    markCompletedEntry(entry: unknown): void {
        this.addEntryWork(this.completedEntryWork, entry);
    }
    clearCompletedEntry(entry: unknown): void {
        if (isObjectReference(entry))
            this.completedEntryWork.delete(entry);
    }
    clearCompletedEntries(): void {
        this.completedEntryWork.clear();
    }
    completedEntries(): readonly WindowTextEntryReference[] {
        return this.readEntryWork(this.completedEntryWork);
    }
    private get identityReader(): WindowTextEntryIdentityReader | null {
        return this.identityIndex.identityReader;
    }
    private get recordsByKey(): Map<unknown, IndexedEntry> {
        return this.identityIndex.recordsByKey;
    }
    private get recordsByEntry(): WeakMap<object, Set<IndexedEntry>> {
        return this.identityIndex.recordsByEntry;
    }
    private get entriesBySlot(): Map<string, Set<IndexedEntry>> {
        return this.identityIndex.entriesBySlot;
    }
    private get entriesByReplacementAnchor(): Map<string, Set<IndexedEntry>> {
        return this.identityIndex.entriesByReplacementAnchor;
    }
    private get pendingInvalidationWork(): Set<object> {
        return this.identityIndex.pendingInvalidationWork;
    }
    private get completedEntryWork(): Set<object> {
        return this.identityIndex.completedEntryWork;
    }
    private get nextOrder(): number {
        return this.identityIndex.nextOrder;
    }
    private set nextOrder(value: number) {
        this.identityIndex.nextOrder = value;
    }
    private buildIdentityIndex(identityReader: WindowTextEntryIdentityReader): WindowTextIdentityIndexState {
        const layoutRevision = this.layoutRevision;
        const nativeEntries = Array.from(super.entries());
        const previous = this.identityIndex;
        const candidate = createIdentityIndexState(identityReader);
        for (const [key, entry] of nativeEntries) {
            const identity = normalizeIdentity(identityReader(entry));
            if (this.layoutRevision !== layoutRevision) {
                throw new Error('WindowText entry membership changed during identity index rebuild.');
            }
            const order = candidate.nextOrder;
            candidate.nextOrder += 1;
            if (!Number.isSafeInteger(candidate.nextOrder)) {
                throw new Error('WindowText entry insertion order was exhausted.');
            }
            addRecordToState(candidate, Object.freeze({ key, entry, order, identity }));
        }
        if (this.layoutRevision !== layoutRevision || this.size !== nativeEntries.length) {
            throw new Error('WindowText entry membership changed during identity index rebuild.');
        }
        for (const [key, entry] of nativeEntries) {
            if (!super.has(key) || super.get(key) !== entry) {
                throw new Error('WindowText entry membership changed during identity index rebuild.');
            }
        }
        for (const entry of previous.pendingInvalidationWork) {
            if (candidate.recordsByEntry.get(entry)?.size)
                candidate.pendingInvalidationWork.add(entry);
        }
        for (const entry of previous.completedEntryWork) {
            if (candidate.recordsByEntry.get(entry)?.size)
                candidate.completedEntryWork.add(entry);
        }
        return candidate;
    }
    private allocateOrder(): number {
        const order = this.nextOrder;
        this.nextOrder += 1;
        if (!Number.isSafeInteger(this.nextOrder)) {
            throw new Error('WindowText entry insertion order was exhausted.');
        }
        return order;
    }
    private advanceLayoutRevision(): void {
        if (this.layoutRevision >= Number.MAX_SAFE_INTEGER) {
            throw new Error('WindowText layout revision was exhausted.');
        }
        this.layoutRevision += 1;
    }
    private addRecord(record: IndexedEntry): void {
        addRecordToState(this.identityIndex, record);
    }
    private removeRecord(record: IndexedEntry): void {
        if (this.recordsByKey.get(record.key) === record)
            this.recordsByKey.delete(record.key);
        removeFromBucket(this.entriesBySlot, record.identity.slotKey, record);
        removeFromBucket(this.entriesByReplacementAnchor, record.identity.replacementAnchorKey, record);
        if (!isObjectReference(record.entry))
            return;
        const owned = this.recordsByEntry.get(record.entry);
        if (!owned)
            return;
        owned.delete(record);
        if (owned.size === 0) {
            this.recordsByEntry.delete(record.entry);
            this.pendingInvalidationWork.delete(record.entry);
            this.completedEntryWork.delete(record.entry);
            this.clearSourceIndexCoverage(record.entry);
        }
    }
    private clearSourceIndexCoverage(entry: object): void {
        this.sourceIndexedEntries.delete(entry);
        this.unindexedSourceEntries.delete(entry);
    }
    private containsEntry(entry: object): boolean {
        for (const candidate of super.values()) {
            if (candidate === entry)
                return true;
        }
        return false;
    }
    private getRemovalAuthority(plan: WindowTextEntryRemovalPlan): EntryRemovalAuthority | null {
        if (!isObjectReference(plan) || !this.authoredRemovalPlans.has(plan))
            return null;
        return this.removalAuthorities.get(plan) ?? null;
    }
    private recordIsCurrent(record: IndexedEntry): boolean {
        return (this.recordsByKey.get(record.key) === record &&
            super.has(record.key) &&
            super.get(record.key) === record.entry);
    }
    private restoreNativeOrder(): void {
        const records = Array.from(this.recordsByKey.values());
        records.sort((left, right) => left.order - right.order);
        super.clear();
        for (const record of records)
            super.set(record.key, record.entry);
    }
    private clearIndex(): void {
        this.identityIndex = createIdentityIndexState(this.identityReader);
    }
    private readBucket(bucket: Set<IndexedEntry> | undefined): readonly WindowTextEntryReference[] {
        return this.readRecords(bucket);
    }
    private readRecords(recordsSource: Set<IndexedEntry> | undefined): readonly WindowTextEntryReference[] {
        if (!recordsSource || recordsSource.size === 0)
            return Object.freeze([]);
        const records = Array.from(recordsSource);
        records.sort((left, right) => left.order - right.order);
        return Object.freeze(records.map((record) => Object.freeze({
            key: record.key,
            entry: record.entry,
        })));
    }
    private addEntryWork(work: Set<object>, entry: unknown): void {
        if (!isObjectReference(entry))
            return;
        const owned = this.recordsByEntry.get(entry);
        if (owned && owned.size > 0)
            work.add(entry);
    }
    private readEntryWork(work: Set<object>): readonly WindowTextEntryReference[] {
        if (work.size === 0)
            return Object.freeze([]);
        const records: IndexedEntry[] = [];
        for (const entry of work) {
            const owned = this.recordsByEntry.get(entry);
            if (!owned || owned.size === 0) {
                work.delete(entry);
                continue;
            }
            for (const record of owned)
                records.push(record);
        }
        records.sort((left, right) => left.order - right.order);
        return Object.freeze(records.map((record) => Object.freeze({
            key: record.key,
            entry: record.entry,
        })));
    }
}
export function createWindowTextEntryStore(): WindowTextEntryStore {
    return new AuthoredWindowTextEntryStore();
}
export function isWindowTextEntryStore(value: unknown): value is WindowTextEntryStore {
    return isObjectReference(value) && authoredStores.has(value);
}
