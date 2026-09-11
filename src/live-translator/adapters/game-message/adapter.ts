import { createInterpreterExecutionContextOwner } from '../../runtime/game-message/execution-context-owner.js';
import type { GameMessageClearModule } from './clear.js';
import type { GameMessageDetectionModule } from './detection.js';
import { createForesightInternalComposition } from './foresight/facade.js';
import { createGameMessageForesightContextModule } from './foresight-context.js';
import { createGameMessageForesightHooksModule } from './foresight-hooks.js';
import type { GameMessageForesightIngressModule } from './foresight-ingress.js';
import type { GameMessageHookMethodRequest } from './hook-lease.js';
import { resolveGameMessageForWindow, type GameMessageInstallModule } from './install.js';
import { createNativeConversionReceiptService } from './native-conversion-receipts.js';
import type { GameMessageRecordsModule } from './records.js';
import type { GameMessageSessionTransitionModule } from './session-transition.js';
import type { GameMessageSessionModule } from './session.js';
import { resolveGameMessageForesightEnabled, resolveGameMessageOriginAwareLineBreaks, type GameMessageTextModule, } from './text.js';
import { createMessageWindowContextAuthority } from './window-context.js';
type PropertySource = Record<PropertyKey, unknown>;
type RuntimeCallback = (this: unknown, ...argumentsList: unknown[]) => unknown;
const REQUIRED_FORESIGHT_ITEM_METHODS = Object.freeze(['observeRecord', 'requestItemTranslation', 'retireItem']);
const gameMessageString: (value?: unknown) => string = String;
interface GameMessageDependencies {
    readonly install: GameMessageInstallModule;
    readonly text: GameMessageTextModule;
    readonly session: GameMessageSessionModule;
    readonly sessionTransition: GameMessageSessionTransitionModule;
    readonly detection: GameMessageDetectionModule;
    readonly foresightIngress: GameMessageForesightIngressModule;
    readonly clear: GameMessageClearModule;
    readonly records: GameMessageRecordsModule;
}
interface GameMessageRuntimeContext {
    readonly scope: unknown;
}
interface GameMessageAdapterContext {
    readonly logger?: unknown;
    readonly traceLog?: unknown;
    readonly preview?: unknown;
    readonly stripControls?: unknown;
    readonly createTextSource?: unknown;
    readonly telemetry?: unknown;
    readonly drawCaptureTrace?: unknown;
    readonly adapterContract?: unknown;
    readonly settings?: unknown;
    readonly registeredWindows?: unknown;
    readonly ensureWindowRegistered?: unknown;
    readonly pruneDetachedRegisteredWindows?: unknown;
}
interface GameMessageInstallResult extends PropertySource {
    readonly dispose?: () => boolean;
}
export interface GameMessageAdapter {
    readonly install: () => GameMessageInstallResult;
}
export interface GameMessageModule {
    install(context?: GameMessageAdapterContext): GameMessageInstallResult;
    create(context?: GameMessageAdapterContext): GameMessageAdapter;
}
type CompositionState = 'uninitialized' | 'constructing' | 'ready' | 'failed';
function propertySource(value: unknown): PropertySource | null {
    return (typeof value === 'object' && value !== null) || typeof value === 'function'
        ? (value as PropertySource)
        : null;
}
function truthyOr<Value, Default>(value: Value, createDefault: () => Default): Value | Default {
    return value ? value : createDefault();
}
function requiredFunction(value: unknown, label: string): RuntimeCallback {
    if (typeof value === 'function')
        return value as RuntimeCallback;
    throw new TypeError(`[GameMessage] ${label} is required.`);
}
function stringifyUnknown(value: unknown): string {
    return Reflect.apply(gameMessageString, undefined, [value ?? '']);
}
function hasForesightItemCapabilities(adapterContract: unknown): boolean {
    const contract = propertySource(adapterContract);
    try {
        const hasRequiredMethods = contract?.['hasRequiredMethods'];
        if (typeof hasRequiredMethods !== 'function')
            return false;
        return (Reflect.apply(hasRequiredMethods as RuntimeCallback, contract, [REQUIRED_FORESIGHT_ITEM_METHODS]) === true);
    }
    catch {
        return false;
    }
}
export function createGameMessageModule(dependencies: GameMessageDependencies, { scope: runtimeScope }: GameMessageRuntimeContext): GameMessageModule {
    const runtimeGlobal = propertySource(runtimeScope) ?? {};
    const foresightComposition = createForesightInternalComposition(runtimeGlobal);
    const foresightContextModule = createGameMessageForesightContextModule();
    const foresightHooksModule = createGameMessageForesightHooksModule({
        foresightAdapter: foresightComposition.facade,
        provenance: foresightComposition.provenance,
    }, runtimeGlobal);
    let installationAdapter: GameMessageAdapter | null = null;
    function createAdapter(context: GameMessageAdapterContext = {}): GameMessageAdapter {
        let state: CompositionState = 'uninitialized';
        let failure: unknown = null;
        let installController: ReturnType<GameMessageInstallModule['create']> | null = null;
        function compose(): void {
            const logger = propertySource(truthyOr(context.logger, () => console));
            const traceLog = typeof context.traceLog === 'function' ? context.traceLog : () => undefined;
            const preview = typeof context.preview === 'function' ? context.preview : stringifyUnknown;
            const stripControls = typeof context.stripControls === 'function' ? context.stripControls : stringifyUnknown;
            const createTextSource = requiredFunction(context.createTextSource, 'createTextSource helper');
            const settings = propertySource(context.settings) ?? {};
            const registeredWindows = truthyOr(context.registeredWindows, () => null);
            const ensureWindowRegistered = typeof context.ensureWindowRegistered === 'function' ? context.ensureWindowRegistered : null;
            const pruneDetachedRegisteredWindows = typeof context.pruneDetachedRegisteredWindows === 'function'
                ? context.pruneDetachedRegisteredWindows
                : null;
            const originAwareLineBreaks = resolveGameMessageOriginAwareLineBreaks(settings);
            const foresightRequested = resolveGameMessageForesightEnabled(settings);
            const messageWindowContextAuthority = createMessageWindowContextAuthority();
            const nativeConversionReceipts = createNativeConversionReceiptService();
            const warn: RuntimeCallback = (message: unknown, error?: unknown): void => {
                try {
                    const callback = logger?.['warn'];
                    if (typeof callback !== 'function')
                        return;
                    Reflect.apply(callback as RuntimeCallback, logger, error === undefined ? [message] : [message, error]);
                }
                catch {
                }
            };
            let adapterContract: unknown = null;
            try {
                adapterContract = truthyOr(context.adapterContract, () => null);
            }
            catch (error) {
                warn('[GameMessage] Foresight contract lookup failed; live message context remains enabled.', error);
            }
            const readOwnMessageOrigin = (windowInstance: unknown): unknown => {
                try {
                    const gameMessage = resolveGameMessageForWindow(windowInstance);
                    const descriptor = gameMessage
                        ? Object.getOwnPropertyDescriptor(gameMessage, '_trMessageOrigin')
                        : undefined;
                    const token: unknown = descriptor && 'value' in descriptor ? descriptor.value : null;
                    return foresightComposition.provenance.verifyMessageOrigin(token, gameMessage) ? token : null;
                }
                catch {
                    return null;
                }
            };
            const foresightAvailable = foresightRequested && hasForesightItemCapabilities(adapterContract);
            if (foresightRequested && !foresightAvailable) {
                warn('[GameMessage] Foresight item capabilities unavailable; live message context remains enabled.');
            }
            const foresightContext = foresightContextModule.create({
                foresightProvenance: foresightComposition.provenance,
            });
            const text = dependencies.text.create({
                RAW_BREAK_PATTERN: /\f|\r\n|\r|\n/g,
                createTextSource,
                nativeConversionReceipts,
                getGameMessageForWindow: resolveGameMessageForWindow,
                getVerifiedMessageOrigin: readOwnMessageOrigin,
                readMessageOriginText: foresightContext.readMessageOriginText,
                warn,
                originAwareLineBreaks,
            });
            let prepareForesightHooks: () => readonly GameMessageHookMethodRequest[] = () => Object.freeze([]);
            let scheduleForesightTranslations: RuntimeCallback = () => 0;
            if (foresightAvailable) {
                const interpreterExecutionContextOwner = createInterpreterExecutionContextOwner();
                const records = dependencies.records.create({
                    MESSAGE_ADAPTER_ID: 'message',
                    adapterContract,
                    messageWindowContextAuthority,
                });
                const ingress = dependencies.foresightIngress.create({
                    globalScope: runtimeGlobal,
                    adapterContract,
                    foresightEnabled: true,
                    createEscapeAwarePayload: text.createEscapeAwarePayload,
                    createForesightObservation: records.createForesightObservation,
                    createMessageRecord: records.createMessageRecord,
                    observeMessageRecord: records.observeMessageRecord,
                });
                const hooks = foresightHooksModule.create({
                    FORESIGHT_BUDGET: 30,
                    FORESIGHT_MAX_SCAN_COMMANDS: 150,
                    interpreterExecutionContextOwner,
                    settings,
                    getGameMessageForWindow: resolveGameMessageForWindow,
                    readMessageTextData: foresightContext.readMessageTextData,
                    getInterpreterOriginId: foresightContext.getInterpreterOriginId,
                    getGlobalGameMessage: ingress.getGlobalGameMessage,
                    warn,
                });
                const detection = dependencies.detection.create({
                    FORESIGHT_BASE_PRIORITY: 400,
                    foresightEnabled: true,
                    foresightScanner: hooks.createForesightScanner(),
                    createForesightPayload: ingress.createForesightPayload,
                    requestForesightTranslation: ingress.requestForesightTranslation,
                    getForesightSourceKey: ingress.getForesightSourceKey,
                });
                prepareForesightHooks = hooks.prepareGameMessageForesightHookRequests;
                scheduleForesightTranslations = detection.scheduleForesightTranslations;
            }
            const transition = dependencies.sessionTransition.create({
                messageWindowContextAuthority,
                ensureWindowRegistered,
                registeredWindows,
                telemetry: context.telemetry,
                traceLog,
                preview,
                getGameMessageForWindow: resolveGameMessageForWindow,
                createEscapeAwarePayload: text.createEscapeAwarePayload,
                scheduleForesightTranslations,
                getVerifiedMessageOrigin: readOwnMessageOrigin,
            });
            const session = dependencies.session.create({
                globalScope: runtimeGlobal,
                traceLog,
                preview,
                stripControls,
                registeredWindows,
                pruneDetachedRegisteredWindows,
                messageWindowContextAuthority,
                nativeConversionReceipts,
                getGameMessageForWindow: resolveGameMessageForWindow,
                createEscapeAwarePayload: text.createEscapeAwarePayload,
                getResolvedTextForWindow: text.getResolvedTextForWindow,
                beginMessageSession: transition.beginMessageSession,
                observeMessage: transition.observeMessage,
                warn,
            });
            const clear = dependencies.clear.create({
                traceLog,
                telemetry: context.telemetry,
                clearMessageOrigin: foresightContext.clearMessageOrigin,
                collectWindowsForGameMessage: session.collectWindowsForGameMessage,
                resetWindowMessageState: transition.resetWindowMessageState,
                warn,
            });
            installController = dependencies.install.create({
                globalScope: runtimeGlobal,
                traceLog,
                nativeConversionReceipts,
                foresightEnabled: foresightAvailable,
                prepareGameMessageForesightHookRequests: prepareForesightHooks,
                prepareGameMessageClearHookRequest: clear.prepareGameMessageClearHookRequest,
                prepareGameMessageSessionInstallPlan: session.prepareGameMessageSessionInstallPlan,
            });
        }
        function ensureReady(): void {
            if (state === 'ready')
                return;
            if (state === 'failed')
                throw failure;
            if (state === 'constructing')
                throw new Error('[GameMessage] Reentrant adapter composition.');
            state = 'constructing';
            try {
                compose();
                state = 'ready';
            }
            catch (error) {
                failure = error;
                state = 'failed';
                throw error;
            }
        }
        return Object.freeze({
            install(): GameMessageInstallResult {
                ensureReady();
                if (!installController)
                    throw new Error('[GameMessage] Install controller was not composed.');
                return installController.install();
            },
        });
    }
    function install(context: GameMessageAdapterContext = {}): GameMessageInstallResult {
        installationAdapter ??= createAdapter(context);
        return installationAdapter.install();
    }
    return Object.freeze({ install, create: createAdapter });
}
