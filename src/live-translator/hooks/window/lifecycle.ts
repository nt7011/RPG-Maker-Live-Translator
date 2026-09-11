import type { WindowBaseLifecycleHooksModule } from './base-lifecycle.js';
type PropertySource = Record<PropertyKey, unknown>;
type UnknownFunction = (...args: unknown[]) => unknown;
export interface WindowLifecycleInstallResult {
    readonly status: 'installed' | 'skipped';
    readonly reason: string;
    readonly retryable?: boolean;
}
export interface WindowLifecycleModule {
    install(options?: unknown): WindowLifecycleInstallResult;
}
interface WindowLifecycleEnvironment {
    readonly scope: unknown;
    readonly baseLifecycle: WindowBaseLifecycleHooksModule;
}
function isPropertySource(value: unknown): value is PropertySource {
    return (typeof value === 'object' && value !== null) || typeof value === 'function';
}
function isCallable(value: unknown): value is UnknownFunction {
    return typeof value === 'function';
}
function propertyValue(value: unknown, key: PropertyKey): unknown {
    return isPropertySource(value) ? value[key] : undefined;
}
function destructurableOptions(value: unknown): PropertySource {
    if (value === null || value === undefined) {
        throw new TypeError('Window lifecycle hook options cannot be null or undefined.');
    }
    if (isPropertySource(value))
        return value;
    const boxed: unknown = Reflect.apply(Object, undefined, [value]);
    if (isPropertySource(boxed))
        return boxed;
    throw new TypeError('Window lifecycle hook options are not property-readable.');
}
function defaultWhenUndefined(value: unknown, defaultValue: unknown): unknown {
    return value === undefined ? defaultValue : value;
}
function isWindowBaseLifecycleHooksModule(value: unknown): value is WindowBaseLifecycleHooksModule {
    return isPropertySource(value) && isCallable(value['install']);
}
function resolveLifecycleEnvironment(options: PropertySource, defaultScope: unknown, defaultBaseLifecycle: WindowBaseLifecycleHooksModule): WindowLifecycleEnvironment {
    const environment = propertyValue(options, 'environment');
    if (!isPropertySource(environment)) {
        return {
            scope: defaultScope,
            baseLifecycle: defaultBaseLifecycle,
        };
    }
    const scopeOverride = propertyValue(environment, 'scope');
    const baseLifecycleOverride = propertyValue(environment, 'baseLifecycle');
    if (baseLifecycleOverride !== undefined && !isWindowBaseLifecycleHooksModule(baseLifecycleOverride)) {
        throw new TypeError('Window lifecycle environment baseLifecycle is not installable.');
    }
    return {
        scope: scopeOverride === undefined ? defaultScope : scopeOverride,
        baseLifecycle: baseLifecycleOverride ?? defaultBaseLifecycle,
    };
}
export function createWindowLifecycleModule(baseLifecycle: WindowBaseLifecycleHooksModule, runtimeScope: unknown): WindowLifecycleModule {
    function installWindowLifecycleHooks(options: unknown = {}): WindowLifecycleInstallResult {
        const source = destructurableOptions(options);
        const environment = resolveLifecycleEnvironment(source, runtimeScope, baseLifecycle);
        const logger = propertyValue(source, 'logger');
        const dbg = defaultWhenUndefined(propertyValue(source, 'dbg'), () => undefined);
        const windowLifecycle = defaultWhenUndefined(propertyValue(source, 'windowLifecycle'), null);
        const windowRegistry = propertyValue(source, 'windowRegistry');
        const addWindowToRegistry = propertyValue(source, 'addWindowToRegistry');
        const ensureWindowRegistered = propertyValue(source, 'ensureWindowRegistered');
        const registerWindowLifecyclePrototypeInstaller = defaultWhenUndefined(propertyValue(source, 'registerWindowLifecyclePrototypeInstaller'), null);
        const unregisterWindow = propertyValue(source, 'unregisterWindow');
        const getWindowTextHelpers = defaultWhenUndefined(propertyValue(source, 'getWindowTextHelpers'), null);
        const getWindowDrawHelpers = defaultWhenUndefined(propertyValue(source, 'getWindowDrawHelpers'), null);
        if (!logger ||
            !windowRegistry ||
            !isCallable(addWindowToRegistry) ||
            !isCallable(ensureWindowRegistered) ||
            !isCallable(unregisterWindow)) {
            throw new Error('[WindowLifecycleHooks] Missing required dependencies.');
        }
        const WindowBase = environment.scope && propertyValue(environment.scope, 'Window_Base');
        if (!WindowBase || !propertyValue(WindowBase, 'prototype')) {
            return {
                status: 'skipped',
                reason: 'Window_Base is unavailable.',
                retryable: true,
            };
        }
        environment.baseLifecycle.install({
            logger,
            dbg,
            windowLifecycle,
            windowRegistry,
            addWindowToRegistry,
            ensureWindowRegistered,
            registerWindowLifecyclePrototypeInstaller,
            unregisterWindow,
            getWindowTextHelpers,
            getWindowDrawHelpers,
            environment: {
                scope: environment.scope,
            },
        });
        return {
            status: 'installed',
            reason: 'Window_Base lifecycle hooks installed.',
        };
    }
    return {
        install: installWindowLifecycleHooks,
    };
}
