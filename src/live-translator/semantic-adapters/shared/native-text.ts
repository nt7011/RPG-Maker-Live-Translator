import type { BitmapDrawRef, NativeTextObservation, TextObservationRef, TextRange, Rect, NativeBitmapDraw, NativeCaptureHost, NativeCapture, NativeDrawDiagnostics, } from '../contract.js';
import { own, number, prototype, nativeOwner } from './native.js';
interface State {
    readonly text: string;
    readonly token: TextObservationRef;
    readonly native: object | null;
    readonly startX: number | null;
    readonly startY: number | null;
    readonly width: number | null;
    readonly operation: string;
    buffer: TextRange | null;
}
interface CapturedDraw {
    readonly source: object;
    readonly allocation: Rect | null;
    readonly text: string;
    readonly draw: BitmapDrawRef;
}
interface Frame {
    readonly receiver: object;
    readonly family: NativeTextObservation['family'];
    readonly kind: 'drawText' | 'drawTextEx' | 'startMessage' | 'processCharacter' | 'flushTextState';
    readonly args: readonly unknown[];
    readonly draws: CapturedDraw[];
    state: State | null;
    rejection?: string;
    nativeSource?: string;
}
function index(value: unknown): number | null {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}
export function captureNativeText(host: NativeCaptureHost): NativeCapture {
    const states = new WeakMap<object, State>();
    const frames: Frame[] = [];
    const noteRejection = host.diagnostic === undefined
        ? undefined
        : (frame: Frame, reason: string): void => {
            frame.rejection = reason;
        };
    const safe = host.safely;
    function associate(native: unknown, frame: Frame): State | null {
        if (typeof native !== 'object' || native === null) {
            noteRejection?.(frame, 'native-text-state-unavailable');
            return null;
        }
        const text = own(native, 'text');
        const previous = states.get(native);
        if (previous !== undefined && previous.text !== text)
            host.observeSourceChange(previous.token);
        if (host.diagnostic !== undefined && typeof text === 'string')
            frame.nativeSource = text;
        if (typeof text !== 'string' || text.length > 16384) {
            noteRejection?.(frame, typeof text !== 'string' ? 'native-source-not-string' : 'native-source-too-long');
            return null;
        }
        if (previous?.text === text)
            return previous;
        const operation = frames.findLast((entry) => entry.receiver === frame.receiver && (entry.kind === 'drawTextEx' || entry.kind === 'startMessage'));
        const family = frame.family === 'game-message' ||
            (message !== null &&
                own(frame.receiver, '_textState') === native &&
                Object.prototype.isPrototypeOf.call(message, frame.receiver))
            ? 'game-message'
            : 'window';
        const token = host.observeSource(native, text, family);
        if (token === null) {
            noteRejection?.(frame, text.length === 0 ? 'native-source-empty' : 'source-observation-unavailable');
            return null;
        }
        const state: State = {
            text,
            token,
            native,
            startX: number(own(native, 'startX')) ?? number(own(native, 'left')) ?? number(own(native, 'x')),
            startY: number(own(native, 'startY')) ?? number(own(native, 'y')),
            width: operation?.kind === 'drawTextEx' ? number(operation.args[3]) : null,
            operation: operation?.kind ?? frame.kind,
            buffer: null,
        };
        states.set(native, state);
        return state;
    }
    function emit(frame: Frame, range: TextRange | null, reason?: string): void {
        const state = frame.state;
        const bySurface = new Map<object, CapturedDraw[]>();
        for (const draw of frame.draws) {
            if (host.diagnostic !== undefined) {
                const matched = state !== null &&
                    range !== null &&
                    host.matches(state.text.slice(range.start, range.end), draw.text);
                host.diagnostic(draw.draw, state?.token ?? null, frame.kind, reason ??
                    (matched
                        ? 'range-matched'
                        : range === null
                            ? 'source-range-unavailable'
                            : 'bitmap-source-range-mismatch'), draw.text, matched ? range : null);
            }
            const entries = bySurface.get(draw.source) ?? [];
            entries.push(draw);
            bySurface.set(draw.source, entries);
        }
        if (state === null)
            return;
        for (const [surface, entries] of bySurface)
            host.observeDraw(state.token, surface, entries.map((entry) => ({
                draw: entry.draw,
                text: entry.text,
                range: range !== null && host.matches(state.text.slice(range.start, range.end), entry.text)
                    ? range
                    : null,
            })), commonAllocation(entries));
    }
    const base = prototype(host.scope, 'Window_Base'), message = prototype(host.scope, 'Window_Message');
    function method(target: object | null, key: Frame['kind']): void {
        host.method(target, key, (native) => function (this: unknown, ...args: unknown[]) {
            if (typeof this !== 'object' || this === null)
                return Reflect.apply(native, this, args);
            const parent = frames.findLast((entry) => entry.receiver === this);
            if (key === 'drawText' &&
                parent?.state != null &&
                parent === frames.at(-1) &&
                (parent.kind === 'processCharacter' || parent.kind === 'flushTextState'))
                return Reflect.apply(native, this, args);
            const frame: Frame = {
                receiver: this,
                kind: key,
                args,
                draws: [],
                state: null,
                family: key === 'startMessage'
                    ? 'game-message'
                    : key === 'drawText'
                        ? 'window'
                        : (parent?.family ?? 'window'),
            };
            const nativeState = args[0];
            let beforeIndex: number | null = null;
            let beforeBuffer: unknown;
            let beforeRange: TextRange | null = null;
            frames.push(frame);
            safe(() => {
                beforeIndex = index(own(nativeState, 'index'));
                beforeBuffer = own(nativeState, 'buffer');
                if (key === 'drawText') {
                    const text = host.normalize(args[0]);
                    const token = text === null ? null : host.observeSource(frame.receiver, text, frame.family);
                    if (host.diagnostic !== undefined && text !== null)
                        frame.nativeSource = text;
                    if (token === null)
                        noteRejection?.(frame, text === null
                            ? 'draw-text-source-unavailable'
                            : text.length > 16384
                                ? 'native-source-too-long'
                                : 'source-observation-unavailable');
                    if (text !== null && token !== null)
                        frame.state = {
                            text,
                            token,
                            native: null,
                            startX: number(args[1]),
                            startY: number(args[2]),
                            width: number(args[3]),
                            operation: 'drawText',
                            buffer: null,
                        };
                }
                else if (key === 'processCharacter' || key === 'flushTextState') {
                    frame.state = associate(nativeState, frame);
                    beforeRange = frame.state?.buffer ?? null;
                }
            });
            let returned = false;
            try {
                const result = Reflect.apply(native, this, args);
                returned = true;
                return result;
            }
            finally {
                safe(() => {
                    const sourceChanged = frame.state !== null &&
                        (key === 'processCharacter' || key === 'flushTextState') &&
                        own(nativeState, 'text') !== frame.state.text;
                    if (sourceChanged && frame.state !== null)
                        host.observeSourceChange(frame.state.token);
                    if (!returned) {
                        emit(frame, null, 'native-call-threw');
                        return;
                    }
                    if (key === 'startMessage')
                        frame.state = associate(own(frame.receiver, '_textState'), frame);
                    const state = frame.state;
                    if (state === null) {
                        emit(frame, null, frame.rejection ?? 'native-text-state-unassociated');
                        return;
                    }
                    if (sourceChanged) {
                        emit(frame, null, 'native-source-changed-during-call');
                        return;
                    }
                    const afterIndex = index(own(nativeState, 'index'));
                    const afterBuffer = own(nativeState, 'buffer');
                    if (key === 'processCharacter') {
                        const range = beforeIndex !== null &&
                            afterIndex !== null &&
                            afterIndex > beforeIndex &&
                            afterIndex <= state.text.length
                            ? { start: beforeIndex, end: afterIndex }
                            : null;
                        emit(frame, range);
                        if (range !== null && typeof afterBuffer === 'string') {
                            if (beforeBuffer === '' || state.buffer === null)
                                state.buffer = range;
                            else if (beforeRange !== null &&
                                state.buffer === beforeRange &&
                                typeof beforeBuffer === 'string' &&
                                beforeRange.end === range.start)
                                state.buffer = { start: beforeRange.start, end: range.end };
                            else
                                state.buffer = null;
                        }
                        else
                            state.buffer = null;
                    }
                    else if (key === 'flushTextState') {
                        emit(frame, beforeRange !== null &&
                            typeof beforeBuffer === 'string' &&
                            host.matches(state.text.slice(beforeRange.start, beforeRange.end), beforeBuffer)
                            ? beforeRange
                            : null);
                        state.buffer = null;
                    }
                    else if (key === 'drawText')
                        emit(frame, { start: 0, end: state.text.length });
                    else
                        emit(frame, null);
                });
                frames.pop();
            }
        });
    }
    const methods: readonly Frame['kind'][] = ['drawText', 'drawTextEx', 'processCharacter', 'flushTextState'];
    for (const key of methods)
        method(base, key);
    method(message, 'startMessage');
    return {
        capture(command: NativeBitmapDraw, draw: BitmapDrawRef): void {
            const frame = frames.at(-1);
            const capacityExceeded = frame !== undefined && frame.draws.length >= host.maxDraws;
            let native: NativeDrawDiagnostics | undefined;
            if (frame !== undefined && host.enabled() && !capacityExceeded) {
                let allocation: Rect | null = null;
                safe(() => {
                    const context = {
                        ...command,
                        receiver: frame.receiver,
                        textState: frame.state?.native ?? null,
                        x: frame.state?.startX ?? number(frame.args[1]),
                        y: frame.state?.startY ?? number(frame.args[2]),
                        maxWidth: frame.state?.width ?? number(frame.args[3]),
                    };
                    let allocationReason: string | null = null;
                    allocation = host.allocation(context, host.diagnostic === undefined
                        ? undefined
                        : (reason) => {
                            allocationReason = reason;
                        });
                    if (host.diagnostic !== undefined)
                        native = {
                            owner: nativeOwner(frame.receiver),
                            operation: `${frame.state?.operation ?? frame.kind}(x=${String(context.x ?? 'unknown')}, y=${String(context.y ?? 'unknown')}, width=${String(context.maxWidth ?? 'unspecified')})`,
                            allocationReason,
                        };
                });
                frame.draws.push({ source: command.source, text: command.text, draw, allocation });
            }
            host.diagnostic?.(draw, frame?.state?.token ?? null, frame?.kind ?? 'Bitmap.drawText', frame === undefined
                ? 'no-native-text-context'
                : capacityExceeded
                    ? 'native-draw-observation-capacity-exceeded'
                    : (frame.rejection ?? 'native-text-state-unassociated'), command.text, null, frame?.nativeSource, native);
        },
    };
}
function commonAllocation(entries: readonly CapturedDraw[]): Rect | null {
    const first = entries[0]?.allocation;
    if (first == null ||
        entries.some(({ allocation: area }) => area?.x !== first.x || area.y !== first.y || area.width !== first.width || area.height !== first.height))
        return null;
    return first;
}
