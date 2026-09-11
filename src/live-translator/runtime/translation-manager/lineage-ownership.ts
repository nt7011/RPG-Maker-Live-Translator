type RuntimeFunction = (this: unknown, ...args: unknown[]) => unknown;
type TerminalStatusStringCandidate = string | number | boolean | bigint | symbol | null | undefined;
interface MutableJobCandidate {
    status: unknown;
}
export interface TranslationLineageCommitAuthority {
    readonly jobId: string;
    readonly key: string;
    readonly lineageId: string;
    readonly lineageSequence: number;
    readonly sourceKey: string;
    readonly cacheable: boolean;
}
interface JobOwnershipIdentity {
    readonly job: object;
    readonly id: string;
    readonly key: string;
    readonly lineage: LineageOwnershipState;
    readonly sequence: number;
    readonly predecessorJobId: string;
    readonly commitAuthority: TranslationLineageCommitAuthority;
}
interface JobOwnershipState {
    readonly identity: JobOwnershipIdentity;
    published: boolean;
    attached: boolean;
    revoked: boolean;
}
interface TranslationLineageJobCell {
    readonly id: string;
    readonly key: string;
    readonly sourceKey: string;
    readonly cacheable: boolean;
    ownership: JobOwnershipState | null;
}
interface LineageOwnershipState {
    readonly id: string;
    readonly key: string;
    readonly jobs: Set<JobOwnershipState>;
    view: TranslationLineageView;
    latestSequence: number;
    latestJobId: string;
    commitOwner: JobOwnershipIdentity | null;
}
export interface TranslationLineageView {
    readonly id: string;
    readonly key: string;
    readonly latestSequence: number;
    readonly latestJobId: string;
    readonly commitOwnerSequence: number;
    readonly commitOwnerJobId: string;
}
export interface TranslationLineageJobProjection {
    readonly lineage: TranslationLineageView | null;
    readonly lineageId: string;
    readonly lineageSequence: number;
    readonly predecessorJobId: string;
    readonly lineageAuthorityRevoked: boolean;
}
export interface TranslationLineageOwnershipOptions {
    readonly activeJobs: unknown;
    readonly jobsByKey: unknown;
    readonly lineagesByKey: unknown;
    readonly allocateLineageId: () => string;
}
export interface TranslationLineageOwnershipRegistry {
    registerJob(job: unknown): TranslationLineageView;
    getRoutedJob(key: unknown): unknown;
    commitWithAuthority(job: unknown, commit: unknown): boolean;
    relinquishJob(job: unknown): boolean;
    finishJob(job: unknown, status: unknown): boolean;
    forgetJob(job: unknown): boolean;
    getActiveJobs(): unknown[];
}
const NativeMap = Map;
const NativeSet = Set;
const NativeWeakMap = WeakMap;
const mapGetIntrinsic = Reflect.getOwnPropertyDescriptor(Map.prototype, 'get')?.value as RuntimeFunction;
const mapSetIntrinsic = Reflect.getOwnPropertyDescriptor(Map.prototype, 'set')?.value as RuntimeFunction;
const mapHasIntrinsic = Reflect.getOwnPropertyDescriptor(Map.prototype, 'has')?.value as RuntimeFunction;
const mapDeleteIntrinsic = Reflect.getOwnPropertyDescriptor(Map.prototype, 'delete')?.value as RuntimeFunction;
const setAddIntrinsic = Reflect.getOwnPropertyDescriptor(Set.prototype, 'add')?.value as RuntimeFunction;
const setHasIntrinsic = Reflect.getOwnPropertyDescriptor(Set.prototype, 'has')?.value as RuntimeFunction;
const setDeleteIntrinsic = Reflect.getOwnPropertyDescriptor(Set.prototype, 'delete')?.value as RuntimeFunction;
const setForEachIntrinsic = Reflect.getOwnPropertyDescriptor(Set.prototype, 'forEach')?.value as RuntimeFunction;
const setSizeIntrinsic = Reflect.getOwnPropertyDescriptor(Set.prototype, 'size')?.get as RuntimeFunction;
const weakMapGetIntrinsic = Reflect.getOwnPropertyDescriptor(WeakMap.prototype, 'get')?.value as RuntimeFunction;
const weakMapSetIntrinsic = Reflect.getOwnPropertyDescriptor(WeakMap.prototype, 'set')?.value as RuntimeFunction;
const lineageJobCells = new NativeWeakMap<object, TranslationLineageJobCell>();
const STORE_BRAND_PROBE = Symbol('translation-lineage-store-brand-probe');
const JOB_PROJECTION_FIELDS = [
    'lineage',
    'lineageId',
    'lineageSequence',
    'predecessorJobId',
    'lineageAuthorityRevoked',
] as const;
function mapGet(store: unknown, key: unknown): unknown {
    return Reflect.apply(mapGetIntrinsic, store, [key]);
}
function mapSet(store: unknown, key: unknown, value: unknown): void {
    Reflect.apply(mapSetIntrinsic, store, [key, value]);
}
function mapHas(store: unknown, key: unknown): boolean {
    return Reflect.apply(mapHasIntrinsic, store, [key]) === true;
}
function mapDelete(store: unknown, key: unknown): boolean {
    return Reflect.apply(mapDeleteIntrinsic, store, [key]) === true;
}
function setAdd(store: unknown, value: unknown): void {
    Reflect.apply(setAddIntrinsic, store, [value]);
}
function setHas(store: unknown, value: unknown): boolean {
    return Reflect.apply(setHasIntrinsic, store, [value]) === true;
}
function setDelete(store: unknown, value: unknown): boolean {
    return Reflect.apply(setDeleteIntrinsic, store, [value]) === true;
}
function setForEach(store: unknown, callback: (value: JobOwnershipState) => void): void {
    Reflect.apply(setForEachIntrinsic, store, [callback]);
}
function setSize(store: unknown): number {
    return Reflect.apply(setSizeIntrinsic, store, []) as number;
}
function weakMapGet<T>(store: WeakMap<object, T>, key: object): T | undefined {
    return Reflect.apply(weakMapGetIntrinsic, store, [key]) as T | undefined;
}
function weakMapSet<T>(store: WeakMap<object, T>, key: object, value: T): void {
    Reflect.apply(weakMapSetIntrinsic, store, [key, value]);
}
function isObject(value: unknown): value is object {
    return (typeof value === 'object' && value !== null) || typeof value === 'function';
}
function stringifyTerminalStatus(value: TerminalStatusStringCandidate): string {
    return String(value);
}
export function createTranslationLineageJob<T extends object>(draft: T): T & TranslationLineageJobProjection {
    const job = { ...draft } as T & TranslationLineageJobProjection;
    const id = readOwnNonemptyString(job, 'id');
    const key = readOwnNonemptyString(job, 'key');
    const sourceKey = readOwnNonemptyString(job, 'sourceKey');
    const cacheable = readOwnBoolean(job, 'cacheable');
    for (const field of JOB_PROJECTION_FIELDS) {
        if (Object.getOwnPropertyDescriptor(job, field) !== undefined) {
            throw new Error('[TranslationService] Lineage projection fields must be unclaimed.');
        }
    }
    const cell: TranslationLineageJobCell = { id, key, sourceKey, cacheable, ownership: null };
    Object.defineProperties(job, {
        id: {
            configurable: false,
            enumerable: true,
            value: id,
            writable: false,
        },
        key: {
            configurable: false,
            enumerable: true,
            value: key,
            writable: false,
        },
        lineage: {
            configurable: false,
            enumerable: true,
            get() {
                const ownership = cell.ownership;
                return ownership?.published && ownership.attached ? ownership.identity.lineage.view : null;
            },
        },
        lineageId: {
            configurable: false,
            enumerable: true,
            get() {
                const ownership = cell.ownership;
                return ownership?.published ? ownership.identity.lineage.id : '';
            },
        },
        lineageSequence: {
            configurable: false,
            enumerable: true,
            get() {
                const ownership = cell.ownership;
                return ownership?.published ? ownership.identity.sequence : 0;
            },
        },
        predecessorJobId: {
            configurable: false,
            enumerable: true,
            get() {
                const ownership = cell.ownership;
                return ownership?.published ? ownership.identity.predecessorJobId : '';
            },
        },
        lineageAuthorityRevoked: {
            configurable: false,
            enumerable: true,
            get() {
                const ownership = cell.ownership;
                return ownership?.published === true && ownership.revoked;
            },
        },
    });
    weakMapSet(lineageJobCells, job, cell);
    return job;
}
function readOwnNonemptyString(target: object, field: 'id' | 'key' | 'sourceKey'): string {
    const descriptor = Object.getOwnPropertyDescriptor(target, field);
    const value = descriptor !== undefined && 'value' in descriptor ? (descriptor as {
        value?: unknown;
    }).value : undefined;
    if (typeof value !== 'string' || value.length === 0) {
        throw new Error('[TranslationService] A lineage job requires own nonempty string identity fields.');
    }
    return value;
}
function readOwnBoolean(target: object, field: 'cacheable'): boolean {
    const descriptor = Object.getOwnPropertyDescriptor(target, field);
    const value = descriptor !== undefined && 'value' in descriptor ? (descriptor as {
        value?: unknown;
    }).value : undefined;
    if (typeof value !== 'boolean') {
        throw new Error('[TranslationService] A lineage job requires an own boolean cacheable field.');
    }
    return value;
}
export function createTranslationLineageOwnershipRegistry(options: TranslationLineageOwnershipOptions): TranslationLineageOwnershipRegistry {
    const { activeJobs, jobsByKey, lineagesByKey, allocateLineageId } = options;
    const lineages = new NativeMap<string, LineageOwnershipState>();
    const routes = new NativeMap<string, JobOwnershipState>();
    const activeOwnership = new NativeSet<JobOwnershipState>();
    let storesValidated = false;
    let transitionOpen = false;
    function ensureNativeProjectionStores(): void {
        if (storesValidated)
            return;
        try {
            mapHas(jobsByKey, STORE_BRAND_PROBE);
            mapHas(lineagesByKey, STORE_BRAND_PROBE);
            setHas(activeJobs, STORE_BRAND_PROBE);
        }
        catch {
            throw new Error('[TranslationService] Lineage ownership requires native Map and Set projection stores.');
        }
        storesValidated = true;
    }
    function runExclusive<T>(operation: () => T): T {
        if (transitionOpen) {
            throw new Error('[TranslationService] A lineage ownership transition is already in progress.');
        }
        transitionOpen = true;
        try {
            return operation();
        }
        finally {
            transitionOpen = false;
        }
    }
    function getOwnership(job: unknown): JobOwnershipState | undefined {
        return isObject(job) ? (weakMapGet(lineageJobCells, job)?.ownership ?? undefined) : undefined;
    }
    function createLineage(key: string): LineageOwnershipState {
        const id = allocateLineageId();
        if (typeof id !== 'string' || id.length === 0) {
            throw new Error('[TranslationService] Lineage identity allocation returned an invalid id.');
        }
        const state: LineageOwnershipState = {
            id,
            key,
            jobs: new NativeSet<JobOwnershipState>(),
            view: null as unknown as TranslationLineageView,
            latestSequence: 0,
            latestJobId: '',
            commitOwner: null,
        };
        const view: TranslationLineageView = {
            id,
            key,
            get latestSequence() {
                return state.latestSequence;
            },
            get latestJobId() {
                return state.latestJobId;
            },
            get commitOwnerSequence() {
                return state.commitOwner?.sequence ?? 0;
            },
            get commitOwnerJobId() {
                return state.commitOwner?.id ?? '';
            },
        };
        state.view = Object.freeze(view);
        return state;
    }
    function registerJob(job: unknown): TranslationLineageView {
        return runExclusive(() => {
            ensureNativeProjectionStores();
            if (!isObject(job)) {
                throw new Error('[TranslationService] A lineage job must be an object.');
            }
            const cell = weakMapGet(lineageJobCells, job);
            if (cell === undefined) {
                throw new Error('[TranslationService] A lineage job must be created by the manager job factory.');
            }
            if (cell.ownership !== null) {
                throw new Error('[TranslationService] A lineage job cannot be registered more than once.');
            }
            const { id, key } = cell;
            let lineage = mapGet(lineages, key) as LineageOwnershipState | undefined;
            const newLineage = lineage === undefined;
            lineage ??= createLineage(key);
            const sequence = lineage.latestSequence + 1;
            if (!Number.isSafeInteger(sequence) || sequence <= 0) {
                throw new Error('[TranslationService] Lineage job sequence is exhausted.');
            }
            const commitAuthority = Object.freeze({
                jobId: id,
                key,
                lineageId: lineage.id,
                lineageSequence: sequence,
                sourceKey: cell.sourceKey,
                cacheable: cell.cacheable,
            });
            const identity: JobOwnershipIdentity = Object.freeze({
                job,
                id,
                key,
                lineage,
                sequence,
                predecessorJobId: lineage.latestJobId,
                commitAuthority,
            });
            const ownership: JobOwnershipState = {
                identity,
                published: false,
                attached: false,
                revoked: false,
            };
            if (newLineage) {
                mapSet(lineages, key, lineage);
                mapSet(lineagesByKey, key, lineage.view);
            }
            lineage.latestSequence = sequence;
            lineage.latestJobId = id;
            setAdd(lineage.jobs, ownership);
            setAdd(activeOwnership, ownership);
            cell.ownership = ownership;
            mapSet(routes, key, ownership);
            setAdd(activeJobs, job);
            mapSet(jobsByKey, key, job);
            ownership.published = true;
            ownership.attached = true;
            return lineage.view;
        });
    }
    function isJoinable(ownership: JobOwnershipState): boolean {
        if (!ownership.published || !ownership.attached || ownership.revoked)
            return false;
        const status = (ownership.identity.job as MutableJobCandidate).status;
        return status === 'queued' || status === 'running';
    }
    function getRoutedJob(key: unknown): unknown {
        return runExclusive(() => {
            const ownership = mapGet(routes, key) as JobOwnershipState | undefined;
            if (ownership === undefined || ownership.identity.key !== key || !isJoinable(ownership))
                return null;
            return ownership.identity.job;
        });
    }
    function commitWithAuthority(job: unknown, commit: unknown): boolean {
        if (transitionOpen) {
            throw new Error('[TranslationService] A lineage ownership transition is already in progress.');
        }
        const ownership = getOwnership(job);
        if (ownership === undefined ||
            !ownership.published ||
            !ownership.attached ||
            ownership.revoked ||
            typeof commit !== 'function') {
            return false;
        }
        const { identity } = ownership;
        const lineage = identity.lineage;
        const previousOwner = lineage.commitOwner;
        if (identity.sequence < (previousOwner?.sequence ?? 0))
            return false;
        lineage.commitOwner = identity;
        try {
            Reflect.apply(commit, undefined, [identity.commitAuthority]);
            return true;
        }
        catch (error) {
            if (lineage.commitOwner === identity)
                lineage.commitOwner = previousOwner;
            throw error;
        }
    }
    function findLatestJoinable(lineage: LineageOwnershipState, excluded: JobOwnershipState): JobOwnershipState | null {
        let latest: JobOwnershipState | null = null;
        setForEach(lineage.jobs, (candidate) => {
            if (candidate === excluded || !isJoinable(candidate))
                return;
            if (latest === null || candidate.identity.sequence > latest.identity.sequence)
                latest = candidate;
        });
        return latest;
    }
    function setRoute(key: string, ownership: JobOwnershipState | null): void {
        if (ownership === null) {
            mapDelete(routes, key);
            mapDelete(jobsByKey, key);
            return;
        }
        mapSet(routes, key, ownership);
        mapSet(jobsByKey, key, ownership.identity.job);
    }
    function relinquishOwnership(ownership: JobOwnershipState): boolean {
        const { identity } = ownership;
        const route = mapGet(routes, identity.key);
        const changed = route === ownership;
        const fallback = changed ? findLatestJoinable(identity.lineage, ownership) : null;
        if (changed)
            setRoute(identity.key, fallback);
        ownership.revoked = true;
        return changed;
    }
    function relinquishJob(job: unknown): boolean {
        return runExclusive(() => {
            ensureNativeProjectionStores();
            const ownership = getOwnership(job);
            if (!ownership?.attached)
                return false;
            return relinquishOwnership(ownership);
        });
    }
    function normalizeTerminalStatus(job: object, suppliedStatus: unknown): string {
        if (suppliedStatus)
            return stringifyTerminalStatus(suppliedStatus as TerminalStatusStringCandidate);
        const jobStatus = (job as MutableJobCandidate).status;
        if (jobStatus)
            return stringifyTerminalStatus(jobStatus as TerminalStatusStringCandidate);
        return 'failed';
    }
    function removeOwnership(ownership: JobOwnershipState): boolean {
        const { identity } = ownership;
        const { lineage } = identity;
        const wasActive = setDelete(activeOwnership, ownership);
        setDelete(activeJobs, identity.job);
        setDelete(lineage.jobs, ownership);
        ownership.attached = false;
        if (setSize(lineage.jobs) === 0) {
            mapDelete(lineages, identity.key);
            mapDelete(lineagesByKey, identity.key);
            lineage.commitOwner = null;
        }
        return wasActive;
    }
    function finishJob(job: unknown, status: unknown): boolean {
        return runExclusive(() => {
            ensureNativeProjectionStores();
            const ownership = getOwnership(job);
            if (!ownership?.attached)
                return false;
            const { identity } = ownership;
            const terminalStatus = normalizeTerminalStatus(identity.job, status);
            const route = mapGet(routes, identity.key);
            const fallback = terminalStatus !== 'completed' && route === ownership
                ? findLatestJoinable(identity.lineage, ownership)
                : null;
            (identity.job as MutableJobCandidate).status = terminalStatus;
            if (route === ownership)
                setRoute(identity.key, terminalStatus === 'completed' ? null : fallback);
            if (terminalStatus !== 'completed')
                ownership.revoked = true;
            return removeOwnership(ownership);
        });
    }
    function forgetJob(job: unknown): boolean {
        return runExclusive(() => {
            ensureNativeProjectionStores();
            const ownership = getOwnership(job);
            if (!ownership?.attached)
                return false;
            relinquishOwnership(ownership);
            return removeOwnership(ownership);
        });
    }
    function getActiveJobs(): unknown[] {
        return runExclusive(() => {
            ensureNativeProjectionStores();
            const jobs: unknown[] = [];
            setForEach(activeOwnership, (ownership) => {
                if (ownership.attached)
                    jobs.push(ownership.identity.job);
            });
            return jobs;
        });
    }
    return {
        registerJob,
        getRoutedJob,
        commitWithAuthority,
        relinquishJob,
        finishJob,
        forgetJob,
        getActiveJobs,
    };
}
