import { NATIVE_LIMITS, type ForesightNativeLimits } from '../configuration/foresight.js';
import { locateProperty, type OwnedHookSpec } from '../observer-hooks/owned-hook-installer.js';
import type { NativeMethod, SemanticFamily, TextObservationRef } from '../semantic-adapters/contract.js';
import { integer, own, readCommand, sameCommand, type ForesightCommand } from './commands.js';
interface Origin {
    readonly interpreter: WeakRef<object>;
    readonly list: WeakRef<unknown[]>;
    readonly message: WeakRef<object>;
    readonly generation: object;
    readonly start: number;
    readonly next: number;
    readonly choiceIndex: number | null;
    readonly text: string;
    readonly choices: readonly string[];
    readonly facts: readonly ForesightCommand[];
    selectedChoice: number | null;
}
interface MessageSource {
    readonly origin: Origin;
    readonly owner: WeakRef<object>;
    readonly state: WeakRef<object>;
    readonly text: string;
}
interface CommandFrame {
    readonly interpreter: object;
    readonly list: unknown[];
    readonly index: number;
    readonly generation: object;
    message: object | null;
    invalid: boolean;
}
interface WindowFrame {
    readonly owner: unknown;
    origin: Origin | null;
    invalid: boolean;
}
export interface ForesightPosition {
    readonly key: object;
    readonly source: TextObservationRef;
    readonly list: unknown[];
    readonly start: number;
    readonly selectedChoice: number | null;
    readonly currentChoices: boolean;
    readonly messageIndex: number;
}
function object(value: unknown): value is object {
    return typeof value === 'object' && value !== null;
}
function strings(value: unknown, limits: ForesightNativeLimits, entries: number): readonly string[] | null {
    if (!Array.isArray(value) || value.length > entries)
        return null;
    const result: string[] = [];
    let units = 0;
    for (let i = 0; i < value.length; i++) {
        const text = own(value, i);
        if (typeof text !== 'string' || (units += text.length + 1) > limits.messageUnits + 1)
            return null;
        result.push(text);
    }
    return result;
}
function sameStrings(left: readonly string[], right: readonly string[] | null): boolean {
    return right !== null && left.length === right.length && left.every((text, i) => text === right[i]);
}
export function createForesightPosition(scope: object, limits: ForesightNativeLimits = NATIVE_LIMITS) {
    const origins = new WeakMap<object, Origin>();
    const generations = new WeakMap<object, object>();
    const sourceTokens = new WeakMap<object, TextObservationRef>();
    const sources = new WeakMap<TextObservationRef, MessageSource>();
    const commands: CommandFrame[] = [];
    const windows: WindowFrame[] = [];
    const hooks: OwnedHookSpec[] = [];
    const availability = { active: true };
    function safely<Value>(action: () => Value): Value | null {
        try {
            return action();
        }
        catch {
            return null;
        }
    }
    function generation(interpreter: object): object {
        return generations.getOrInsertComputed(interpreter, () => Object.freeze({}));
    }
    function accept(frame: CommandFrame): void {
        const receiver = frame.message;
        const next = integer(own(frame.interpreter, '_index'));
        if (receiver === null ||
            frame.invalid ||
            next === null ||
            next <= frame.index ||
            next - frame.index > limits.captureReads ||
            own(frame.interpreter, '_list') !== frame.list ||
            own(frame.interpreter, '_waitMode') !== 'message' ||
            generation(frame.interpreter) !== frame.generation)
            return;
        const facts: ForesightCommand[] = [];
        const lines: string[] = [];
        let choiceIndex: number | null = null;
        let units = 0;
        for (let index = frame.index; index < next; index++) {
            const command = readCommand(frame.list, index, limits);
            if (command === null)
                return;
            if (index === frame.index) {
                if (command.code !== 101 && command.code !== 102)
                    return;
            }
            else if (command.code !== 401 && !([102, 103, 104].includes(command.code) && index === next - 1))
                return;
            if (command.code === 401) {
                if (command.text === null ||
                    (units += command.text.length + (lines.length ? 1 : 0)) > limits.messageUnits)
                    return;
                lines.push(command.text);
            }
            if (command.code === 102)
                choiceIndex = index;
            facts.push(command);
        }
        const payload = strings(own(receiver, '_texts'), limits, limits.captureReads);
        const choices = strings(own(receiver, '_choices'), limits, limits.choices);
        if (!sameStrings(lines, payload) || choices === null)
            return;
        const authored = choiceIndex === null ? [] : facts[choiceIndex - frame.index]?.choices;
        if (authored === undefined || authored === null || !sameStrings(authored, choices))
            return;
        origins.set(receiver, {
            interpreter: new WeakRef(frame.interpreter),
            list: new WeakRef(frame.list),
            message: new WeakRef(receiver),
            generation: frame.generation,
            start: frame.index,
            next,
            choiceIndex,
            text: lines.join('\n'),
            choices,
            facts,
            selectedChoice: null,
        });
    }
    function hook(constructor: string, key: string, wrap: (native: NativeMethod) => NativeMethod): void {
        const target = safely(() => {
            const root = own(own(scope, constructor), 'prototype');
            const found = object(root) ? locateProperty(root, key) : null;
            return object(root) &&
                found !== null &&
                typeof found.descriptor.value === 'function' &&
                (found.owner === root
                    ? found.descriptor.configurable === true || found.descriptor.writable === true
                    : Object.isExtensible(root))
                ? root
                : null;
        });
        if (target === null) {
            availability.active = false;
            return;
        }
        hooks.push({
            kind: 'method',
            target,
            key,
            wrap: (native, enabled) => {
                const observed = wrap(native);
                return function (this: unknown, ...args: unknown[]) {
                    return Reflect.apply(availability.active && enabled() ? observed : native, this, args);
                };
            },
        });
    }
    hook('Game_Interpreter', 'clear', (native) => function (this: unknown, ...args: unknown[]) {
        if (object(this))
            generations.delete(this);
        return Reflect.apply(native, this, args);
    });
    hook('Game_Interpreter', 'executeCommand', (native) => function (this: unknown, ...args: unknown[]) {
        const frame = safely((): CommandFrame | null => {
            const list = own(this, '_list'), index = integer(own(this, '_index'));
            if (!object(this) ||
                !Array.isArray(list) ||
                index === null ||
                commands.length >= limits.commandFrames)
                return null;
            const code = readCommand(list, index, limits)?.code;
            if (code === 101 || code === 102)
                return {
                    interpreter: this,
                    list,
                    index,
                    generation: generation(this),
                    message: null,
                    invalid: false,
                };
            return null;
        });
        const outer = commands.length;
        if (frame !== null)
            commands.push(frame);
        else {
            const parent = commands.at(-1);
            if (parent !== undefined)
                parent.invalid = true;
        }
        try {
            const result = Reflect.apply(native, this, args);
            if (frame !== null)
                safely(() => {
                    accept(frame);
                });
            return result;
        }
        finally {
            commands.length = outer;
        }
    });
    for (const method of ['add', 'setChoices'])
        hook('Game_Message', method, (native) => function (this: unknown, ...args: unknown[]) {
            const frame = commands.at(-1);
            if (object(this))
                origins.delete(this);
            const result = Reflect.apply(native, this, args);
            if (frame !== undefined && object(this)) {
                if (frame.message !== null && frame.message !== this)
                    frame.invalid = true;
                frame.message = this;
            }
            return result;
        });
    hook('Game_Message', 'clear', (native) => function (this: unknown, ...args: unknown[]) {
        if (object(this))
            origins.delete(this);
        return Reflect.apply(native, this, args);
    });
    hook('Game_Message', 'allText', (native) => function (this: unknown, ...args: unknown[]) {
        const result = Reflect.apply(native, this, args);
        const active = windows.at(-1);
        if (active !== undefined)
            safely(() => {
                const origin = object(this) ? origins.get(this) : undefined;
                for (let i = windows.length - 1; i >= 0; i--) {
                    const frame = windows[i];
                    if (frame === undefined || frame.owner !== active.owner)
                        break;
                    if (origin === undefined ||
                        result !== origin.text ||
                        (frame.origin !== null && frame.origin !== origin))
                        frame.invalid = true;
                    else
                        frame.origin = origin;
                }
            });
        return result;
    });
    hook('Game_Message', 'onChoice', (native) => function (this: unknown, ...args: unknown[]) {
        const origin = object(this) ? origins.get(this) : undefined;
        const result = Reflect.apply(native, this, args);
        const selected = args[0];
        if (origin !== undefined &&
            typeof selected === 'number' &&
            Number.isInteger(selected) &&
            (selected === -2 || (selected >= 0 && selected < origin.choices.length)))
            origin.selectedChoice = selected;
        return result;
    });
    return Object.freeze({
        hooks: availability.active ? hooks : [],
        observeSource(native: object, token: TextObservationRef, family: SemanticFamily): void {
            if (availability.active && family === 'game-message')
                sourceTokens.set(native, token);
        },
        wrapMessage(native: NativeMethod): NativeMethod {
            return function (this: unknown, ...args: unknown[]) {
                if (!availability.active || windows.length >= limits.windowFrames)
                    return Reflect.apply(native, this, args);
                const frame: WindowFrame = { owner: this, origin: null, invalid: false };
                windows.push(frame);
                try {
                    const result = Reflect.apply(native, this, args);
                    safely(() => {
                        const state = own(this, '_textState');
                        const token = object(state) ? sourceTokens.get(state) : undefined;
                        const text = own(state, 'text');
                        if (!frame.invalid &&
                            frame.origin !== null &&
                            object(this) &&
                            object(state) &&
                            token !== undefined &&
                            typeof text === 'string')
                            sources.set(token, {
                                origin: frame.origin,
                                owner: new WeakRef(this),
                                state: new WeakRef(state),
                                text,
                            });
                    });
                    return result;
                }
                finally {
                    windows.pop();
                }
            };
        },
        select(shown: Iterable<TextObservationRef>): ForesightPosition | null {
            if (!availability.active)
                return null;
            for (const source of shown) {
                const result = safely((): ForesightPosition | null => {
                    const binding = sources.get(source);
                    if (binding === undefined)
                        return null;
                    const { origin } = binding;
                    const receiver = origin.message.deref(), interpreter = origin.interpreter.deref(), list = origin.list.deref();
                    const owner = binding.owner.deref(), state = binding.state.deref();
                    if (receiver === undefined ||
                        interpreter === undefined ||
                        list === undefined ||
                        owner === undefined ||
                        state === undefined ||
                        origins.get(receiver) !== origin ||
                        generations.get(interpreter) !== origin.generation ||
                        own(interpreter, '_list') !== list ||
                        own(interpreter, '_index') !== origin.next ||
                        own(interpreter, '_waitMode') !== 'message' ||
                        own(state, 'text') !== binding.text ||
                        (own(owner, '_textState') !== state && own(owner, '_textState') !== null) ||
                        strings(own(receiver, '_texts'), limits, limits.captureReads)?.join('\n') !== origin.text ||
                        !sameStrings(origin.choices, strings(own(receiver, '_choices'), limits, limits.choices)))
                        return null;
                    for (const [offset, command] of origin.facts.entries())
                        if (!sameCommand(command, readCommand(list, origin.start + offset, limits)))
                            return null;
                    return {
                        key: origin,
                        source,
                        list,
                        start: origin.choiceIndex ?? origin.next,
                        messageIndex: origin.start,
                        selectedChoice: origin.selectedChoice,
                        currentChoices: origin.choiceIndex !== null,
                    };
                });
                if (result !== null)
                    return result;
            }
            return null;
        },
        dispose(): void {
            availability.active = false;
            commands.length = 0;
            windows.length = 0;
        },
    });
}
export type ForesightPositionCapture = ReturnType<typeof createForesightPosition>;
