type PropertyBag = Record<PropertyKey, unknown>;
const applyIntrinsic = Reflect.apply;
const freezeIntrinsic = Object.freeze;
const getOwnDescriptorIntrinsic = Object.getOwnPropertyDescriptor;
const stringIntrinsic = String;
const TypeErrorIntrinsic = TypeError;
const getContentsPublication = getOwnDescriptorIntrinsic(WeakMap.prototype, 'get')?.value as (this: WeakMap<object, CurrentContentsPublication>, key: object) => CurrentContentsPublication | undefined;
const setContentsPublication = getOwnDescriptorIntrinsic(WeakMap.prototype, 'set')?.value as (this: WeakMap<object, CurrentContentsPublication>, key: object, value: CurrentContentsPublication) => WeakMap<object, CurrentContentsPublication>;
const deleteContentsPublication = getOwnDescriptorIntrinsic(WeakMap.prototype, 'delete')?.value as (this: WeakMap<object, CurrentContentsPublication>, key: object) => boolean;
export interface SurfaceOwnershipMatch {
    readonly owner: unknown;
    readonly windowInstance: unknown;
    readonly windowData: unknown;
    readonly contents: unknown;
    readonly source: string;
}
export interface ContentsOwnershipDescription {
    readonly owner: unknown;
    readonly windowInstance: unknown;
    readonly windowData: unknown;
    readonly source: string;
    readonly surfaceId: string;
    readonly auxiliarySurfaceId: string;
    readonly surfaceSlotId: string;
    readonly adapterId: string;
    readonly surfaceType: string;
    readonly role: string;
    readonly windowOwned: boolean;
}
export type ContentsPublicationInspection = Readonly<{
    readonly status: 'observed';
    readonly owner: unknown;
    readonly descriptor: unknown;
    readonly error: null;
}> | Readonly<{
    readonly status: 'failed';
    readonly owner: null;
    readonly descriptor: null;
    readonly error: unknown;
}>;
export interface ContentsPublicationHandle {
    readonly owner: unknown;
    readonly descriptor: unknown;
}
export type ExactContentsPublicationInspection = Readonly<{
    readonly status: 'observed';
    readonly publication: ContentsPublicationHandle | null;
    readonly error: null;
}> | Readonly<{
    readonly status: 'failed';
    readonly publication: null;
    readonly error: unknown;
}>;
export type ContentsPublicationExchangeReceipt = Readonly<{
    readonly status: 'conflict' | 'exchanged' | 'failed';
    readonly terminal: boolean;
    readonly previous: ContentsPublicationHandle | null;
    readonly publication: ContentsPublicationHandle | null;
    readonly error: unknown;
}>;
type CurrentContentsPublication = ContentsPublicationHandle;
export interface SurfaceOwnershipService {
    readonly windowRegistry: unknown;
    readonly rememberContentsOwner: (contents: unknown, ownerWindow: unknown, descriptor?: unknown) => boolean;
    readonly forgetContentsOwner: (contents: unknown, ownerWindow?: unknown) => boolean;
    readonly readContentsOwner: (contents: unknown) => unknown;
    readonly inspectContentsPublication: (contents: unknown) => ContentsPublicationInspection;
    readonly inspectExactContentsPublication: (contents: unknown) => ExactContentsPublicationInspection;
    readonly compareExchangeContentsPublication: (contents: unknown, expected: ContentsPublicationHandle | null, ownerWindow?: unknown, descriptor?: unknown) => ContentsPublicationExchangeReceipt;
    readonly readContentsDescriptor: (contents: unknown) => unknown;
    readonly describeContentsOwnership: (contents: unknown) => ContentsOwnershipDescription | null;
    readonly getWindowData: (windowInstance: unknown) => unknown;
    readonly resolveWindowSurfaceForContents: (contents: unknown) => SurfaceOwnershipMatch | null;
    readonly isWindowOwnedBitmap: (bitmap: unknown) => boolean;
    readonly windowEntryBelongsToContents: (entry: unknown, contents: unknown, ownerWindow?: unknown, windowData?: unknown) => boolean;
}
export interface SurfaceOwnershipModule {
    readonly createSurfaceOwnershipService: (options?: unknown) => SurfaceOwnershipService;
}
const UNOWNED_CONTENTS_OWNERSHIP: ContentsOwnershipDescription = freezeIntrinsic({
    owner: null,
    windowInstance: null,
    windowData: null,
    source: '',
    surfaceId: '',
    auxiliarySurfaceId: '',
    surfaceSlotId: '',
    adapterId: '',
    surfaceType: '',
    role: '',
    windowOwned: false,
});
function isPropertyBag(value: unknown): value is PropertyBag {
    return (typeof value === 'object' && value !== null) || typeof value === 'function';
}
function isRecordObject(value: unknown): value is PropertyBag {
    return typeof value === 'object' && value !== null;
}
function propertyValue(value: unknown, key: PropertyKey): unknown {
    return isPropertyBag(value) ? value[key] : undefined;
}
function recordOrEmpty(value: unknown): PropertyBag {
    return isRecordObject(value) ? value : {};
}
function truthyOr<Value, Fallback>(value: Value, fallback: () => Fallback): Value | Fallback {
    if (value)
        return value;
    return fallback();
}
function stringValue(value: unknown): string {
    const converted: unknown = applyIntrinsic(stringIntrinsic, undefined, [value]);
    if (typeof converted !== 'string')
        throw new TypeErrorIntrinsic('String conversion did not return text.');
    return converted;
}
function ownDataPropertyValue(value: unknown, key: PropertyKey): unknown {
    if (!isPropertyBag(value))
        return undefined;
    const descriptor = getOwnDescriptorIntrinsic(value, key);
    if (!descriptor)
        return undefined;
    if (!('value' in descriptor)) {
        throw new TypeErrorIntrinsic('Surface ownership descriptors require own data properties.');
    }
    return descriptor.value;
}
function hasMethod(target: unknown, name: PropertyKey): boolean {
    return typeof propertyValue(target, name) === 'function';
}
function callMethod(target: unknown, name: PropertyKey, args: readonly unknown[], description: string): unknown {
    const method = propertyValue(target, name);
    if (typeof method !== 'function')
        throw new TypeErrorIntrinsic(description + ' is not callable.');
    return applyIntrinsic(method, target, args);
}
function canStoreWeakState(value: unknown): value is object {
    const type = typeof value;
    return value !== null && (type === 'object' || type === 'function');
}
function firstString(...values: unknown[]): string {
    let index = 0;
    while (index < values.length) {
        const value = values[index];
        index += 1;
        if (value === undefined || value === null)
            continue;
        const text = stringValue(value);
        if (text)
            return text;
    }
    return '';
}
function normalizeContentsDescriptor(ownerWindow: unknown, descriptor: unknown = {}): PropertyBag {
    const source = recordOrEmpty(descriptor);
    const role = firstString(ownDataPropertyValue(source, 'role'), ownDataPropertyValue(source, 'contentsRole'));
    return freezeIntrinsic({
        owner: truthyOr(ownerWindow, () => truthyOr(ownDataPropertyValue(source, 'owner'), () => null)),
        adapterId: firstString(ownDataPropertyValue(source, 'adapterId'), ownDataPropertyValue(source, 'sourceAdapter')),
        surfaceType: firstString(ownDataPropertyValue(source, 'surfaceType')),
        role,
        windowOwned: ownDataPropertyValue(source, 'windowOwned') === true ||
            role === 'window-contents' ||
            role === 'message-contents',
        reason: firstString(ownDataPropertyValue(source, 'reason')),
        surfaceId: firstString(ownDataPropertyValue(source, 'surfaceId')),
        auxiliarySurfaceId: firstString(ownDataPropertyValue(source, 'auxiliarySurfaceId')),
        surfaceSlotId: firstString(ownDataPropertyValue(source, 'surfaceSlotId')),
        contentsGeneration: ownDataPropertyValue(source, 'contentsGeneration'),
    });
}
function createSurfaceOwnershipService(options: unknown = {}): SurfaceOwnershipService {
    const values = recordOrEmpty(options);
    const contentsPublications = new WeakMap<object, CurrentContentsPublication>();
    const windowRegistry = truthyOr(propertyValue(values, 'windowRegistry'), () => new WeakMap<object, unknown>());
    function rememberContentsOwner(contents: unknown, ownerWindow: unknown, descriptor: unknown = null): boolean {
        if (!canStoreWeakState(contents) || !ownerWindow)
            return false;
        try {
            const publication = freezeIntrinsic({
                owner: ownerWindow,
                descriptor: normalizeContentsDescriptor(ownerWindow, descriptor),
            });
            applyIntrinsic(setContentsPublication, contentsPublications, [contents, publication]);
            return true;
        }
        catch {
            return false;
        }
    }
    function forgetContentsOwner(contents: unknown, ownerWindow: unknown = null): boolean {
        if (!canStoreWeakState(contents))
            return false;
        const inspection = inspectContentsPublication(contents);
        if (inspection.status !== 'observed' || !inspection.owner)
            return false;
        if (ownerWindow && inspection.owner !== ownerWindow)
            return false;
        try {
            return applyIntrinsic(deleteContentsPublication, contentsPublications, [contents]);
        }
        catch {
            return false;
        }
    }
    function inspectExactContentsPublication(contents: unknown): ExactContentsPublicationInspection {
        if (!canStoreWeakState(contents)) {
            return freezeIntrinsic({
                status: 'failed' as const,
                publication: null,
                error: new TypeErrorIntrinsic('Contents publication inspection requires an object reference.'),
            });
        }
        try {
            const publication = applyIntrinsic(getContentsPublication, contentsPublications, [contents]) ?? null;
            return freezeIntrinsic({ status: 'observed' as const, publication, error: null });
        }
        catch (error) {
            return freezeIntrinsic({ status: 'failed' as const, publication: null, error });
        }
    }
    function compareExchangeContentsPublication(contents: unknown, expected: ContentsPublicationHandle | null, ownerWindow: unknown = null, descriptor: unknown = null): ContentsPublicationExchangeReceipt {
        if (!canStoreWeakState(contents) || (expected !== null && !canStoreWeakState(expected))) {
            return freezeIntrinsic({
                status: 'failed',
                terminal: false,
                previous: null,
                publication: null,
                error: new TypeErrorIntrinsic('Contents publication exchange requires exact object identities.'),
            });
        }
        let next: CurrentContentsPublication | null = null;
        try {
            if (ownerWindow) {
                next = freezeIntrinsic({
                    owner: ownerWindow,
                    descriptor: normalizeContentsDescriptor(ownerWindow, descriptor),
                });
            }
            const current = applyIntrinsic(getContentsPublication, contentsPublications, [contents]) ?? null;
            if (current !== expected) {
                return freezeIntrinsic({
                    status: 'conflict',
                    terminal: true,
                    previous: current,
                    publication: current,
                    error: null,
                });
            }
            if (next)
                applyIntrinsic(setContentsPublication, contentsPublications, [contents, next]);
            else
                applyIntrinsic(deleteContentsPublication, contentsPublications, [contents]);
            return freezeIntrinsic({
                status: 'exchanged',
                terminal: true,
                previous: current,
                publication: next,
                error: null,
            });
        }
        catch (error) {
            return freezeIntrinsic({
                status: 'failed',
                terminal: false,
                previous: null,
                publication: null,
                error,
            });
        }
    }
    function readCurrentContentsPublication(contents: unknown): CurrentContentsPublication {
        const inspection = inspectContentsPublication(contents);
        if (inspection.status !== 'observed')
            return { owner: null, descriptor: null };
        const { owner, descriptor } = inspection;
        if (propertyValue(descriptor, 'adapterId') === 'window' && propertyValue(descriptor, 'contentsGeneration')) {
            const generation = propertyValue(descriptor, 'contentsGeneration');
            const descriptorOwner = propertyValue(descriptor, 'owner');
            if (!owner || descriptorOwner !== owner || propertyValue(generation, '_trUnregistered') === true) {
                return { owner: null, descriptor: null };
            }
        }
        return { owner, descriptor };
    }
    function readContentsOwner(contents: unknown): unknown {
        return readCurrentContentsPublication(contents).owner;
    }
    function inspectContentsPublication(contents: unknown): ContentsPublicationInspection {
        if (!canStoreWeakState(contents)) {
            return freezeIntrinsic({
                status: 'failed' as const,
                owner: null,
                descriptor: null,
                error: new TypeErrorIntrinsic('Contents publication inspection requires an object reference.'),
            });
        }
        try {
            const publication = applyIntrinsic(getContentsPublication, contentsPublications, [contents]) as unknown;
            const owner = propertyValue(publication, 'owner');
            const descriptor = propertyValue(publication, 'descriptor');
            return freezeIntrinsic({
                status: 'observed' as const,
                owner: owner ?? null,
                descriptor: descriptor ?? null,
                error: null,
            });
        }
        catch (error) {
            return freezeIntrinsic({
                status: 'failed' as const,
                owner: null,
                descriptor: null,
                error,
            });
        }
    }
    function readContentsDescriptor(contents: unknown): unknown {
        return readCurrentContentsPublication(contents).descriptor;
    }
    function getWindowData(windowInstance: unknown): unknown {
        if (!windowInstance || !hasMethod(windowRegistry, 'get'))
            return null;
        try {
            return truthyOr(callMethod(windowRegistry, 'get', [windowInstance], 'window registry get'), () => null);
        }
        catch {
            return null;
        }
    }
    function resolveCurrentWindowSurfaceForContents(contents: unknown, publication: CurrentContentsPublication): SurfaceOwnershipMatch | null {
        if (!contents)
            return null;
        const owner = publication.owner;
        if (owner) {
            const ownerData = getWindowData(owner);
            if (ownerData) {
                return freezeIntrinsic({
                    owner,
                    windowInstance: owner,
                    windowData: ownerData,
                    contents,
                    source: 'contentsOwner',
                });
            }
        }
        return null;
    }
    function resolveWindowSurfaceForContents(contents: unknown): SurfaceOwnershipMatch | null {
        return resolveCurrentWindowSurfaceForContents(contents, readCurrentContentsPublication(contents));
    }
    function describeContentsOwnership(contents: unknown): ContentsOwnershipDescription | null {
        if (!contents)
            return null;
        const publication = readCurrentContentsPublication(contents);
        const descriptor = publication.descriptor;
        const owner = publication.owner;
        if (!owner)
            return UNOWNED_CONTENTS_OWNERSHIP;
        const surface = resolveCurrentWindowSurfaceForContents(contents, publication);
        const surfaceWindow = propertyValue(surface, 'windowInstance');
        return freezeIntrinsic({
            owner,
            windowInstance: truthyOr(surfaceWindow, () => owner),
            windowData: truthyOr(propertyValue(surface, 'windowData'), () => null),
            source: firstString(propertyValue(surface, 'source'), descriptor ? 'contentsDescriptor' : ''),
            surfaceId: firstString(propertyValue(descriptor, 'surfaceId')),
            auxiliarySurfaceId: firstString(propertyValue(descriptor, 'auxiliarySurfaceId')),
            surfaceSlotId: firstString(propertyValue(descriptor, 'surfaceSlotId')),
            adapterId: firstString(propertyValue(descriptor, 'adapterId')),
            surfaceType: firstString(propertyValue(descriptor, 'surfaceType')),
            role: firstString(propertyValue(descriptor, 'role')),
            windowOwned: Boolean(propertyValue(descriptor, 'windowOwned')) || Boolean(surface),
        });
    }
    function isWindowOwnedBitmap(bitmap: unknown): boolean {
        if (!bitmap)
            return false;
        const publication = readCurrentContentsPublication(bitmap);
        if (!publication.owner)
            return false;
        const descriptor = publication.descriptor;
        if (propertyValue(descriptor, 'windowOwned'))
            return true;
        return Boolean(publication.owner);
    }
    function windowEntryBelongsToContents(entry: unknown, contents: unknown, ownerWindow: unknown = null, windowData: unknown = null): boolean {
        if (!entry || !contents)
            return false;
        const entryContents = propertyValue(entry, 'contentsBitmap');
        if (entryContents)
            return entryContents === contents;
        const owner = truthyOr(ownerWindow, () => readContentsOwner(contents));
        const data = truthyOr(windowData, () => (owner ? getWindowData(owner) : null));
        const ownerContents = propertyValue(owner, 'contents');
        const activeContents = owner && ownerContents ? ownerContents : propertyValue(data, 'contentsBitmap');
        return activeContents ? activeContents === contents : true;
    }
    return freezeIntrinsic({
        windowRegistry,
        rememberContentsOwner,
        forgetContentsOwner,
        readContentsOwner,
        inspectContentsPublication,
        inspectExactContentsPublication,
        compareExchangeContentsPublication,
        readContentsDescriptor,
        describeContentsOwnership,
        getWindowData,
        resolveWindowSurfaceForContents,
        isWindowOwnedBitmap,
        windowEntryBelongsToContents,
    });
}
export function createSurfaceOwnershipModule(): SurfaceOwnershipModule {
    return { createSurfaceOwnershipService };
}
