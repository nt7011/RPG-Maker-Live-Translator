import { createNativeConversionObservationService, type NativeConversionBypassOutcome, type NativeConversionObservationGeneration, type NativeConversionObservationOwner, type NativeConversionObservationSnapshot, } from '../../runtime/native-conversion-observation.js';
type RuntimeMethod = (this: unknown, ...arguments_: unknown[]) => unknown;
export interface NativeConversionReceipt {
    readonly callCount: number;
    readonly input: string;
    readonly matchedTextState: boolean;
    readonly output: string;
    readonly selectedCall: number;
    readonly source: 'converter-hook' | 'text-state';
}
export type { NativeConversionBypassOutcome, NativeConversionObservationOwner };
export type NativeConversionReceiptGeneration = NativeConversionObservationGeneration;
export interface NativeConversionReceiptService {
    prepareGeneration(): NativeConversionReceiptGeneration;
    begin(token: unknown, windowInstance: unknown): NativeConversionObservationOwner | null;
    invoke(token: unknown, receiver: unknown, nativeMethod: RuntimeMethod, argumentsList: readonly unknown[]): unknown;
    settle(owner: unknown, nativeSucceeded: boolean, textStateText: unknown): NativeConversionReceipt | null;
    publishTextState(token: unknown, windowInstance: unknown, text: unknown): NativeConversionReceipt | null;
    inspect(windowInstance: unknown): NativeConversionReceipt | null;
    isCurrentReceipt(windowInstance: unknown, receipt: unknown): receipt is NativeConversionReceipt;
    runPreconverted<Value>(windowInstance: unknown, operation: () => Value): NativeConversionBypassOutcome<Value>;
}
export function createNativeConversionReceiptService(): NativeConversionReceiptService {
    const observation = createNativeConversionObservationService();
    function settle(owner: unknown, nativeSucceeded: boolean, textStateText: unknown): NativeConversionReceipt | null {
        if (typeof textStateText !== 'string') {
            return observation.settle<NativeConversionReceipt>(owner, false, () => null);
        }
        return observation.settle<NativeConversionReceipt>(owner, nativeSucceeded, (snapshot) => selectTextStateReceipt(snapshot, textStateText));
    }
    function publishTextState(token: unknown, windowInstance: unknown, text: unknown): NativeConversionReceipt | null {
        if (typeof text !== 'string')
            return null;
        return observation.publish(token, windowInstance, {
            callCount: 0,
            input: '',
            matchedTextState: false,
            output: text,
            selectedCall: 0,
            source: 'text-state',
        });
    }
    function inspect(windowInstance: unknown): NativeConversionReceipt | null {
        return (observation.inspect(windowInstance) as NativeConversionReceipt | null) ?? null;
    }
    function isCurrentReceipt(windowInstance: unknown, receipt: unknown): receipt is NativeConversionReceipt {
        return observation.isCurrentReceipt(windowInstance, receipt);
    }
    return Object.freeze({
        prepareGeneration: () => observation.prepareGeneration(),
        begin: (token: unknown, windowInstance: unknown) => observation.begin(token, windowInstance),
        invoke: (token: unknown, receiver: unknown, nativeMethod: RuntimeMethod, argumentsList: readonly unknown[]) => observation.invoke(token, receiver, nativeMethod, argumentsList),
        settle,
        publishTextState,
        inspect,
        isCurrentReceipt,
        runPreconverted: <Value>(windowInstance: unknown, operation: () => Value) => observation.runPreconverted(windowInstance, operation),
    });
}
function selectTextStateReceipt(snapshot: NativeConversionObservationSnapshot, textStateText: string): NativeConversionReceipt | null {
    for (let index = snapshot.candidates.length - 1; index >= 0; index -= 1) {
        const candidate = snapshot.candidates[index];
        if (candidate?.output !== textStateText)
            continue;
        return {
            callCount: snapshot.callCount,
            input: candidate.input,
            matchedTextState: true,
            output: textStateText,
            selectedCall: candidate.sequence,
            source: 'converter-hook',
        };
    }
    return null;
}
