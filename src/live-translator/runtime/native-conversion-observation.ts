type RuntimeMethod = (this: unknown, ...arguments_: unknown[]) => unknown;
export interface NativeConversionWrapperOwnership {
    readonly key: PropertyKey;
    readonly wrapper: RuntimeMethod;
}
export interface NativeConversionCandidate {
    readonly input: string;
    readonly output: string;
    readonly returnedOutput: string;
    readonly outputReplaced: boolean;
    readonly sequence: number;
}
export interface NativeConversionCandidateDecision {
    readonly status: 'replace';
    readonly output: string;
}
export interface NativeConversionObservationSnapshot {
    readonly callCount: number;
    readonly candidates: readonly NativeConversionCandidate[];
}
export interface NativeConversionObservationOwner {
    readonly token: object;
}
export type NativeConversionCandidateObserver = (candidate: NativeConversionCandidate) => NativeConversionCandidateDecision | null | undefined;
export interface NativeConversionGenerationOutcome {
    readonly reason: string;
    readonly settled: boolean;
    readonly status: 'activated' | 'bound' | 'deactivated' | 'disposed' | 'failed' | 'unchanged';
}
export interface NativeConversionBypassOutcome<Value = unknown> {
    readonly error: unknown;
    readonly reason: string;
    readonly status: 'completed' | 'failed' | 'unavailable';
    readonly value: Value | null;
}
export interface NativeConversionObservationGeneration {
    readonly token: object;
    bindHookWrappers(wrappers: readonly NativeConversionWrapperOwnership[]): NativeConversionGenerationOutcome;
    activate(): NativeConversionGenerationOutcome;
    deactivate(): NativeConversionGenerationOutcome;
    dispose(): NativeConversionGenerationOutcome;
}
export interface NativeConversionObservationService {
    prepareGeneration(): NativeConversionObservationGeneration;
    begin(token: unknown, receiver: unknown, observeCandidate?: NativeConversionCandidateObserver | null): NativeConversionObservationOwner | null;
    invoke(token: unknown, receiver: unknown, nativeMethod: RuntimeMethod, argumentsList: readonly unknown[]): unknown;
    settle<Receipt extends object>(owner: unknown, nativeSucceeded: boolean, selectReceipt: (snapshot: NativeConversionObservationSnapshot) => Receipt | null): Receipt | null;
    publish<Receipt extends object>(token: unknown, receiver: unknown, receipt: Receipt): Receipt | null;
    inspect(receiver: unknown): object | null;
    isCurrentReceipt(receiver: unknown, receipt: unknown): boolean;
    runPreconverted<Value>(receiver: unknown, operation: () => Value): NativeConversionBypassOutcome<Value>;
}
interface GenerationState {
    readonly token: object;
    readonly wrappers: RuntimeMethod[];
    state: 'prepared' | 'bound' | 'active' | 'inactive' | 'disposed';
}
interface ObservationState {
    readonly candidates: NativeConversionCandidate[];
    readonly generation: GenerationState;
    readonly owner: NativeConversionObservationOwner;
    readonly receiver: object;
    readonly observeCandidate: NativeConversionCandidateObserver | null;
    callCount: number;
    candidateObserverFailed: boolean;
    depth: number;
    settled: boolean;
}
interface ReceiverConversionState {
    readonly observations: ObservationState[];
    bypassDepth: number;
    bypassGeneration: GenerationState | null;
    receipt: object | null;
    receiptGeneration: GenerationState | null;
}
const CONVERTER_KEY = 'convertEscapeCharacters';
const MAX_PROTOTYPE_DEPTH = 256;
const OBSERVATION_STATE = Symbol('native-conversion-observation');
function isObjectReference(value: unknown): value is object {
    return (typeof value === 'object' && value !== null) || typeof value === 'function';
}
function generationOutcome(status: NativeConversionGenerationOutcome['status'], settled: boolean, reason: string): NativeConversionGenerationOutcome {
    return Object.freeze({ status, settled, reason });
}
function bypassOutcome<Value>(status: NativeConversionBypassOutcome<Value>['status'], reason: string, value: Value | null = null, error: unknown = null): NativeConversionBypassOutcome<Value> {
    return Object.freeze({ status, reason, value, error });
}
export function createNativeConversionObservationService(): NativeConversionObservationService {
    const statesByReceiver = new WeakMap<object, ReceiverConversionState>();
    let activeGeneration: GenerationState | null = null;
    function receiverState(receiver: object): ReceiverConversionState {
        let state = statesByReceiver.get(receiver);
        if (!state) {
            state = {
                observations: [],
                bypassDepth: 0,
                bypassGeneration: null,
                receipt: null,
                receiptGeneration: null,
            };
            statesByReceiver.set(receiver, state);
        }
        return state;
    }
    function prepareGeneration(): NativeConversionObservationGeneration {
        const generation: GenerationState = { token: Object.freeze({}), wrappers: [], state: 'prepared' };
        return Object.freeze({
            token: generation.token,
            bindHookWrappers(wrappers: readonly NativeConversionWrapperOwnership[]) {
                if (generation.state === 'disposed') {
                    return generationOutcome('failed', true, 'native-conversion-generation-disposed');
                }
                if (generation.state !== 'prepared' && generation.state !== 'bound') {
                    return generationOutcome('failed', false, 'native-conversion-generation-already-active');
                }
                for (const ownership of wrappers) {
                    if (ownership.key !== CONVERTER_KEY || typeof ownership.wrapper !== 'function') {
                        return generationOutcome('failed', false, 'invalid-native-conversion-wrapper');
                    }
                    if (!generation.wrappers.includes(ownership.wrapper))
                        generation.wrappers.push(ownership.wrapper);
                }
                if (generation.wrappers.length === 0) {
                    return generationOutcome('failed', false, 'native-conversion-wrapper-unavailable');
                }
                generation.state = 'bound';
                return generationOutcome('bound', true, 'native-conversion-wrappers-bound');
            },
            activate() {
                if (generation.state === 'active' && activeGeneration === generation) {
                    return generationOutcome('unchanged', true, 'native-conversion-generation-already-active');
                }
                if (generation.state !== 'bound' || (activeGeneration && activeGeneration !== generation)) {
                    return generationOutcome('failed', false, 'native-conversion-generation-not-activatable');
                }
                activeGeneration = generation;
                generation.state = 'active';
                return generationOutcome('activated', true, 'native-conversion-generation-activated');
            },
            deactivate() {
                if (generation.state === 'disposed' || generation.state === 'inactive') {
                    return generationOutcome('unchanged', true, 'native-conversion-generation-inactive');
                }
                if (generation.state !== 'active' || activeGeneration !== generation) {
                    return generationOutcome('failed', false, 'native-conversion-generation-not-current');
                }
                activeGeneration = null;
                generation.state = 'inactive';
                return generationOutcome('deactivated', true, 'native-conversion-generation-deactivated');
            },
            dispose() {
                if (generation.state === 'disposed') {
                    return generationOutcome('unchanged', true, 'native-conversion-generation-disposed');
                }
                if (activeGeneration === generation)
                    activeGeneration = null;
                generation.wrappers.length = 0;
                generation.state = 'disposed';
                return generationOutcome('disposed', true, 'native-conversion-generation-disposed');
            },
        });
    }
    function currentGeneration(token: unknown): GenerationState | null {
        return activeGeneration?.state === 'active' && activeGeneration.token === token ? activeGeneration : null;
    }
    function createObservationOwner(observation: ObservationState): NativeConversionObservationOwner {
        const owner = observation.owner as NativeConversionObservationOwner & {
            readonly [OBSERVATION_STATE]?: ObservationState;
        };
        Object.defineProperty(owner, OBSERVATION_STATE, { value: observation });
        return Object.freeze(owner);
    }
    function inspectObservationOwner(owner: unknown): ObservationState | null {
        if (!isObjectReference(owner))
            return null;
        const descriptor = Object.getOwnPropertyDescriptor(owner, OBSERVATION_STATE);
        const observation = descriptor && 'value' in descriptor ? (descriptor.value as ObservationState) : null;
        return observation?.owner === owner ? observation : null;
    }
    function begin(token: unknown, receiver: unknown, observeCandidate: NativeConversionCandidateObserver | null = null): NativeConversionObservationOwner | null {
        const generation = currentGeneration(token);
        if (!generation || !isObjectReference(receiver))
            return null;
        const owner: NativeConversionObservationOwner = { token: Object.freeze({}) };
        const observation: ObservationState = {
            candidates: [],
            generation,
            owner,
            receiver,
            observeCandidate: typeof observeCandidate === 'function' ? observeCandidate : null,
            callCount: 0,
            candidateObserverFailed: false,
            depth: 0,
            settled: false,
        };
        createObservationOwner(observation);
        const state = receiverState(receiver);
        state.observations.push(observation);
        state.receipt = null;
        state.receiptGeneration = null;
        return owner;
    }
    function invoke(token: unknown, receiver: unknown, nativeMethod: RuntimeMethod, argumentsList: readonly unknown[]): unknown {
        const generation = currentGeneration(token);
        if (!generation || !isObjectReference(receiver))
            return Reflect.apply(nativeMethod, receiver, argumentsList);
        const state = statesByReceiver.get(receiver);
        if (state?.bypassGeneration === generation && state.bypassDepth > 0) {
            return normalizeBypassInput(argumentsList[0]);
        }
        const observation = state?.observations[state.observations.length - 1] ?? null;
        if (observation?.generation !== generation || observation.settled) {
            return Reflect.apply(nativeMethod, receiver, argumentsList);
        }
        const rootCall = observation.depth === 0;
        observation.depth += 1;
        if (rootCall)
            observation.callCount += 1;
        let candidate: NativeConversionCandidate | null = null;
        let output: unknown;
        try {
            output = Reflect.apply(nativeMethod, receiver, argumentsList);
            if (rootCall && typeof output === 'string') {
                candidate = Object.freeze({
                    input: typeof argumentsList[0] === 'string' ? argumentsList[0] : '',
                    output,
                    returnedOutput: output,
                    outputReplaced: false,
                    sequence: observation.callCount,
                });
            }
        }
        finally {
            observation.depth -= 1;
        }
        const candidateIndex = candidate ? observation.candidates.length : -1;
        if (candidate)
            observation.candidates.push(candidate);
        if (candidate && observation.observeCandidate) {
            try {
                const decision: unknown = observation.observeCandidate(candidate);
                if (decision !== undefined && decision !== null) {
                    const replacement = decision as Record<PropertyKey, unknown>;
                    if (!isObjectReference(decision) ||
                        replacement['status'] !== 'replace' ||
                        typeof replacement['output'] !== 'string') {
                        observation.candidateObserverFailed = true;
                    }
                    else {
                        const replacementOutput = replacement['output'];
                        output = replacementOutput;
                        candidate = Object.freeze({
                            input: candidate.input,
                            output: candidate.output,
                            returnedOutput: replacementOutput,
                            outputReplaced: true,
                            sequence: candidate.sequence,
                        });
                        observation.candidates[candidateIndex] = candidate;
                    }
                }
            }
            catch {
                observation.candidateObserverFailed = true;
            }
        }
        return output;
    }
    function settle<Receipt extends object>(owner: unknown, nativeSucceeded: boolean, selectReceipt: (snapshot: NativeConversionObservationSnapshot) => Receipt | null): Receipt | null {
        const observation = inspectObservationOwner(owner);
        if (!observation || observation.settled)
            return null;
        const state = statesByReceiver.get(observation.receiver);
        if (!state) {
            observation.settled = true;
            return null;
        }
        let observationIndex = -1;
        for (let index = state.observations.length - 1; index >= 0; index -= 1) {
            if (state.observations[index] === observation) {
                observationIndex = index;
                break;
            }
        }
        observation.settled = true;
        if (observationIndex < 0)
            return null;
        const wasCurrent = observationIndex === state.observations.length - 1;
        state.observations.splice(observationIndex, 1);
        if (!wasCurrent) {
            clearReceipt(state);
            return null;
        }
        if (!nativeSucceeded ||
            observation.candidateObserverFailed ||
            observation.generation !== activeGeneration ||
            observation.generation.state !== 'active') {
            clearReceipt(state);
            return null;
        }
        try {
            const selected = selectReceipt(Object.freeze({
                callCount: observation.callCount,
                candidates: Object.freeze(observation.candidates.slice()),
            }));
            if (!selected || !isObjectReference(selected)) {
                clearReceipt(state);
                return null;
            }
            return publishReceipt(observation.generation, observation.receiver, selected);
        }
        catch {
            clearReceipt(state);
            return null;
        }
    }
    function clearReceipt(state: ReceiverConversionState): void {
        state.receipt = null;
        state.receiptGeneration = null;
    }
    function publish<Receipt extends object>(token: unknown, receiver: unknown, receipt: Receipt): Receipt | null {
        const generation = currentGeneration(token);
        if (!generation || !isObjectReference(receiver) || !isObjectReference(receipt))
            return null;
        return publishReceipt(generation, receiver, receipt);
    }
    function publishReceipt<Receipt extends object>(generation: GenerationState, receiver: object, value: Receipt): Receipt {
        const state = receiverState(receiver);
        const receipt = Object.freeze(value);
        state.receipt = receipt;
        state.receiptGeneration = generation;
        return receipt;
    }
    function inspect(receiver: unknown): object | null {
        if (!isObjectReference(receiver) || !activeGeneration)
            return null;
        const state = statesByReceiver.get(receiver);
        return state?.receiptGeneration === activeGeneration ? state.receipt : null;
    }
    function isCurrentReceipt(receiver: unknown, receipt: unknown): boolean {
        return isObjectReference(receipt) && inspect(receiver) === receipt;
    }
    function resolveConverter(receiver: object, generation: GenerationState): RuntimeMethod | null {
        const visited = new Set<object>();
        let cursor: object | null = receiver;
        while (cursor) {
            if (visited.size >= MAX_PROTOTYPE_DEPTH || visited.has(cursor))
                return null;
            visited.add(cursor);
            const descriptor = Object.getOwnPropertyDescriptor(cursor, CONVERTER_KEY);
            if (descriptor) {
                if (!('value' in descriptor) || typeof descriptor.value !== 'function')
                    return null;
                return generation.wrappers.includes(descriptor.value as RuntimeMethod)
                    ? (descriptor.value as RuntimeMethod)
                    : null;
            }
            cursor = Object.getPrototypeOf(cursor) as object | null;
        }
        return null;
    }
    function runPreconverted<Value>(receiver: unknown, operation: () => Value): NativeConversionBypassOutcome<Value> {
        const generation = activeGeneration;
        if (generation?.state !== 'active' || !isObjectReference(receiver)) {
            return bypassOutcome<Value>('unavailable', 'native-conversion-generation-unavailable');
        }
        try {
            if (!resolveConverter(receiver, generation)) {
                return bypassOutcome<Value>('unavailable', 'native-conversion-wrapper-not-current');
            }
        }
        catch (error) {
            return bypassOutcome<Value>('unavailable', 'native-conversion-wrapper-observation-failed', null, error);
        }
        const state = receiverState(receiver);
        if (state.bypassGeneration && state.bypassGeneration !== generation) {
            return bypassOutcome<Value>('unavailable', 'native-conversion-bypass-generation-conflict');
        }
        state.bypassGeneration = generation;
        state.bypassDepth += 1;
        try {
            return bypassOutcome<Value>('completed', 'native-conversion-bypass-completed', operation());
        }
        catch (error) {
            return bypassOutcome<Value>('failed', 'native-conversion-bypass-operation-failed', null, error);
        }
        finally {
            state.bypassDepth -= 1;
            if (state.bypassDepth === 0)
                state.bypassGeneration = null;
        }
    }
    return Object.freeze({
        prepareGeneration,
        begin,
        invoke,
        settle,
        publish,
        inspect,
        isCurrentReceipt,
        runPreconverted,
    });
}
function normalizeBypassInput(value: unknown): string {
    if (typeof value === 'string')
        return value;
    const converted: unknown = Reflect.apply(String, undefined, [value ?? '']);
    return typeof converted === 'string' ? converted : '';
}
