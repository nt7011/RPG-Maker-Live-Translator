const DEFAULT_ABORT_MESSAGE = 'Translation request canceled.';
interface CancellationMetadataCandidate {
    readonly code?: unknown;
    readonly name?: unknown;
}
interface CancellationReasonCandidate {
    readonly message?: unknown;
}
export interface AbortError extends Error {
    readonly cause: unknown;
    readonly code: 'ABORT_ERR';
    readonly name: 'AbortError';
}
interface CancellationClassificationBase {
    readonly code: string;
    readonly error: unknown;
    readonly message: string;
}
export type CancellationClassification = Readonly<CancellationClassificationBase & {
    readonly kind: 'cancellation';
}> | Readonly<CancellationClassificationBase & {
    readonly kind: 'other';
}>;
export interface CancellationModule {
    readonly createAbortError: (reason?: unknown) => AbortError;
    readonly classifyCancellation: (error: unknown) => CancellationClassification;
}
interface CancellationClassificationState {
    classification: CancellationClassification;
    inFlight: boolean;
    reentered: boolean;
}
function captureAbortMessage(reason: unknown): string {
    if (reason === undefined)
        return DEFAULT_ABORT_MESSAGE;
    if ((typeof reason === 'object' && reason !== null) || typeof reason === 'function') {
        return captureObjectMessage(reason);
    }
    try {
        return String(reason);
    }
    catch {
        return DEFAULT_ABORT_MESSAGE;
    }
}
function captureObjectMessage(value: object): string {
    let observedMessage: unknown;
    try {
        observedMessage = (value as CancellationReasonCandidate).message;
    }
    catch {
    }
    if (observedMessage !== undefined) {
        try {
            return String(observedMessage);
        }
        catch {
        }
    }
    try {
        return Object.prototype.toString.call(value);
    }
    catch {
        return '';
    }
}
function captureMetadataString(value: unknown): string {
    if (value === undefined)
        return '';
    try {
        return String(value);
    }
    catch {
        return '';
    }
}
function constructAbortError(reason: unknown, message: string): AbortError {
    const error = new Error(message);
    Object.defineProperties(error, {
        cause: {
            configurable: false,
            enumerable: false,
            value: reason,
            writable: false,
        },
        code: {
            configurable: false,
            enumerable: false,
            value: 'ABORT_ERR',
            writable: false,
        },
        name: {
            configurable: false,
            enumerable: false,
            value: 'AbortError',
            writable: false,
        },
    });
    return Object.freeze(error) as AbortError;
}
export function createCancellationModule(): Readonly<CancellationModule> {
    const classifications = new WeakMap<object, CancellationClassificationState>();
    function createAbortError(reason?: unknown): AbortError {
        if ((typeof reason === 'object' && reason !== null) || typeof reason === 'function') {
            const classification = classifyCancellation(reason);
            return constructAbortError(reason, classification.message);
        }
        return constructAbortError(reason, captureAbortMessage(reason));
    }
    function classifyCancellation(error: unknown): CancellationClassification {
        const isObject = (typeof error === 'object' && error !== null) || typeof error === 'function';
        let state: CancellationClassificationState | null = null;
        if (isObject) {
            const cached = classifications.get(error);
            if (cached) {
                if (cached.inFlight)
                    cached.reentered = true;
                return cached.classification;
            }
            state = {
                classification: Object.freeze({ code: '', error, kind: 'other', message: '' }),
                inFlight: true,
                reentered: false,
            };
            classifications.set(error, state);
        }
        let code = '';
        let kind: CancellationClassification['kind'] = 'other';
        let message = '';
        if (isObject) {
            const candidate = error as CancellationMetadataCandidate;
            try {
                if (candidate.name === 'AbortError')
                    kind = 'cancellation';
            }
            catch {
            }
            try {
                const observedCode = candidate.code;
                if (typeof observedCode === 'string')
                    code = observedCode;
                if (observedCode === 'ABORT_ERR')
                    kind = 'cancellation';
            }
            catch {
            }
            message = captureObjectMessage(error);
        }
        else if (error !== null && error !== undefined) {
            message = captureMetadataString(error);
        }
        const classification: CancellationClassification = Object.freeze({
            code,
            error,
            kind,
            message,
        });
        if (state) {
            state.inFlight = false;
            if (state.reentered)
                return state.classification;
            state.classification = classification;
        }
        return classification;
    }
    return Object.freeze({ createAbortError, classifyCancellation });
}
export function copyErrorDescription(error: unknown): Readonly<{
    code: string | null;
    message: string | null;
    truncated: boolean;
}> {
    function ownString(key: string): string | null {
        try {
            if ((typeof error !== 'object' || error === null) && typeof error !== 'function')
                return key === 'message' && typeof error === 'string' ? error : null;
            const slot = Object.getOwnPropertyDescriptor(error, key);
            return slot !== undefined && 'value' in slot && typeof slot.value === 'string' ? slot.value : null;
        }
        catch {
            return null;
        }
    }
    const code = ownString('code'), message = ownString('message');
    return Object.freeze({
        code: code?.slice(0, 128) ?? null,
        message: message?.slice(0, 1024) ?? null,
        truncated: (code?.length ?? 0) > 128 || (message?.length ?? 0) > 1024,
    });
}
