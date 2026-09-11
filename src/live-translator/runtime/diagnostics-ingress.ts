import type { TimingEdge } from './diagnostic-timing.js';
import { captureLogRedactor, redactRecordSink, type LogRedactor } from './log-redaction-port.js';
export type RuntimeDiagnosticFactType = 'record.observed' | 'record.changed' | 'semantic.context' | 'lifecycle.ignored' | 'translation.exchange' | 'translation.requested' | 'translation.available' | 'translation.noop' | 'translation.rejected' | 'translation.superseded' | 'presentation.drawn' | 'presentation.rejected' | 'presentation.invalidated' | 'record.released' | 'failure' | 'runtime.event';
export type RuntimeDiagnosticLevel = 'info' | 'warn' | 'error';
export type RuntimeDiagnosticScalar = string | number | boolean | null;
export interface RuntimeDiagnosticField {
    readonly name: string;
    readonly value: RuntimeDiagnosticScalar;
}
export interface RuntimeDiagnosticFact {
    readonly type: RuntimeDiagnosticFactType;
    readonly level?: RuntimeDiagnosticLevel;
    readonly message?: string;
    readonly fields?: readonly RuntimeDiagnosticField[];
    readonly coreGeneration?: number;
    readonly textId?: number;
    readonly revision?: number;
    readonly attempt?: number;
    readonly physicalTextId?: number;
    readonly physicalRevision?: number;
    readonly bitmapId?: number | null;
    readonly surfaceId?: number | null;
    readonly bitmapMutationSequence?: number | null;
    readonly surfaceMutationSequence?: number | null;
    readonly requestId?: string;
    readonly requestPriority?: number;
    readonly requestStream?: boolean;
    readonly jobId?: string;
    readonly sourceText?: string;
    readonly translation?: string;
}
export interface RuntimeBitmapTextRejectionFact {
    readonly stage: 'observer' | 'physical';
    readonly reason: string;
    readonly sourceText: string | null;
    readonly sourceTruncated: boolean;
    readonly omittedBefore?: number;
    readonly fields?: readonly RuntimeDiagnosticField[];
}
export type RuntimeResourceEvent = {
    readonly kind: 'probe-source';
    readonly id: number;
    readonly action: string;
    readonly values?: readonly number[];
    readonly text?: string;
    readonly site?: string;
} | {
    readonly kind: 'probe-count';
    readonly name: string;
    readonly value: number;
} | {
    readonly kind: 'probe-context';
    readonly engine: string;
    readonly version: string;
    readonly environment?: string;
} | {
    readonly kind: 'probe-census';
    readonly values: readonly number[];
} | {
    readonly kind: 'memory';
    readonly category: string;
    readonly delta: number;
} | {
    readonly kind: 'usage';
    readonly name: string;
    readonly value: number;
    readonly limit: number | null;
} | {
    readonly kind: 'refused';
    readonly name: string;
    readonly requested: number;
    readonly sourceId?: number | null;
    readonly bitmapSourceId?: number | null;
} | {
    readonly kind: 'frame' | 'disposed';
};
export type RuntimeResourceObserver = (event: RuntimeResourceEvent) => void;
export interface RuntimeDiagnosticsIngress {
    readonly acceptTimingEvent?: (generation: number, phase: string, edge: TimingEdge, units?: number, pixels?: number) => void;
    readonly accept?: (fact: RuntimeDiagnosticFact) => void;
    readonly acceptBitmapTextRejection?: (fact: RuntimeBitmapTextRejectionFact) => void;
    readonly acceptResourceEvent?: (generation: number, event: RuntimeResourceEvent) => void;
    readonly acceptResourceProbeEvent?: (generation: number, event: RuntimeResourceEvent) => void;
}
type MutableRuntimeDiagnosticsIngress = {
    -readonly [Key in keyof RuntimeDiagnosticsIngress]: RuntimeDiagnosticsIngress[Key];
};
type PropertyBag = Record<PropertyKey, unknown>;
function isObjectReference(value: unknown): value is PropertyBag {
    return (typeof value === 'object' && value !== null) || typeof value === 'function';
}
function readOwnDataProperty(value: unknown, key: PropertyKey): unknown {
    if (!isObjectReference(value))
        return undefined;
    try {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        return descriptor && Object.hasOwn(descriptor, 'value') ? descriptor.value : undefined;
    }
    catch {
        return undefined;
    }
}
const noRuntimeDiagnosticsIngress: RuntimeDiagnosticsIngress = Object.freeze({});
export function captureRuntimeDiagnosticsIngress(scope: unknown, redactor: LogRedactor | undefined = captureLogRedactor(scope)): RuntimeDiagnosticsIngress {
    const service = readOwnDataProperty(scope, 'LiveTranslatorDiagnostics');
    const ingress = readOwnDataProperty(service, 'ingress');
    const accept = readOwnDataProperty(ingress, 'accept');
    if (!isObjectReference(ingress))
        return noRuntimeDiagnosticsIngress;
    const captured: MutableRuntimeDiagnosticsIngress = {};
    if (typeof accept === 'function') {
        const pinnedAccept = accept as NonNullable<RuntimeDiagnosticsIngress['accept']>;
        captured.accept = redactRecordSink(function acceptFact(fact: RuntimeDiagnosticFact): void {
            try {
                Reflect.apply(pinnedAccept, ingress, [fact]);
            }
            catch {
            }
        }, redactor, ['type', 'level', 'fields.*.name']);
    }
    const bitmapTextRejectionAccept = readOwnDataProperty(ingress, 'acceptBitmapTextRejection');
    if (typeof bitmapTextRejectionAccept === 'function') {
        const pinnedBitmapTextRejectionAccept = bitmapTextRejectionAccept as NonNullable<RuntimeDiagnosticsIngress['acceptBitmapTextRejection']>;
        captured.acceptBitmapTextRejection = redactRecordSink(function acceptBitmapTextRejection(fact: RuntimeBitmapTextRejectionFact): void {
            try {
                Reflect.apply(pinnedBitmapTextRejectionAccept, ingress, [fact]);
            }
            catch {
            }
        }, redactor, ['stage', 'fields.*.name']);
    }
    const resourceAccept = readOwnDataProperty(ingress, 'acceptResourceEvent');
    if (typeof resourceAccept === 'function') {
        const pinnedResourceAccept = resourceAccept as NonNullable<RuntimeDiagnosticsIngress['acceptResourceEvent']>;
        const acceptEvent = (generation: number, event: RuntimeResourceEvent): void => {
            try {
                Reflect.apply(pinnedResourceAccept, ingress, [generation, event]);
            }
            catch {
            }
        };
        captured.acceptResourceEvent =
            redactor === undefined
                ? acceptEvent
                : (generation, event) => {
                    try {
                        acceptEvent(generation, redactor.record(event, ['kind', 'category', 'name', 'action']));
                    }
                    catch {
                    }
                };
    }
    const timingAccept = readOwnDataProperty(ingress, 'acceptTimingEvent');
    if (typeof timingAccept === 'function') {
        captured.acceptTimingEvent = (generation, phase, edge, units, pixels) => {
            try {
                Reflect.apply(timingAccept, ingress, [generation, phase, edge, units, pixels]);
            }
            catch {
            }
        };
    }
    return Object.keys(captured).length === 0 ? noRuntimeDiagnosticsIngress : Object.freeze(captured);
}
