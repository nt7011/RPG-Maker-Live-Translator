import { commitDescriptorTransaction, compensateDescriptorTransaction, createDescriptorUpdateFromExpected, descriptorTransactionMatches, getOwnDescriptor, type DescriptorTransactionUpdate, } from '../../runtime/descriptor-transaction.js';
import { readOwnData } from './own-data.js';
import { prepareGameMessageHookLease, type GameMessageHookLease, type GameMessageHookMethodRequest, } from './hook-lease.js';
import type { NativeConversionReceiptGeneration, NativeConversionReceiptService, } from './native-conversion-receipts.js';
type PropertyBag = Record<PropertyKey, unknown>;
type RuntimeFunction = (this: unknown, ...arguments_: unknown[]) => unknown;
type FalsyValue = false | 0 | 0n | '' | null | undefined;
interface GameMessageInstallScope extends PropertyBag {
    readonly prepareGameMessageForesightHookRequests: () => readonly GameMessageHookMethodRequest[];
    readonly prepareGameMessageClearHookRequest: () => GameMessageHookMethodRequest | null;
    readonly prepareGameMessageSessionInstallPlan: (receiptGenerationToken?: unknown) => PreparedGameMessageHookPlan;
    readonly foresightEnabled?: unknown;
    readonly globalScope: GlobalScopeCandidate;
    readonly nativeConversionReceipts?: NativeConversionReceiptService | FalsyValue;
    readonly traceLog: RuntimeFunction;
}
interface GlobalScopeCandidate extends PropertyBag {
    LiveTranslatorGameMessageAdapter?: unknown;
}
interface ConstructorCandidate extends PropertyBag {
    readonly prototype?: unknown;
}
interface MessageWindowCandidate extends PropertyBag {
    readonly _gameMessage?: unknown;
}
export interface GameMessageInstallController {
    install(): PropertyBag;
}
export interface GameMessageInstallModule {
    create(scope?: unknown): GameMessageInstallController;
}
declare const $gameMessage: unknown;
declare const Window_Message: unknown;
const ADAPTER_MARKER_KEY = 'LiveTranslatorGameMessageAdapter';
const ADAPTER_MARKER_TOKEN = 'liveTranslator.gameMessageAdapter';
export function resolveGameMessageForWindow(windowInstance: unknown): unknown {
    const windowSource = windowInstance as MessageWindowCandidate;
    try {
        if (windowInstance) {
            const localGameMessage = windowSource._gameMessage;
            if (localGameMessage && typeof localGameMessage === 'object')
                return localGameMessage;
        }
    }
    catch {
    }
    try {
        const ambientGameMessage = $gameMessage;
        if (ambientGameMessage && typeof ambientGameMessage === 'object')
            return ambientGameMessage;
    }
    catch {
    }
    return null;
}
type GameMessageInstallPhase = 'idle' | 'installing' | 'installed' | 'recovering';
interface GameMessageInstallRecovery {
    readonly liveHookLease: GameMessageHookLease;
    foresightHookLease: GameMessageHookLease | null;
    nativeConversionGeneration: NativeConversionReceiptGeneration | null;
    readonly publicationUpdates: readonly DescriptorTransactionUpdate[];
    publicationAttempted: boolean;
    cleanupIntent: 'rollback' | 'dispose';
}
interface PreparedGameMessageHookPlan {
    readonly requests: readonly GameMessageHookMethodRequest[];
}
export function createGameMessageInstallModule(): GameMessageInstallModule {
    function createController(scope: unknown = {}): GameMessageInstallController {
        const source = scope as GameMessageInstallScope;
        const { globalScope, traceLog, nativeConversionReceipts, prepareGameMessageForesightHookRequests, prepareGameMessageClearHookRequest, prepareGameMessageSessionInstallPlan, } = source;
        let installPhase: GameMessageInstallPhase = 'idle';
        let installedResult: Readonly<PropertyBag> | null = null;
        let installRecovery: GameMessageInstallRecovery | null = null;
        if (!nativeConversionReceipts || typeof nativeConversionReceipts.prepareGeneration !== 'function') {
            throw new TypeError('[GameMessage] Installation requires the native conversion receipt authority.');
        }
        const conversionReceipts = nativeConversionReceipts;
        function prepareInstalledResult(recovery: GameMessageInstallRecovery): Readonly<PropertyBag> {
            return Object.freeze({
                status: 'installed',
                reason: 'Window_Message adapter hooks installed.',
                dispose: () => disposeInstalledGeneration(recovery),
            });
        }
        function install(): PropertyBag {
            if (installPhase === 'installed' && installedResult)
                return installedResult;
            if (installPhase === 'installing') {
                return {
                    status: 'skipped',
                    reason: 'Game-message installation is already in progress.',
                    retryable: true,
                };
            }
            if (installRecovery) {
                const cleanupIntent = installRecovery.cleanupIntent;
                if (!settleInstallRecovery(installRecovery, cleanupIntent)) {
                    installPhase = 'recovering';
                    return {
                        status: 'failed',
                        reason: 'A previous game-message installation still owns unsettled cleanup.',
                        retryable: true,
                    };
                }
                if (cleanupIntent === 'dispose')
                    installedResult = null;
            }
            installRecovery = null;
            installPhase = 'idle';
            if (typeof Window_Message === 'undefined' ||
                !Window_Message ||
                !(Window_Message as ConstructorCandidate).prototype) {
                traceInstallDiagnostic('[GameMessage] Window_Message unavailable; skipping message hooks.');
                return { status: 'skipped', reason: 'Window_Message is unavailable.', retryable: true };
            }
            installPhase = 'installing';
            let recovery: GameMessageInstallRecovery | null = null;
            let preparingLiveHookLease: GameMessageHookLease | null = null;
            let preparingForesightHookLease: GameMessageHookLease | null = null;
            let preparingNativeConversionGeneration: NativeConversionReceiptGeneration | null = null;
            try {
                const nativeConversionGeneration = conversionReceipts.prepareGeneration();
                preparingNativeConversionGeneration = nativeConversionGeneration;
                const livePlan = prepareLiveHookPlan(nativeConversionGeneration.token);
                const livePreparation = prepareGameMessageHookLease(livePlan.requests);
                if (livePreparation.status !== 'prepared' || !livePreparation.lease) {
                    nativeConversionGeneration.dispose();
                    preparingNativeConversionGeneration = null;
                    installPhase = 'idle';
                    return {
                        status: 'failed',
                        reason: `Game-message live hook preparation failed: ${livePreparation.reason}`,
                        retryable: livePreparation.retryable,
                    };
                }
                preparingLiveHookLease = livePreparation.lease;
                if (source.foresightEnabled) {
                    try {
                        const foresightPreparation = prepareGameMessageHookLease(prepareGameMessageForesightHookRequests());
                        if (foresightPreparation.status === 'prepared' && foresightPreparation.lease) {
                            preparingForesightHookLease = foresightPreparation.lease;
                        }
                        else {
                            traceInstallDiagnostic(`[GameMessage] Foresight hook preparation failed; live hooks remain enabled: ${foresightPreparation.reason}`);
                        }
                    }
                    catch (error) {
                        traceInstallDiagnostic(`[GameMessage] Foresight hook preparation failed; live hooks remain enabled: ${installFailureReason(error)}`);
                    }
                }
                const converterWrappers = preparingLiveHookLease.wrappers.filter((ownership) => ownership.key === 'convertEscapeCharacters');
                let ownedNativeConversionGeneration: NativeConversionReceiptGeneration | null = null;
                if (converterWrappers.length > 0) {
                    const converterBinding = nativeConversionGeneration.bindHookWrappers(converterWrappers);
                    if (converterBinding.status === 'bound') {
                        ownedNativeConversionGeneration = nativeConversionGeneration;
                    }
                    else {
                        const disposal = nativeConversionGeneration.dispose();
                        if (!disposal.settled) {
                            throw new Error(`Game-message native conversion cleanup failed: ${converterBinding.reason}`);
                        }
                        preparingNativeConversionGeneration = null;
                        traceInstallDiagnostic(`[GameMessage] Native conversion observation unavailable; authored text remains authoritative: ${converterBinding.reason}`);
                    }
                }
                else {
                    const disposal = nativeConversionGeneration.dispose();
                    if (!disposal.settled) {
                        throw new Error('Game-message unused native conversion generation could not be disposed.');
                    }
                    preparingNativeConversionGeneration = null;
                    traceInstallDiagnostic('[GameMessage] Native converter unavailable; authored text remains authoritative.');
                }
                const marker = Object.freeze({
                    __token: ADAPTER_MARKER_TOKEN,
                    generation: Object.freeze({}),
                });
                const publicationUpdates = preparePublicationUpdates(marker);
                recovery = {
                    liveHookLease: preparingLiveHookLease,
                    foresightHookLease: preparingForesightHookLease,
                    nativeConversionGeneration: ownedNativeConversionGeneration,
                    publicationUpdates,
                    publicationAttempted: false,
                    cleanupIntent: 'rollback',
                };
                preparingLiveHookLease = null;
                preparingForesightHookLease = null;
                preparingNativeConversionGeneration = null;
                installRecovery = recovery;
                const livePublication = recovery.liveHookLease.publish();
                if (livePublication.status !== 'published') {
                    const recovered = settleInstallRecovery(recovery, 'rollback');
                    installPhase = recovered ? 'idle' : 'recovering';
                    if (recovered)
                        installRecovery = null;
                    return {
                        status: 'failed',
                        reason: `Game-message live hook publication failed: ${livePublication.reason}`,
                        retryable: livePublication.retryable || !recovered,
                    };
                }
                if (recovery.foresightHookLease) {
                    const foresightPublication = recovery.foresightHookLease.publish();
                    if (foresightPublication.status !== 'published') {
                        const rollback = recovery.foresightHookLease.rollback();
                        if (!rollback.settled) {
                            const recovered = settleInstallRecovery(recovery, 'rollback');
                            installPhase = recovered ? 'idle' : 'recovering';
                            if (recovered)
                                installRecovery = null;
                            return {
                                status: 'failed',
                                reason: `Game-message foresight hook cleanup failed: ${foresightPublication.reason}`,
                                retryable: true,
                            };
                        }
                        recovery.foresightHookLease = null;
                        traceInstallDiagnostic(`[GameMessage] Foresight hook publication failed; live hooks remain enabled: ${foresightPublication.reason}`);
                    }
                }
                recovery.publicationAttempted = true;
                const markerCommit = commitDescriptorTransaction(publicationUpdates);
                if (!markerCommit.committed || !descriptorTransactionMatches(publicationUpdates, 'prepared')) {
                    const recovered = settleInstallRecovery(recovery, 'rollback');
                    installPhase = recovered ? 'idle' : 'recovering';
                    if (recovered)
                        installRecovery = null;
                    return {
                        status: 'failed',
                        reason: 'Game-message adapter marker publication failed.',
                        retryable: !recovered || markerCommit.rollbackComplete,
                    };
                }
                if (recovery.nativeConversionGeneration) {
                    const nativeConversionActivation = recovery.nativeConversionGeneration.activate();
                    if (nativeConversionActivation.status !== 'activated') {
                        const disposal = recovery.nativeConversionGeneration.dispose();
                        if (!disposal.settled) {
                            const recovered = settleInstallRecovery(recovery, 'rollback');
                            installPhase = recovered ? 'idle' : 'recovering';
                            if (recovered)
                                installRecovery = null;
                            return {
                                status: 'failed',
                                reason: `Game-message native conversion cleanup failed: ${nativeConversionActivation.reason}`,
                                retryable: true,
                            };
                        }
                        recovery.nativeConversionGeneration = null;
                        traceInstallDiagnostic(`[GameMessage] Native conversion activation failed; authored text remains authoritative: ${nativeConversionActivation.reason}`);
                    }
                }
                const liveActivation = recovery.liveHookLease.activate();
                if (liveActivation.status !== 'activated') {
                    const recovered = settleInstallRecovery(recovery, 'rollback');
                    installPhase = recovered ? 'idle' : 'recovering';
                    if (recovered)
                        installRecovery = null;
                    return {
                        status: 'failed',
                        reason: `Game-message live hook activation failed: ${liveActivation.reason}`,
                        retryable: liveActivation.retryable || !recovered,
                    };
                }
                if (recovery.foresightHookLease) {
                    const foresightActivation = recovery.foresightHookLease.activate();
                    if (foresightActivation.status !== 'activated') {
                        const rollback = recovery.foresightHookLease.rollback();
                        if (!rollback.settled) {
                            const recovered = settleInstallRecovery(recovery, 'rollback');
                            installPhase = recovered ? 'idle' : 'recovering';
                            if (recovered)
                                installRecovery = null;
                            return {
                                status: 'failed',
                                reason: `Game-message foresight hook cleanup failed: ${foresightActivation.reason}`,
                                retryable: true,
                            };
                        }
                        recovery.foresightHookLease = null;
                        traceInstallDiagnostic(`[GameMessage] Foresight hook activation failed; live hooks remain enabled: ${foresightActivation.reason}`);
                    }
                }
                installedResult = prepareInstalledResult(recovery);
                installPhase = 'installed';
                return installedResult;
            }
            catch (error) {
                let recovered: boolean;
                if (recovery) {
                    recovered = settleInstallRecovery(recovery, 'rollback');
                }
                else {
                    const foresightSettled = preparingForesightHookLease?.rollback().settled !== false;
                    const liveSettled = preparingLiveHookLease?.rollback().settled !== false;
                    const conversionSettled = preparingNativeConversionGeneration?.dispose().settled !== false;
                    recovered = foresightSettled && liveSettled && conversionSettled;
                }
                installPhase = recovered ? 'idle' : 'recovering';
                if (recovered)
                    installRecovery = null;
                return {
                    status: 'failed',
                    reason: installFailureReason(error),
                    retryable: !recovered || installFailureRetryable(error),
                };
            }
        }
        function appendHookRequests(destination: GameMessageHookMethodRequest[], sourceRequests: readonly GameMessageHookMethodRequest[]): void {
            for (const request of sourceRequests) {
                destination[destination.length] = request;
            }
        }
        function prepareLiveHookPlan(receiptGenerationToken: object): PreparedGameMessageHookPlan {
            const requests: GameMessageHookMethodRequest[] = [];
            const sessionPlan = prepareGameMessageSessionInstallPlan(receiptGenerationToken);
            appendHookRequests(requests, sessionPlan.requests);
            const clearRequest = prepareGameMessageClearHookRequest();
            if (clearRequest)
                requests[requests.length] = clearRequest;
            return Object.freeze({
                requests: Object.freeze(requests),
            });
        }
        function prepareMarkerUpdate(marker: object): DescriptorTransactionUpdate {
            const existing = getOwnDescriptor(globalScope, ADAPTER_MARKER_KEY);
            if (existing) {
                throw new Error('[GameMessage] Adapter marker is already owned by another generation.');
            }
            const update = createDescriptorUpdateFromExpected(globalScope, ADAPTER_MARKER_KEY, undefined, {
                configurable: true,
                enumerable: true,
                writable: true,
                value: marker,
            });
            if (!update)
                throw new Error('[GameMessage] Adapter marker descriptor could not be prepared.');
            return update;
        }
        function preparePublicationUpdates(marker: object): readonly DescriptorTransactionUpdate[] {
            return Object.freeze([prepareMarkerUpdate(marker)]);
        }
        function rollbackMarker(recovery: GameMessageInstallRecovery): boolean {
            if (!recovery.publicationAttempted)
                return true;
            if (descriptorTransactionMatches(recovery.publicationUpdates, 'expected')) {
                recovery.publicationAttempted = false;
                return true;
            }
            const rollback = compensateDescriptorTransaction(recovery.publicationUpdates);
            if (rollback.compensated && descriptorTransactionMatches(recovery.publicationUpdates, 'expected')) {
                recovery.publicationAttempted = false;
                return true;
            }
            return false;
        }
        function settleInstallRecovery(recovery: GameMessageInstallRecovery, operation: 'rollback' | 'dispose'): boolean {
            recovery.cleanupIntent = operation;
            recovery.nativeConversionGeneration?.deactivate();
            recovery.foresightHookLease?.deactivate();
            recovery.liveHookLease.deactivate();
            const markerSettled = rollbackMarker(recovery);
            const foresightSettled = !recovery.foresightHookLease ||
                (operation === 'dispose'
                    ? recovery.foresightHookLease.dispose()
                    : recovery.foresightHookLease.rollback()).settled;
            const liveOutcome = operation === 'dispose' ? recovery.liveHookLease.dispose() : recovery.liveHookLease.rollback();
            const nativeConversionSettled = !recovery.nativeConversionGeneration || recovery.nativeConversionGeneration.dispose().settled;
            return markerSettled && foresightSettled && liveOutcome.settled && nativeConversionSettled;
        }
        function disposeInstalledGeneration(expectedRecovery: GameMessageInstallRecovery): boolean {
            if (installRecovery !== expectedRecovery)
                return true;
            if (installPhase === 'idle')
                return true;
            if (installPhase === 'installing')
                return false;
            const recovery = expectedRecovery;
            installPhase = 'recovering';
            recovery.cleanupIntent = 'dispose';
            const settled = settleInstallRecovery(recovery, 'dispose');
            if (!settled)
                return false;
            installRecovery = null;
            installedResult = null;
            installPhase = 'idle';
            return true;
        }
        function installFailureReason(error: unknown): string {
            try {
                const message = error && (error as {
                    readonly message?: unknown;
                }).message;
                return typeof message === 'string' && message
                    ? `Game-message installation failed: ${message}`
                    : 'Game-message installation failed.';
            }
            catch {
                return 'Game-message installation failed.';
            }
        }
        function installFailureRetryable(error: unknown): boolean {
            try {
                return readOwnData(error, 'retryable').value === true;
            }
            catch {
                return false;
            }
        }
        function traceInstallDiagnostic(message: string): void {
            try {
                Reflect.apply(traceLog, undefined, [message]);
            }
            catch {
            }
        }
        return {
            install,
        };
    }
    return { create: createController };
}
