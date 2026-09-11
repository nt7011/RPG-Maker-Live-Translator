type PropertyBag = Record<PropertyKey, unknown>;
export interface RuntimePathsModule {
    getPath(name: string): string;
    getPathContext(): PropertyBag;
    setPathContext(paths: unknown): PropertyBag;
}
function isNonNullObject(value: unknown): value is object {
    return typeof value === 'object' && value !== null;
}
function clonePathContext(paths: unknown): PropertyBag {
    const cloned: PropertyBag = {};
    return Object.assign(cloned, isNonNullObject(paths) ? paths : {});
}
export function createRuntimePathsModule(scope: PropertyBag): RuntimePathsModule {
    function getPathContext(): PropertyBag {
        return clonePathContext(scope['LiveTranslatorPaths']);
    }
    function setPathContext(paths: unknown): PropertyBag {
        const next = clonePathContext(paths);
        scope['LiveTranslatorPaths'] = next;
        return getPathContext();
    }
    function getPath(name: string): string {
        const value = getPathContext()[name];
        return typeof value === 'string' ? value : '';
    }
    return {
        getPathContext,
        setPathContext,
        getPath,
    };
}
