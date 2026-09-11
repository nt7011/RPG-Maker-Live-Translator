import type { HookWrapperModule, MethodWrapperLease } from '../../runtime/hook-wrapper.js';
import type { PixiCanvasTextPresenter } from './canvas-text-presenter.js';
import type { PixiTextPresentationAuthority } from './presentation-authority.js';
type PropertySource = Record<PropertyKey, unknown>;
type RuntimeFunction = (this: unknown, ...argumentsList: unknown[]) => unknown;
export interface PixiTextHostHooksOptions {
    readonly scope: unknown;
    readonly hookWrapper: HookWrapperModule;
    readonly textPrototype?: unknown;
    readonly canvasPresenter: PixiCanvasTextPresenter;
    readonly presentationAuthority: PixiTextPresentationAuthority;
    readonly onScreenFrame: (root: unknown, frameId: number) => unknown;
    readonly onActivated?: (result: PixiTextHostHookActiveResult) => unknown;
    readonly onError?: (error: unknown) => unknown;
}
export type PixiTextHostHookActiveResult = Readonly<{
    readonly status: 'installed';
    readonly activation: 'active';
    readonly reason: string;
    readonly screenBoundary: string;
    readonly readinessBoundary: string;
    readonly presentationAvailable: boolean;
    readonly renderMethods: readonly string[];
}>;
export type PixiTextHostHookInstallResult = PixiTextHostHookActiveResult | Readonly<{
    readonly status: 'installed';
    readonly activation: 'waiting';
    readonly reason: 'pixi-screen-render-boundary-deferred';
    readonly screenBoundary: '';
    readonly readinessBoundary: string;
    readonly presentationAvailable: false;
    readonly renderMethods: readonly [
    ];
}> | Readonly<{
    readonly status: 'skipped';
    readonly activation: 'unavailable';
    readonly reason: string;
    readonly screenBoundary: '';
    readonly readinessBoundary: '';
    readonly presentationAvailable: false;
    readonly renderMethods: readonly [
    ];
}>;
export interface PixiTextHostHooks {
    install(): PixiTextHostHookInstallResult;
    dispose(): boolean;
}
export interface PixiTextHostHooksModule {
    create(options: PixiTextHostHooksOptions): PixiTextHostHooks;
}
interface ScreenBoundary {
    readonly target: object;
    readonly methodName: string;
    readonly label: string;
    readonly readRoot: (argumentsList: readonly unknown[]) => unknown;
}
interface ReadinessBoundary {
    readonly target: object;
    readonly methodName: string;
    readonly label: string;
}
interface OwnedLease {
    readonly lease: MethodWrapperLease;
    released: boolean;
}
const hostFreeze = Object.freeze;
const hostReflectApply = Reflect.apply;
const hostReflectGet = Reflect.get;
const EMPTY_METHODS: readonly [
] = hostFreeze([]);
function isPropertySource(value: unknown): value is PropertySource {
    return (typeof value === 'object' && value !== null) || typeof value === 'function';
}
function readProperty(value: unknown, key: PropertyKey): unknown {
    return isPropertySource(value) ? hostReflectGet(value, key, value) : undefined;
}
function freezeResult<Result extends object>(result: Result): Readonly<Result> {
    hostFreeze(result);
    return result;
}
function unavailableScreenResult(): PixiTextHostHookInstallResult {
    return freezeResult({
        status: 'skipped' as const,
        activation: 'unavailable' as const,
        reason: 'pixi-screen-render-boundary-unavailable',
        screenBoundary: '' as const,
        readinessBoundary: '' as const,
        presentationAvailable: false as const,
        renderMethods: EMPTY_METHODS,
    });
}
function waitingScreenResult(readinessBoundary: string): PixiTextHostHookInstallResult {
    return freezeResult({
        status: 'installed' as const,
        activation: 'waiting' as const,
        reason: 'pixi-screen-render-boundary-deferred' as const,
        screenBoundary: '' as const,
        readinessBoundary,
        presentationAvailable: false as const,
        renderMethods: EMPTY_METHODS,
    });
}
function resolveScreenBoundary(scope: unknown): ScreenBoundary | null {
    let graphics: unknown;
    try {
        graphics = readProperty(scope, 'Graphics');
    }
    catch {
        return null;
    }
    if (!isPropertySource(graphics))
        return null;
    try {
        if (typeof readProperty(graphics, 'render') === 'function') {
            return {
                target: graphics,
                methodName: 'render',
                label: 'Graphics.render',
                readRoot(argumentsList: readonly unknown[]): unknown {
                    return argumentsList[0];
                },
            };
        }
    }
    catch {
    }
    let application: unknown;
    try {
        application = readProperty(graphics, 'app');
        if (!isPropertySource(application) || typeof readProperty(application, 'render') !== 'function')
            return null;
    }
    catch {
        return null;
    }
    return {
        target: application,
        methodName: 'render',
        label: 'Graphics.app.render',
        readRoot(): unknown {
            try {
                return readProperty(application, 'stage');
            }
            catch {
                return null;
            }
        },
    };
}
function resolveReadinessBoundary(scope: unknown): ReadinessBoundary | null {
    let graphics: unknown;
    try {
        graphics = readProperty(scope, 'Graphics');
        if (!isPropertySource(graphics) || typeof readProperty(graphics, 'initialize') !== 'function')
            return null;
    }
    catch {
        return null;
    }
    return {
        target: graphics,
        methodName: 'initialize',
        label: 'Graphics.initialize',
    };
}
function resolveRenderMethods(textPrototype: unknown): readonly string[] {
    if (!isPropertySource(textPrototype))
        return EMPTY_METHODS;
    try {
        if (typeof readProperty(textPrototype, 'render') === 'function')
            return hostFreeze(['render']);
    }
    catch {
        return EMPTY_METHODS;
    }
    const methods: string[] = [];
    for (const methodName of ['renderWebGL', 'renderCanvas'] as const) {
        try {
            if (typeof readProperty(textPrototype, methodName) === 'function')
                methods[methods.length] = methodName;
        }
        catch {
            return EMPTY_METHODS;
        }
    }
    hostFreeze(methods);
    return methods;
}
export function createPixiTextHostHooksModule(): PixiTextHostHooksModule {
    function create(optionsValue: PixiTextHostHooksOptions): PixiTextHostHooks {
        const candidate: unknown = optionsValue;
        if (!isPropertySource(candidate))
            throw new TypeError('[PIXI Text] Host-hook options are required.');
        const hookWrapperCandidate = readProperty(candidate, 'hookWrapper') as HookWrapperModule | undefined;
        const canvasPresenterCandidate = readProperty(candidate, 'canvasPresenter') as PixiCanvasTextPresenter | undefined;
        const presentationAuthorityCandidate = readProperty(candidate, 'presentationAuthority') as PixiTextPresentationAuthority | undefined;
        const onScreenFrameCandidate = readProperty(candidate, 'onScreenFrame');
        if (!hookWrapperCandidate || typeof hookWrapperCandidate.acquireMethodWrapper !== 'function') {
            throw new TypeError('[PIXI Text] Reversible hook authority is required.');
        }
        if (!canvasPresenterCandidate || typeof canvasPresenterCandidate.isTranslatorOwned !== 'function') {
            throw new TypeError('[PIXI Text] Owned-object classification is required.');
        }
        if (!presentationAuthorityCandidate || typeof presentationAuthorityCandidate.render !== 'function') {
            throw new TypeError('[PIXI Text] Presentation authority is required.');
        }
        if (typeof onScreenFrameCandidate !== 'function') {
            throw new TypeError('[PIXI Text] Screen-frame observer is required.');
        }
        const scope = readProperty(candidate, 'scope');
        const textPrototype = readProperty(candidate, 'textPrototype');
        const hookWrapper: HookWrapperModule = hookWrapperCandidate;
        const canvasPresenter: PixiCanvasTextPresenter = canvasPresenterCandidate;
        const presentationAuthority: PixiTextPresentationAuthority = presentationAuthorityCandidate;
        const onScreenFrame = onScreenFrameCandidate as RuntimeFunction;
        const onActivatedCandidate = readProperty(candidate, 'onActivated');
        const onActivated = typeof onActivatedCandidate === 'function' ? (onActivatedCandidate as RuntimeFunction) : null;
        const onErrorCandidate = readProperty(candidate, 'onError');
        const onError = typeof onErrorCandidate === 'function' ? (onErrorCandidate as RuntimeFunction) : null;
        const screenToken = hostFreeze({});
        const renderToken = hostFreeze({});
        const readinessToken = hostFreeze({});
        const leases: OwnedLease[] = [];
        let readinessLease: OwnedLease | null = null;
        let readinessBoundaryLabel = '';
        let active = false;
        let activationAllowed = false;
        let installed = false;
        let installationResult: PixiTextHostHookInstallResult | null = null;
        let frameSequence = 0;
        function reportError(error: unknown): void {
            if (!onError)
                return;
            try {
                hostReflectApply(onError, undefined, [error]);
            }
            catch {
            }
        }
        function retainLease(lease: MethodWrapperLease): OwnedLease {
            const owned = { lease, released: false };
            leases[leases.length] = owned;
            return owned;
        }
        function releaseLease(owned: OwnedLease): boolean {
            if (owned.released)
                return true;
            try {
                const released = owned.lease.dispose();
                if (released)
                    owned.released = true;
                return released;
            }
            catch {
                return false;
            }
        }
        function installScreenBoundary(boundary: ScreenBoundary): boolean {
            const lease = hookWrapper.acquireMethodWrapper(boundary.target, boundary.methodName, {
                property: '__rmltPixiTextScreenFrame',
                token: screenToken,
                createWrapper(original: RuntimeFunction) {
                    return function (this: unknown, ...argumentsList: unknown[]): unknown {
                        if (active) {
                            frameSequence += 1;
                            try {
                                const root = boundary.readRoot(argumentsList);
                                hostReflectApply(onScreenFrame, undefined, [root, frameSequence]);
                            }
                            catch (error) {
                                reportError(error);
                            }
                        }
                        return hostReflectApply(original, this, argumentsList);
                    };
                },
            });
            if (!lease)
                return false;
            retainLease(lease);
            return true;
        }
        function notifyActivated(result: PixiTextHostHookActiveResult): void {
            if (!onActivated)
                return;
            try {
                hostReflectApply(onActivated, undefined, [result]);
            }
            catch (error) {
                reportError(error);
            }
        }
        function invokeNative(original: RuntimeFunction, receiver: unknown, argumentsList: readonly unknown[]): unknown {
            return hostReflectApply(original, receiver, argumentsList);
        }
        function installRenderMethod(methodName: string): boolean {
            const lease = hookWrapper.acquireMethodWrapper(textPrototype, methodName, {
                property: '__rmltPixiTextOwnedPaint',
                token: renderToken,
                createWrapper(original: RuntimeFunction) {
                    return function (this: unknown, ...argumentsList: unknown[]): unknown {
                        if (!active)
                            return invokeNative(original, this, argumentsList);
                        try {
                            if (canvasPresenter.isTranslatorOwned(this)) {
                                return invokeNative(original, this, argumentsList);
                            }
                            if (!presentationAuthority.hasPresentation(this)) {
                                return invokeNative(original, this, argumentsList);
                            }
                        }
                        catch (error) {
                            reportError(error);
                            return invokeNative(original, this, argumentsList);
                        }
                        return presentationAuthority.render(this, methodName, argumentsList, original);
                    };
                },
            });
            if (!lease)
                return false;
            retainLease(lease);
            return true;
        }
        function rollbackRenderLeases(firstRenderLeaseIndex: number): boolean {
            let complete = true;
            for (let index = leases.length - 1; index >= firstRenderLeaseIndex; index -= 1) {
                const owned = leases[index];
                if (owned && !releaseLease(owned))
                    complete = false;
            }
            return complete;
        }
        function activateScreenBoundary(): PixiTextHostHookActiveResult | null {
            if (active && installationResult?.activation === 'active')
                return installationResult;
            const boundary = resolveScreenBoundary(scope);
            if (!boundary || !installScreenBoundary(boundary))
                return null;
            const renderMethods = resolveRenderMethods(textPrototype);
            const firstRenderLeaseIndex = leases.length;
            let presentationAvailable = renderMethods.length > 0;
            for (const methodName of renderMethods) {
                if (installRenderMethod(methodName))
                    continue;
                presentationAvailable = false;
                rollbackRenderLeases(firstRenderLeaseIndex);
                break;
            }
            active = true;
            installed = true;
            const result: PixiTextHostHookActiveResult = freezeResult({
                status: 'installed' as const,
                activation: 'active' as const,
                reason: presentationAvailable
                    ? 'pixi-text-observation-and-owned-presentation-installed'
                    : 'pixi-text-observation-installed-presentation-unavailable',
                screenBoundary: boundary.label,
                readinessBoundary: readinessBoundaryLabel,
                presentationAvailable,
                renderMethods: presentationAvailable ? renderMethods : EMPTY_METHODS,
            });
            installationResult = result;
            if (readinessLease)
                releaseLease(readinessLease);
            return result;
        }
        function installReadinessBoundary(boundary: ReadinessBoundary): boolean {
            const lease = hookWrapper.acquireMethodWrapper(boundary.target, boundary.methodName, {
                property: '__rmltPixiTextHostReadiness',
                token: readinessToken,
                createWrapper(original: RuntimeFunction) {
                    return function (this: unknown, ...argumentsList: unknown[]): unknown {
                        const result = hostReflectApply(original, this, argumentsList);
                        if (!active && activationAllowed) {
                            const activated = activateScreenBoundary();
                            if (activated)
                                notifyActivated(activated);
                        }
                        return result;
                    };
                },
            });
            if (!lease)
                return false;
            readinessLease = retainLease(lease);
            readinessBoundaryLabel = boundary.label;
            return true;
        }
        function install(): PixiTextHostHookInstallResult {
            if (installed && installationResult)
                return installationResult;
            const activated = activateScreenBoundary();
            if (activated) {
                activationAllowed = true;
                return activated;
            }
            const readinessBoundary = resolveReadinessBoundary(scope);
            if (!readinessBoundary || !installReadinessBoundary(readinessBoundary)) {
                installationResult = unavailableScreenResult();
                return installationResult;
            }
            activationAllowed = true;
            installed = true;
            installationResult = waitingScreenResult(readinessBoundary.label);
            return installationResult;
        }
        function dispose(): boolean {
            activationAllowed = false;
            active = false;
            let complete = true;
            for (let index = leases.length - 1; index >= 0; index -= 1) {
                const owned = leases[index];
                if (owned && !releaseLease(owned))
                    complete = false;
            }
            if (complete) {
                installed = false;
                readinessLease = null;
                readinessBoundaryLabel = '';
                installationResult = null;
            }
            return complete;
        }
        return hostFreeze({ install, dispose });
    }
    return hostFreeze({ create });
}
