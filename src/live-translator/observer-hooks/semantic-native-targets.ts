import type { NativeOperation, NativeTarget, SemanticFamily } from '../semantic-adapters/contract.js';
import { locateProperty, type OwnedHookSpec } from './owned-hook-installer.js';
interface NativeTargets {
    readonly root: object | null;
    readonly prototypes: readonly object[];
}
function own(value: unknown, key: string): unknown {
    if ((typeof value !== 'object' || value === null) && typeof value !== 'function')
        return undefined;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor !== undefined && 'value' in descriptor ? descriptor.value : undefined;
}
function prototype(scope: object, name: string): object | null {
    const constructor = own(scope, name);
    const value = typeof constructor === 'function' ? own(constructor, 'prototype') : null;
    return typeof value === 'object' && value !== null ? value : null;
}
export function semanticNativeTargets(scope: object, families: ReadonlySet<SemanticFamily>) {
    function resolve(name: string, enabled: boolean, overrides = false): NativeTargets {
        const root = enabled ? prototype(scope, name) : null;
        const candidates = new Set<object>();
        if (root !== null) {
            candidates.add(root);
            for (const key of overrides ? Object.getOwnPropertyNames(scope) : []) {
                let candidate = prototype(scope, key);
                if (candidate === null || !Object.prototype.isPrototypeOf.call(root, candidate))
                    continue;
                while (candidate !== null && candidate !== root) {
                    candidates.add(candidate);
                    candidate = Object.getPrototypeOf(candidate) as object | null;
                }
            }
        }
        return Object.freeze({ root, prototypes: Object.freeze([...candidates]) });
    }
    const text = families.has('window') || families.has('game-message');
    return Object.freeze({
        base: resolve('Window_Base', text),
        message: resolve('Window_Message', text, true),
        selectable: resolve('Window_Selectable', families.has('window'), true),
        help: resolve('Window_Help', families.has('window'), true),
        sprite: Object.freeze({ root: families.has('sprite') ? prototype(scope, 'Sprite') : null, prototypes: [] }),
    });
}
export function permitsSemanticMethod(family: NativeTarget, key: NativeOperation): boolean {
    switch (family) {
        case 'base':
            return ['drawText', 'drawTextEx', 'processCharacter', 'flushTextState'].includes(key);
        case 'message':
            return key === 'startMessage' || key === 'newPage';
        case 'selectable':
            return ['drawItem', 'itemRectForText', 'itemLineRect', 'itemRectWithPadding'].includes(key);
        case 'help':
            return key === 'refresh' || key === 'baseTextRect';
        case 'sprite':
            return key === 'drawText';
    }
}
export function semanticMethodTargets(targets: Readonly<Record<NativeTarget, NativeTargets>>, family: NativeTarget, key: NativeOperation): readonly object[] {
    const { root, prototypes } = targets[family];
    if (root === null || family === 'sprite')
        return [];
    if (family === 'base')
        return [root];
    return prototypes.filter((target) => (target === root && (family === 'message' || (family === 'help' && key === 'baseTextRect'))) ||
        Object.getOwnPropertyDescriptor(target, key) !== undefined);
}
type MethodHook = Extract<OwnedHookSpec, {
    readonly kind: 'method';
}>;
export function spriteInitializationHook(root: object, wrap: MethodHook['wrap'], observing: () => boolean, reportFailure: (error: unknown) => void): MethodHook {
    return {
        kind: 'method',
        target: root,
        key: 'initialize',
        wrap: (native, enabled, add) => function (this: unknown, ...args: unknown[]) {
            if (enabled() && observing()) {
                try {
                    if (typeof this === 'object' &&
                        this !== null &&
                        Object.prototype.isPrototypeOf.call(root, this) &&
                        Object.getOwnPropertyDescriptor(this, 'drawText') === undefined) {
                        const prototype: unknown = Object.getPrototypeOf(this);
                        const found = typeof prototype === 'object' && prototype !== null
                            ? locateProperty(prototype, 'drawText')
                            : null;
                        if (found !== null &&
                            typeof found.descriptor.value === 'function' &&
                            (found.owner === root || Object.prototype.isPrototypeOf.call(root, found.owner))) {
                            add({ kind: 'method', target: found.owner, key: 'drawText', wrap }, reportFailure);
                        }
                    }
                }
                catch (error) {
                    try {
                        reportFailure(error);
                    }
                    catch {
                    }
                }
            }
            return Reflect.apply(native, this, args);
        },
    };
}
