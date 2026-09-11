type PropertyBag = Record<PropertyKey, unknown>;
export type DisplayChainState = 'active-scene' | 'attached' | 'broken-chain' | 'chain-too-deep' | 'destroyed' | 'destroyed-parent' | 'inactive-scene' | 'missing' | 'unattached';
export type SceneMembershipState = 'active-scene' | 'inactive-scene' | 'missing' | 'no-active-scene' | 'no-scene-root';
export interface DisplayChainDescription {
    readonly state: DisplayChainState;
    readonly attached: boolean;
    readonly root: unknown;
    readonly activeScene: unknown;
}
export interface SceneMembershipDescription {
    readonly state: SceneMembershipState;
    readonly inCurrentScene: boolean;
    readonly activeScene: unknown;
    readonly root: unknown;
}
export interface DisplayStateService {
    resolveActiveScene(): unknown;
    isSceneRootCandidate(value: unknown): boolean;
    isDestroyed(value: unknown): boolean;
    isChildInParent(child: unknown, parent: unknown): boolean;
    describeDisplayChain(displayObject: unknown): DisplayChainDescription;
    isDisplayObjectAttached(displayObject: unknown): boolean;
    describeSceneMembership(displayObject: unknown): SceneMembershipDescription;
    isDisplayObjectInCurrentScene(displayObject: unknown): boolean;
}
export interface DisplayStateModule {
    createDisplayStateService(displayScope?: unknown): DisplayStateService;
}
function isPropertyBag(value: unknown): value is PropertyBag {
    return (typeof value === 'object' && value !== null) || typeof value === 'function';
}
function isNonNullObject(value: unknown): value is PropertyBag {
    return typeof value === 'object' && value !== null;
}
function propertyValue(value: unknown, key: PropertyKey): unknown {
    return isPropertyBag(value) ? value[key] : undefined;
}
function truthyOrNull(value: unknown): unknown {
    if (value)
        return value;
    return null;
}
function isRuntimeInstance(value: object, constructorCandidate: unknown): boolean {
    if (!constructorCandidate || !isPropertyBag(constructorCandidate))
        return false;
    const hasInstance = propertyValue(constructorCandidate, Symbol.hasInstance);
    if (typeof hasInstance !== 'function')
        return false;
    return Boolean(Reflect.apply(hasInstance, constructorCandidate, [value]));
}
export function createDisplayStateService(moduleScope: PropertyBag, displayScope: unknown = moduleScope): DisplayStateService {
    let runtimeGlobal: unknown = moduleScope;
    if (displayScope)
        runtimeGlobal = displayScope;
    function resolveActiveScene(): unknown {
        try {
            const sceneManager = truthyOrNull(propertyValue(runtimeGlobal, 'SceneManager'));
            if (!sceneManager)
                return null;
            return propertyValue(sceneManager, '_scene') ? propertyValue(sceneManager, '_scene') : null;
        }
        catch {
            return null;
        }
    }
    function isSceneRootCandidate(value: unknown): boolean {
        if (!value || !isNonNullObject(value))
            return false;
        try {
            const sceneBase = truthyOrNull(propertyValue(runtimeGlobal, 'Scene_Base'));
            if (sceneBase && isRuntimeInstance(value, sceneBase))
                return true;
        }
        catch {
        }
        try {
            const constructor = truthyOrNull(propertyValue(value, 'constructor'));
            const name = constructor && typeof propertyValue(constructor, 'name') === 'string'
                ? propertyValue(constructor, 'name')
                : '';
            if (typeof name === 'string' && name.startsWith('Scene_'))
                return true;
        }
        catch {
        }
        return false;
    }
    function isDestroyed(value: unknown): boolean {
        if (!value)
            return false;
        const privateDestroyed = propertyValue(value, '_destroyed');
        if (privateDestroyed)
            return true;
        return Boolean(propertyValue(value, 'destroyed'));
    }
    function isChildInParent(child: unknown, parent: unknown): boolean {
        if (!child || !parent || propertyValue(child, 'parent') !== parent)
            return false;
        const children = Array.isArray(propertyValue(parent, 'children')) ? propertyValue(parent, 'children') : null;
        return Array.isArray(children) ? children.includes(child) : true;
    }
    function describeDisplayChain(displayObject: unknown): DisplayChainDescription {
        if (!displayObject) {
            return { state: 'missing', attached: false, root: null, activeScene: resolveActiveScene() };
        }
        if (isDestroyed(displayObject)) {
            return { state: 'destroyed', attached: false, root: displayObject, activeScene: resolveActiveScene() };
        }
        let child = displayObject;
        let parent = truthyOrNull(propertyValue(displayObject, 'parent'));
        let depth = 0;
        while (parent && depth < 128) {
            if (isDestroyed(parent)) {
                return { state: 'destroyed-parent', attached: false, root: parent, activeScene: resolveActiveScene() };
            }
            if (!isChildInParent(child, parent)) {
                return { state: 'broken-chain', attached: false, root: parent, activeScene: resolveActiveScene() };
            }
            child = parent;
            parent = truthyOrNull(propertyValue(parent, 'parent'));
            depth += 1;
        }
        if (parent && depth >= 128) {
            return { state: 'chain-too-deep', attached: false, root: child, activeScene: resolveActiveScene() };
        }
        const activeScene = resolveActiveScene();
        const root = child;
        if (activeScene && isSceneRootCandidate(root)) {
            if (root === activeScene) {
                return { state: 'active-scene', attached: root !== displayObject, root, activeScene };
            }
            return { state: 'inactive-scene', attached: false, root, activeScene };
        }
        return {
            state: root === displayObject ? 'unattached' : 'attached',
            attached: Boolean(root) && root !== displayObject,
            root,
            activeScene,
        };
    }
    function isDisplayObjectAttached(displayObject: unknown): boolean {
        return describeDisplayChain(displayObject).attached;
    }
    function describeSceneMembership(displayObject: unknown): SceneMembershipDescription {
        const activeScene = resolveActiveScene();
        if (!activeScene || !displayObject) {
            return {
                state: activeScene ? 'missing' : 'no-active-scene',
                inCurrentScene: true,
                activeScene,
                root: null,
            };
        }
        let cursor: unknown = displayObject;
        let depth = 0;
        while (cursor && depth < 128) {
            if (cursor === activeScene) {
                return { state: 'active-scene', inCurrentScene: true, activeScene, root: cursor };
            }
            if (isSceneRootCandidate(cursor)) {
                return { state: 'inactive-scene', inCurrentScene: false, activeScene, root: cursor };
            }
            cursor = truthyOrNull(propertyValue(cursor, 'parent'));
            depth += 1;
        }
        return { state: 'no-scene-root', inCurrentScene: false, activeScene, root: null };
    }
    function isDisplayObjectInCurrentScene(displayObject: unknown): boolean {
        return describeSceneMembership(displayObject).inCurrentScene;
    }
    return {
        resolveActiveScene,
        isSceneRootCandidate,
        isDestroyed,
        isChildInParent,
        describeDisplayChain,
        isDisplayObjectAttached,
        describeSceneMembership,
        isDisplayObjectInCurrentScene,
    };
}
export function createDisplayStateModule(moduleScope: PropertyBag): DisplayStateModule {
    return {
        createDisplayStateService(displayScope: unknown = moduleScope): DisplayStateService {
            return createDisplayStateService(moduleScope, displayScope);
        },
    };
}
