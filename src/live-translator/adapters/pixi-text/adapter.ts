import type { HookWrapperModule } from '../../runtime/hook-wrapper.js';
import type { PixiCanvasTextPaintResult, PixiCanvasTextPresentationPreparation, PixiCanvasTextPresenter, PixiCanvasTextPresenterModule, PixiCanvasTextSourceSupport, } from './canvas-text-presenter.js';
import type { PixiTextFrameObserverModule } from './frame-observer.js';
import type { PixiTextHostHookActiveResult, PixiTextHostHooks, PixiTextHostHooksModule } from './host-hooks.js';
import type { PixiTextPresentationAuthorityModule } from './presentation-authority.js';
import type { PixiTextRuntimeCapabilitiesModule } from './runtime-capabilities.js';
import type { PixiTextCoreBridge, PixiTextCoreBridgeModule } from './textcore-bridge.js';
type PropertySource = Record<PropertyKey, unknown>;
type RuntimeFunction = (this: unknown, ...argumentsList: unknown[]) => unknown;
export interface PixiTextAdapterContext {
    readonly adapterContract?: unknown;
    readonly createTextSource?: unknown;
    readonly logger?: unknown;
}
export interface PixiTextAdapterInstallResult extends PropertySource {
    readonly status: 'installed' | 'skipped' | 'failed';
    readonly reason: string;
    readonly retryable: boolean;
    readonly rollbackComplete: boolean;
    readonly presentationAvailable: boolean;
    readonly screenBoundary: string;
    readonly dispose: () => boolean;
}
export interface PixiTextAdapter {
    install(): PixiTextAdapterInstallResult;
    dispose(): boolean;
}
export interface PixiTextModule {
    install(context?: PixiTextAdapterContext): PixiTextAdapterInstallResult;
    create(context?: PixiTextAdapterContext): PixiTextAdapter;
}
export interface PixiTextModuleDependencies {
    readonly capabilities: PixiTextRuntimeCapabilitiesModule;
    readonly canvasPresenter: PixiCanvasTextPresenterModule;
    readonly frameObserver: PixiTextFrameObserverModule;
    readonly hostHooks: PixiTextHostHooksModule;
    readonly hookWrapper: HookWrapperModule;
    readonly presentationAuthority: PixiTextPresentationAuthorityModule;
    readonly textCoreBridge: PixiTextCoreBridgeModule;
}
export interface PixiTextModuleEnvironment {
    readonly scope: unknown;
}
interface PublicPixiCanvasHost {
    readonly textConstructor: unknown;
    readonly containerConstructor: unknown;
    readonly textPrototype: object | null;
}
interface PresenterGate {
    readonly presenter: PixiCanvasTextPresenter;
    enable(): void;
    disable(): void;
}
interface InstallationResources {
    readonly bridge: PixiTextCoreBridge;
    readonly gate: PresenterGate;
    readonly hostHooks: PixiTextHostHooks;
}
const REQUIRED_CONTRACT_METHODS = Object.freeze([
    'observeRecord',
    'requestItemTranslation',
    'retireItem',
    'setItemVisibility',
    'setItemTranslationPriority',
    'subscribeRecords',
    'notifyRenderCommandReady',
    'invalidateRenderTarget',
]);
const adapterFreeze = Object.freeze;
const adapterReflectApply = Reflect.apply;
const adapterReflectGet = Reflect.get;
function isPropertySource(value: unknown): value is PropertySource {
    return (typeof value === 'object' && value !== null) || typeof value === 'function';
}
function readProperty(value: unknown, key: PropertyKey): unknown {
    return isPropertySource(value) ? adapterReflectGet(value, key, value) : undefined;
}
function freezeResult<Result extends object>(result: Result): Readonly<Result> {
    adapterFreeze(result);
    return result;
}
function publicConstructorPrototype(value: unknown): object | null {
    if (typeof value !== 'function')
        return null;
    try {
        const prototype = readProperty(value, 'prototype');
        return isPropertySource(prototype) ? prototype : null;
    }
    catch {
        return null;
    }
}
function inspectPublicCanvasHost(scope: unknown): PublicPixiCanvasHost {
    let pixi: unknown = null;
    try {
        pixi = readProperty(scope, 'PIXI');
    }
    catch {
    }
    let textConstructor: unknown = null;
    let containerConstructor: unknown = null;
    if (isPropertySource(pixi)) {
        try {
            textConstructor = readProperty(pixi, 'Text');
        }
        catch {
            textConstructor = null;
        }
        try {
            containerConstructor = readProperty(pixi, 'Container');
        }
        catch {
            containerConstructor = null;
        }
    }
    return adapterFreeze({
        textConstructor,
        containerConstructor,
        textPrototype: publicConstructorPrototype(textConstructor),
    });
}
function createUnavailablePresenter(reason: string): PixiCanvasTextPresenter {
    const support: PixiCanvasTextSourceSupport = freezeResult({ supported: false, reason });
    return adapterFreeze({
        describeSource(): PixiCanvasTextSourceSupport {
            return support;
        },
        prepare(): PixiCanvasTextPresentationPreparation {
            return freezeResult({ status: 'rejected', reason });
        },
        paint(): PixiCanvasTextPaintResult {
            return freezeResult({ status: 'rejected', reason });
        },
        release(): boolean {
            return false;
        },
        isTranslatorOwned(): boolean {
            return false;
        },
    });
}
function createPresenterGate(delegate: PixiCanvasTextPresenter): PresenterGate {
    const unavailableReason = 'pixi-public-render-substitution-unavailable';
    const unsupported: PixiCanvasTextSourceSupport = freezeResult({
        supported: false,
        reason: unavailableReason,
    });
    let enabled = false;
    const presenter: PixiCanvasTextPresenter = adapterFreeze({
        describeSource(source: unknown): PixiCanvasTextSourceSupport {
            return enabled ? delegate.describeSource(source) : unsupported;
        },
        prepare(source: unknown, target: unknown): PixiCanvasTextPresentationPreparation {
            return enabled
                ? delegate.prepare(source, target)
                : freezeResult({ status: 'rejected', reason: unavailableReason });
        },
        paint(handle: unknown, methodName: unknown, argumentsList?: readonly unknown[]): PixiCanvasTextPaintResult {
            return enabled
                ? delegate.paint(handle, methodName, argumentsList)
                : freezeResult({ status: 'rejected', reason: unavailableReason });
        },
        release(handle: unknown): boolean {
            return delegate.release(handle);
        },
        isTranslatorOwned(value: unknown): boolean {
            return delegate.isTranslatorOwned(value);
        },
    });
    return adapterFreeze({
        presenter,
        enable(): void {
            enabled = true;
        },
        disable(): void {
            enabled = false;
        },
    });
}
function contractIsAvailable(adapterContract: unknown): boolean {
    if (!isPropertySource(adapterContract))
        return false;
    try {
        const hasRequiredMethods = readProperty(adapterContract, 'hasRequiredMethods');
        return (typeof hasRequiredMethods === 'function' &&
            adapterReflectApply(hasRequiredMethods as RuntimeFunction, adapterContract, [REQUIRED_CONTRACT_METHODS]) ===
                true);
    }
    catch {
        return false;
    }
}
export function createPixiTextModule(dependencies: PixiTextModuleDependencies, { scope: runtimeScope }: PixiTextModuleEnvironment): PixiTextModule {
    const capabilitiesModule = dependencies.capabilities;
    const canvasPresenterModule = dependencies.canvasPresenter;
    const frameObserverModule = dependencies.frameObserver;
    const hostHooksModule = dependencies.hostHooks;
    const hookWrapper = dependencies.hookWrapper;
    const presentationAuthorityModule = dependencies.presentationAuthority;
    const textCoreBridgeModule = dependencies.textCoreBridge;
    let retainedAdapter: PixiTextAdapter | null = null;
    let adapterSequence = 0;
    function create(context: PixiTextAdapterContext = {}): PixiTextAdapter {
        const adapterId = ++adapterSequence;
        let installing = false;
        let installed = false;
        let disposed = false;
        let resources: InstallationResources | null = null;
        let receipt: PixiTextAdapterInstallResult | null = null;
        function log(level: PropertyKey, message: string, detail?: unknown): void {
            const logger = context.logger;
            try {
                const callback = readProperty(logger, level);
                if (typeof callback !== 'function')
                    return;
                adapterReflectApply(callback as RuntimeFunction, logger, detail === undefined ? [message] : [message, detail]);
            }
            catch {
            }
        }
        function cleanup(reason: string): boolean {
            if (!resources)
                return true;
            resources.gate.disable();
            const hostReleased = resources.hostHooks.dispose();
            const bridgeReleased = resources.bridge.dispose(reason);
            if (hostReleased && bridgeReleased)
                resources = null;
            return hostReleased && bridgeReleased;
        }
        function createReceipt(status: PixiTextAdapterInstallResult['status'], reason: string, options: {
            readonly retryable?: boolean;
            readonly rollbackComplete?: boolean;
            readonly presentationAvailable?: boolean;
            readonly screenBoundary?: string;
        } = {}): PixiTextAdapterInstallResult {
            return adapterFreeze({
                status,
                reason,
                retryable: options.retryable === true,
                rollbackComplete: options.rollbackComplete !== false,
                presentationAvailable: options.presentationAvailable === true,
                screenBoundary: options.screenBoundary ?? '',
                dispose,
            });
        }
        function compose(): PixiTextAdapterInstallResult {
            const adapterContract = context.adapterContract;
            const createTextSource = context.createTextSource;
            if (!contractIsAvailable(adapterContract)) {
                return createReceipt('failed', 'pixi-textcore-contract-unavailable');
            }
            if (typeof createTextSource !== 'function') {
                return createReceipt('failed', 'pixi-text-source-codec-unavailable');
            }
            const capabilities = capabilitiesModule.inspect(runtimeScope);
            if (!capabilities.available)
                return createReceipt('skipped', capabilities.reason);
            const canvasHost = inspectPublicCanvasHost(runtimeScope);
            let canvasPresenter: PixiCanvasTextPresenter;
            let canvasPresenterAvailable = false;
            if (typeof canvasHost.textConstructor === 'function' &&
                typeof canvasHost.containerConstructor === 'function') {
                try {
                    canvasPresenter = canvasPresenterModule.create({
                        textConstructor: canvasHost.textConstructor,
                        containerConstructor: canvasHost.containerConstructor,
                    });
                    canvasPresenterAvailable = true;
                }
                catch (error) {
                    log('warn', '[PIXI Text] Public canvas presenter unavailable; observation remains enabled.', error);
                    canvasPresenter = createUnavailablePresenter('pixi-canvas-construction-capability-unavailable');
                }
            }
            else {
                canvasPresenter = createUnavailablePresenter('pixi-canvas-constructors-unavailable');
            }
            const gate = createPresenterGate(canvasPresenter);
            const frameObserver = frameObserverModule.create({
                capabilities,
                identityPrefix: ['pixi', adapterId].join(':'),
                isTranslatorOwned(value: unknown): boolean {
                    return gate.presenter.isTranslatorOwned(value);
                },
            });
            let bridgeReference: PixiTextCoreBridge | null = null;
            const presentationAuthority = presentationAuthorityModule.create({
                capabilities,
                canvasPresenter: gate.presenter,
                onPainted(event): void {
                    bridgeReference?.handlePresentationPainted(event);
                },
                onRejected(event): void {
                    bridgeReference?.handlePresentationRejected(event);
                },
                onError(error): void {
                    log('warn', '[PIXI Text] Owned presentation callback failed.', error);
                },
            });
            const bridge = textCoreBridgeModule.create({
                adapterContract,
                canvasPresenter: gate.presenter,
                createTextSource,
                frameObserver,
                presentationAuthority,
                logger: context.logger,
            });
            bridgeReference = bridge;
            function admitActivatedHost(hookResult: PixiTextHostHookActiveResult): PixiTextAdapterInstallResult {
                const presentationAvailable = hookResult.presentationAvailable && canvasPresenterAvailable;
                if (presentationAvailable) {
                    const subscriptionRelease = bridge.installSubscription();
                    if (!subscriptionRelease) {
                        const rollbackComplete = cleanup('pixi-textcore-subscription-unavailable');
                        installed = false;
                        receipt = createReceipt('failed', 'pixi-textcore-subscription-unavailable', {
                            retryable: !rollbackComplete,
                            rollbackComplete,
                        });
                        return receipt;
                    }
                    gate.enable();
                }
                installed = true;
                receipt = createReceipt('installed', presentationAvailable
                    ? hookResult.reason
                    : 'pixi-text-observation-installed-presentation-unavailable', {
                    presentationAvailable,
                    screenBoundary: hookResult.screenBoundary,
                });
                return receipt;
            }
            const hostHooks = hostHooksModule.create({
                scope: runtimeScope,
                hookWrapper,
                textPrototype: canvasPresenterAvailable ? canvasHost.textPrototype : null,
                canvasPresenter: gate.presenter,
                presentationAuthority,
                onScreenFrame(root, frameId): void {
                    bridge.scan(root, frameId);
                },
                onActivated(hookResult): void {
                    if (disposed || !installed)
                        return;
                    if (admitActivatedHost(hookResult).status === 'installed')
                        return;
                    log('error', '[PIXI Text] Deferred TextCore presentation admission failed.');
                },
                onError(error): void {
                    log('warn', '[PIXI Text] Public render observation failed.', error);
                },
            });
            resources = { bridge, gate, hostHooks };
            const hookResult = hostHooks.install();
            if (hookResult.status !== 'installed') {
                const rollbackComplete = cleanup('pixi-host-boundary-unavailable');
                return createReceipt('skipped', hookResult.reason, { rollbackComplete });
            }
            if (hookResult.activation === 'waiting') {
                installed = true;
                return createReceipt('installed', hookResult.reason);
            }
            return admitActivatedHost(hookResult);
        }
        function install(): PixiTextAdapterInstallResult {
            if (installed && receipt)
                return receipt;
            if (disposed)
                return createReceipt('failed', 'pixi-adapter-already-disposed');
            if (installing)
                return createReceipt('failed', 'pixi-adapter-installation-reentrant', { retryable: true });
            installing = true;
            try {
                receipt = compose();
                return receipt;
            }
            catch (error) {
                log('error', '[PIXI Text] Adapter installation failed.', error);
                const rollbackComplete = cleanup('pixi-adapter-installation-failed');
                receipt = createReceipt('failed', 'pixi-adapter-installation-failed', {
                    retryable: !rollbackComplete,
                    rollbackComplete,
                });
                return receipt;
            }
            finally {
                installing = false;
            }
        }
        function dispose(): boolean {
            if (disposed)
                return true;
            const released = cleanup('pixi-adapter-disposed');
            if (released) {
                installed = false;
                disposed = true;
            }
            return released;
        }
        return adapterFreeze({ install, dispose });
    }
    function install(context: PixiTextAdapterContext = {}): PixiTextAdapterInstallResult {
        const candidate = retainedAdapter ?? create(context);
        const result = candidate.install();
        if (result.status === 'installed' || !result.rollbackComplete)
            retainedAdapter = candidate;
        return result;
    }
    return adapterFreeze({ install, create });
}
