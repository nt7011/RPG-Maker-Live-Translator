import { captureLogRedactor, redactRecordSink, type LogRedactor } from '../runtime/log-redaction-port.js';
type PropertyBag = Record<PropertyKey, unknown>;
type RuntimeMethod = (...args: never[]) => unknown;
interface MethodBinding {
    readonly receiver: PropertyBag;
    readonly method: RuntimeMethod;
}
interface ActiveWindow {
    readonly opened: unknown;
    attached: boolean;
    detach: MethodBinding | null;
    status: {
        attached: boolean;
        detach: MethodBinding | null;
    };
    records: {
        attached: boolean;
        detach: MethodBinding | null;
    };
}
function isPropertyBag(value: unknown): value is PropertyBag {
    return (typeof value === 'object' && value !== null) || typeof value === 'function';
}
function isRuntimeMethod(value: unknown): value is RuntimeMethod {
    return typeof value === 'function';
}
function propertyValue(value: unknown, key: PropertyKey): unknown {
    if (!isPropertyBag(value))
        return undefined;
    try {
        return value[key];
    }
    catch {
        return undefined;
    }
}
function ownDataValue(value: unknown, key: PropertyKey): unknown {
    if (!isPropertyBag(value))
        return undefined;
    try {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        return descriptor && 'value' in descriptor ? descriptor.value : undefined;
    }
    catch {
        return undefined;
    }
}
function captureMethod(receiver: unknown, name: PropertyKey): MethodBinding | null {
    const method = ownDataValue(receiver, name);
    return isPropertyBag(receiver) && isRuntimeMethod(method) ? { receiver, method } : null;
}
function findGuiSink(openedWindow: unknown, name: string): PropertyBag | null {
    const childWindow = propertyValue(openedWindow, 'window');
    for (const scope of [childWindow, openedWindow]) {
        const sink = ownDataValue(scope, name);
        if (isPropertyBag(sink))
            return sink;
    }
    return null;
}
function detach(binding: MethodBinding | null): void {
    if (binding === null)
        return;
    try {
        Reflect.apply(binding.method, binding.receiver, []);
    }
    catch {
    }
}
export function createGuiWindowAttachment(scope: PropertyBag, redactor: LogRedactor | undefined = captureLogRedactor(scope)) {
    const service = ownDataValue(scope, 'LiveTranslatorDiagnostics');
    const attachGui = captureMethod(service, 'attachGui');
    let active: ActiveWindow | null = null;
    function tryAttachDiagnostics(owner: ActiveWindow): boolean {
        if (active !== owner || owner.attached || attachGui === null)
            return owner.attached;
        const sink = findGuiSink(owner.opened, 'LiveTranslatorGuiDiagnosticsSink');
        if (sink === null)
            return false;
        owner.attached = true;
        let lease: unknown;
        try {
            lease = Reflect.apply(attachGui.method, attachGui.receiver, [sink]);
        }
        catch {
            if (active === owner)
                owner.attached = false;
            return false;
        }
        const detachLease = captureMethod(lease, 'detach');
        if (active !== owner) {
            detach(detachLease);
            return true;
        }
        owner.detach = detachLease;
        return true;
    }
    function tryAttachRuntime(owner: ActiveWindow, kind: 'status' | 'records'): boolean {
        const feed = owner[kind];
        if (active !== owner || feed.attached)
            return feed.attached;
        const publication = kind === 'status' ? 'LiveTranslatorTranslationStatus' : 'LiveTranslatorTextRecords';
        const sink = kind === 'status' ? 'LiveTranslatorGuiStatusSink' : 'LiveTranslatorGuiTextRecordsSink';
        const subscribe = captureMethod(ownDataValue(scope, publication), 'subscribe');
        const accept = captureMethod(findGuiSink(owner.opened, sink), 'accept');
        if (!subscribe || !accept)
            return false;
        feed.attached = true;
        let lease: unknown;
        try {
            lease = Reflect.apply(subscribe.method, subscribe.receiver, [
                redactRecordSink((snapshot: unknown) => {
                    if (active !== owner)
                        return;
                    try {
                        Reflect.apply(accept.method, accept.receiver, [snapshot]);
                    }
                    catch {
                    }
                }, redactor, kind === 'records'
                    ? ['records.*.state', 'records.*.failure.stage', 'records.*.failure.recovery']
                    : ['provider.state', 'provider.connection', 'provider.kind']),
            ]);
        }
        catch {
            if (active === owner)
                feed.attached = false;
            return false;
        }
        const unsubscribe = captureMethod(lease, 'detach');
        if (active !== owner) {
            detach(unsubscribe);
            return true;
        }
        feed.detach = unsubscribe;
        return true;
    }
    function tryAttach(owner: ActiveWindow): boolean {
        const diagnosticsReady = tryAttachDiagnostics(owner) || attachGui === null;
        const statusReady = tryAttachRuntime(owner, 'status');
        const recordsReady = tryAttachRuntime(owner, 'records');
        return diagnosticsReady && statusReady && recordsReady;
    }
    function observeAvailability(owner: ActiveWindow): void {
        const retry = (): void => {
            tryAttach(owner);
        };
        const on = propertyValue(owner.opened, 'on');
        if (typeof on === 'function') {
            try {
                Reflect.apply(on, owner.opened, ['loaded', retry]);
                return;
            }
            catch {
            }
        }
        const addEventListener = propertyValue(owner.opened, 'addEventListener');
        if (typeof addEventListener !== 'function')
            return;
        try {
            Reflect.apply(addEventListener, owner.opened, ['load', retry, { once: true }]);
        }
        catch {
        }
    }
    function opened(openedWindow: unknown): void {
        const previous = active;
        active = null;
        if (previous !== null) {
            detach(previous.detach);
            detach(previous.status.detach);
            detach(previous.records.detach);
        }
        const owner: ActiveWindow = {
            opened: openedWindow,
            attached: false,
            detach: null,
            status: { attached: false, detach: null },
            records: { attached: false, detach: null },
        };
        active = owner;
        if (!tryAttach(owner))
            observeAvailability(owner);
    }
    function closed(openedWindow: unknown): void {
        const owner = active;
        if (owner === null || owner.opened !== openedWindow)
            return;
        active = null;
        detach(owner.detach);
        detach(owner.status.detach);
        detach(owner.records.detach);
    }
    return Object.freeze({ opened, closed });
}
