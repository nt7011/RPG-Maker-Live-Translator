import type { BitmapDrawRef, NativeTextObservation, TextObservationRef, TextRange, NativeTextArea, NativeBitmapDraw, NativeCaptureHost, NativeCapture, NativeDrawDiagnostics, NativeTarget, } from '../contract.js';
import { own, number, instanceOf, nativeOwner } from './native.js';
import { isLiteralSource } from './source.js';
interface State {
    readonly text: string;
    readonly token: TextObservationRef;
    readonly native: object | null;
    readonly family: NativeTextObservation['family'];
    readonly startX: number | null;
    readonly startY: number | null;
    readonly width: number | null;
    readonly operation: string;
    buffer: TextRange | null;
}
interface CapturedDraw extends SpriteLiteralDraw {
    readonly allocation: NativeTextArea | null;
    readonly draw: BitmapDrawRef;
}
interface Frame {
    readonly receiver: object;
    readonly family: NativeTextObservation['family'];
    readonly kind: 'drawText' | 'drawTextEx' | 'startMessage' | 'processCharacter' | 'flushTextState';
    readonly args: readonly unknown[];
    readonly draws: CapturedDraw[];
    invalid: boolean;
    literal: string | null;
    state: State | null;
    rejection?: string;
    nativeSource?: string;
}
function index(value: unknown): number | null {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}
function spriteLineArea(command: Pick<NativeBitmapDraw, 'placement' | 'width'>, rejected?: (reason: string) => void): NativeTextArea | null {
    const left = command.placement.x, right = left + command.placement.maxWidth;
    if (![left, right, command.width].every(Number.isFinite) || right <= left || left < 0 || right > command.width) {
        rejected?.('sprite-line:outside-source-or-invalid-width');
        return null;
    }
    return { kind: 'line', left, right };
}
type SpriteLiteralDraw = Pick<NativeBitmapDraw, 'source' | 'text' | 'placement' | 'alignment' | 'width' | 'height'>;
export function verifySpriteLiteral(text: string, draws: readonly SpriteLiteralDraw[], rejected?: (reason: string) => void): {
    readonly ranges: readonly TextRange[];
    readonly allocation: NativeTextArea | null;
} | null {
    const first = draws[0];
    if (first === undefined || text.length === 0)
        return null;
    if (draws.length === 1 && first.text === text)
        return { ranges: [{ start: 0, end: text.length }], allocation: spriteLineArea(first, rejected) };
    if (!/[\r\n\u2028\u2029]/u.test(text))
        return null;
    const lines: {
        range: TextRange;
        index: number;
    }[] = [];
    let offset = 0;
    for (const [index, part] of text.split(/(\r\n|[\r\n\u2028\u2029])/u).entries()) {
        if (index % 2 === 0 && part.length > 0)
            lines.push({ range: { start: offset, end: offset + part.length }, index: index / 2 });
        offset += part.length;
    }
    if (lines.length !== draws.length ||
        draws.some((draw, index) => {
            const line = lines[index];
            return (line === undefined ||
                draw.source !== first.source ||
                text.slice(line.range.start, line.range.end) !== draw.text);
        }))
        return null;
    const ranges = lines.map((line) => line.range);
    const unavailable = (reason: string) => {
        rejected?.(reason);
        return { ranges, allocation: null };
    };
    const start = lines[0], last = draws.at(-1);
    if (start === undefined || last === undefined || lines.length < 2)
        return unavailable('sprite-block:insufficient-row-witnesses');
    if (start.range.start !== 0 || lines.at(-1)?.range.end !== text.length)
        return unavailable('sprite-block:unwitnessed-outer-empty-lines');
    const { y, lineHeight } = first.placement;
    if (!Number.isFinite(lineHeight) || lineHeight <= 0)
        return unavailable('sprite-block:invalid-line-height');
    const factor = first.alignment === 'left' ? 0 : first.alignment === 'center' ? 0.5 : 1;
    const anchor = first.placement.x + first.placement.maxWidth * factor;
    let left = -Infinity, right = Infinity;
    for (const [index, draw] of draws.entries()) {
        const line = lines[index];
        if (line === undefined ||
            draw.placement.lineHeight !== lineHeight ||
            draw.placement.y !== y + (line.index - start.index) * lineHeight ||
            draw.alignment !== first.alignment ||
            draw.width !== first.width ||
            draw.height !== first.height)
            return unavailable('sprite-block:inconsistent-native-grid');
        if (draw.placement.x + draw.placement.maxWidth * factor !== anchor)
            return unavailable('sprite-block:incompatible-line-anchors');
        const area = spriteLineArea(draw);
        if (area?.kind !== 'line')
            return unavailable('sprite-block:invalid-line-room');
        left = Math.max(left, area.left);
        right = Math.min(right, area.right);
    }
    const bottom = last.placement.y + lineHeight;
    if (![y, bottom, first.height].every(Number.isFinite) ||
        y < 0 ||
        bottom > first.height ||
        bottom <= y ||
        right <= left)
        return unavailable('sprite-block:outside-source');
    return { ranges, allocation: { kind: 'block', rect: { x: left, y, width: right - left, height: bottom - y } } };
}
export function captureNativeText(host: NativeCaptureHost): NativeCapture {
    const states = new WeakMap<object, WeakMap<object, State>>();
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
        let ownerStates = states.get(frame.receiver);
        if (ownerStates === undefined) {
            ownerStates = new WeakMap();
            states.set(frame.receiver, ownerStates);
        }
        const family = frame.family === 'game-message' ||
            (own(frame.receiver, '_textState') === native && instanceOf(frame.receiver, message))
            ? 'game-message'
            : 'window';
        const previous = ownerStates.get(native);
        if (previous !== undefined && (previous.text !== text || previous.family !== family))
            host.observeSourceChange(previous.token);
        if (!host.accepts(family))
            return null;
        if (host.diagnostic !== undefined && typeof text === 'string')
            frame.nativeSource = text;
        if (typeof text !== 'string' || text.length > 16384) {
            noteRejection?.(frame, typeof text !== 'string' ? 'native-source-not-string' : 'native-source-too-long');
            return null;
        }
        if (previous?.text === text && previous.family === family)
            return previous;
        const operation = frames.findLast((entry) => entry.receiver === frame.receiver && (entry.kind === 'drawTextEx' || entry.kind === 'startMessage'));
        const token = host.observeSource(native, text, family);
        if (token === null) {
            noteRejection?.(frame, text.length === 0 ? 'native-source-empty' : 'source-observation-unavailable');
            return null;
        }
        const state: State = {
            text,
            token,
            native,
            family,
            startX: number(own(native, 'startX')) ?? number(own(native, 'left')) ?? number(own(native, 'x')),
            startY: number(own(native, 'startY')) ?? number(own(native, 'y')),
            width: operation?.kind === 'drawTextEx' ? number(operation.args[3]) : null,
            operation: operation?.kind ?? frame.kind,
            buffer: null,
        };
        ownerStates.set(native, state);
        return state;
    }
    function emit(frame: Frame, range: TextRange | null, reason?: string, literal?: NonNullable<ReturnType<typeof verifySpriteLiteral>>, allocationReason?: string): void {
        const state = frame.state;
        if (frame.invalid && state !== null) {
            host.observeFailure(state.token);
            range = null;
        }
        const matches = (text: string, range: TextRange | null): boolean => state !== null &&
            range !== null &&
            (frame.family === 'sprite'
                ? state.text.slice(range.start, range.end) === text
                : host.matches(state.text.slice(range.start, range.end), text));
        const bySurface = new Map<object, {
            entry: CapturedDraw;
            range: TextRange | null;
        }[]>();
        for (const [index, draw] of frame.draws.entries()) {
            const offsets = frame.invalid ? null : (literal?.ranges[index] ?? range);
            const matched = matches(draw.text, offsets);
            if (host.diagnostic !== undefined) {
                host.diagnostic(draw.draw, state?.token ?? null, frame.kind, reason ??
                    (matched
                        ? 'range-matched'
                        : offsets === null
                            ? 'source-range-unavailable'
                            : 'bitmap-source-range-mismatch'), draw.text, matched ? offsets : null, undefined, literal === undefined
                    ? undefined
                    : {
                        owner: nativeOwner(frame.receiver),
                        operation: `drawText(x=${String(draw.placement.x)}, y=${String(draw.placement.y)}, width=${String(draw.placement.maxWidth)})`,
                        allocationReason: allocationReason ?? null,
                    });
            }
            bySurface.getOrInsertComputed(draw.source, () => []).push({ entry: draw, range: matched ? offsets : null });
        }
        if (state === null)
            return;
        for (const [surface, entries] of bySurface)
            host.observeDraw(state.token, surface, entries.map(({ entry, range }) => ({
                draw: entry.draw,
                text: entry.text,
                range,
            })), literal === undefined ? commonAllocation(entries.map(({ entry }) => entry)) : literal.allocation);
    }
    const message = host.roots.message;
    function method(targetFamily: NativeTarget, key: Frame['kind']): void {
        host.method(targetFamily, key, (native) => function (this: unknown, ...args: unknown[]) {
            if (typeof this !== 'object' || this === null)
                return Reflect.apply(native, this, args);
            const admission = { qualified: false };
            safe(() => {
                admission.qualified = instanceOf(this, host.roots[targetFamily]);
            });
            if (!admission.qualified)
                return Reflect.apply(native, this, args);
            const parent = frames.findLast((entry) => entry.receiver === this);
            if (targetFamily !== 'sprite' &&
                key === 'drawText' &&
                parent?.state != null &&
                parent === frames.at(-1) &&
                (parent.kind === 'processCharacter' || parent.kind === 'flushTextState'))
                return Reflect.apply(native, this, args);
            const frame: Frame = {
                receiver: this,
                kind: key,
                args,
                draws: [],
                invalid: false,
                literal: null,
                state: null,
                family: targetFamily === 'sprite'
                    ? 'sprite'
                    : key === 'startMessage'
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
                    if (frame.family === 'sprite') {
                        const literal = host.normalize(args[0]);
                        frame.literal =
                            literal !== null && literal.length <= 16384 && isLiteralSource(literal)
                                ? literal
                                : null;
                        return;
                    }
                    const text = host.normalize(args[0]);
                    const token = text === null || !host.accepts(frame.family)
                        ? null
                        : host.observeSource(frame.receiver, text, frame.family);
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
                            family: frame.family,
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
                        frame.invalid = true;
                        emit(frame, null, 'native-call-threw');
                        return;
                    }
                    if (key === 'startMessage')
                        frame.state = associate(own(frame.receiver, '_textState'), frame);
                    if (frame.family === 'sprite') {
                        let allocationReason: string | undefined;
                        const witness = frame.invalid || frame.literal === null
                            ? null
                            : verifySpriteLiteral(frame.literal, frame.draws, host.diagnostic === undefined
                                ? undefined
                                : (reason) => {
                                    allocationReason = reason;
                                });
                        if (witness === null || frame.literal === null) {
                            emit(frame, null, 'sprite-literal-batch-unproved');
                            return;
                        }
                        const token = host.observeSource(frame.receiver, frame.literal, 'sprite');
                        if (token !== null)
                            frame.state = {
                                text: frame.literal,
                                token,
                                native: null,
                                family: 'sprite',
                                startX: null,
                                startY: null,
                                width: null,
                                operation: 'drawText',
                                buffer: null,
                            };
                        emit(frame, null, undefined, witness, allocationReason);
                        return;
                    }
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
        method('base', key);
    method('message', 'startMessage');
    method('sprite', 'drawText');
    return {
        capture(command: NativeBitmapDraw, draw: BitmapDrawRef): void {
            const frame = frames.at(-1);
            const capacityExceeded = frame !== undefined && frame.draws.length >= host.maxDraws;
            let native: NativeDrawDiagnostics | undefined;
            if (frame !== undefined) {
                if (capacityExceeded)
                    frame.invalid = true;
                for (const ancestor of frames)
                    if (ancestor !== frame &&
                        ancestor.kind === 'drawText' &&
                        (ancestor.state === null || ancestor.state !== frame.state))
                        ancestor.invalid = true;
            }
            if (frame !== undefined && host.enabled() && !capacityExceeded) {
                let allocation: NativeTextArea | null = null;
                safe(() => {
                    const context = {
                        ...command,
                        receiver: frame.receiver,
                        textState: frame.state?.native ?? null,
                        x: frame.family === 'sprite'
                            ? command.placement.x
                            : (frame.state?.startX ?? number(frame.args[1])),
                        y: frame.family === 'sprite'
                            ? command.placement.y
                            : (frame.state?.startY ?? number(frame.args[2])),
                        maxWidth: frame.family === 'sprite'
                            ? command.placement.maxWidth
                            : (frame.state?.width ?? number(frame.args[3])),
                    };
                    let allocationReason: string | null = null;
                    const rejected = host.diagnostic === undefined
                        ? undefined
                        : (reason: string) => {
                            allocationReason = reason;
                        };
                    allocation = frame.family === 'sprite' ? null : host.allocation(context, rejected);
                    if (host.diagnostic !== undefined)
                        native = {
                            owner: nativeOwner(frame.receiver),
                            operation: `${frame.state?.operation ?? frame.kind}(x=${String(context.x ?? 'unknown')}, y=${String(context.y ?? 'unknown')}, width=${String(context.maxWidth ?? 'unspecified')})`,
                            allocationReason,
                        };
                });
                frame.draws.push({
                    source: command.source,
                    text: command.text,
                    draw,
                    allocation,
                    placement: command.placement,
                    alignment: command.alignment,
                    width: command.width,
                    height: command.height,
                });
            }
            host.diagnostic?.(draw, frame?.state?.token ?? null, frame?.kind ?? 'Bitmap.drawText', frame === undefined
                ? 'no-native-text-context'
                : capacityExceeded
                    ? 'native-draw-observation-capacity-exceeded'
                    : (frame.rejection ?? 'native-text-state-unassociated'), command.text, null, frame?.nativeSource, native);
        },
    };
}
function commonAllocation(entries: readonly CapturedDraw[]): NativeTextArea | null {
    const first = entries[0]?.allocation;
    if (first == null ||
        entries.some(({ allocation: area }) => {
            if (first.kind === 'line')
                return area?.kind !== 'line' || area.left !== first.left || area.right !== first.right;
            return (area?.kind !== 'block' ||
                area.rect.x !== first.rect.x ||
                area.rect.y !== first.rect.y ||
                area.rect.width !== first.rect.width ||
                area.rect.height !== first.rect.height);
        }))
        return null;
    return first;
}
