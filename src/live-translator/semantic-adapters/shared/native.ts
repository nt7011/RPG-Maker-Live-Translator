import type { Rect } from '../contract.js';
export function own(value: unknown, key: string): unknown {
    if ((typeof value !== 'object' || value === null) && typeof value !== 'function')
        return undefined;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor !== undefined && 'value' in descriptor ? descriptor.value : undefined;
}
export function number(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
export function object(value: unknown): object | null {
    return typeof value === 'object' && value !== null ? value : null;
}
export function prototype(scope: object, name: string): object | null {
    const constructor = own(scope, name);
    return typeof constructor === 'function' ? object(own(constructor, 'prototype')) : null;
}
export function nativePrototypes(scope: object, name: string): ReadonlySet<object> {
    const base = prototype(scope, name);
    const targets = new Set<object>();
    if (base === null)
        return targets;
    targets.add(base);
    for (const key of Object.getOwnPropertyNames(scope)) {
        const candidate = prototype(scope, key);
        if (candidate === null || !Object.prototype.isPrototypeOf.call(base, candidate))
            continue;
        let current: object | null = candidate;
        while (current !== null && current !== base) {
            targets.add(current);
            current = object(Object.getPrototypeOf(current));
        }
    }
    return targets;
}
export function contents(receiver: object): object | null {
    const direct = object(own(receiver, 'contents'));
    if (direct !== null)
        return direct;
    const sprite = object(own(receiver, '_contentsSprite')) ?? object(own(receiver, '_windowContentsSprite'));
    return object(own(sprite, 'bitmap')) ?? object(own(sprite, '_bitmap'));
}
export function rectangle(value: unknown): Rect | null {
    const x = number(own(value, 'x')), y = number(own(value, 'y')), width = number(own(value, 'width')), height = number(own(value, 'height'));
    return x !== null && y !== null && width !== null && height !== null && width > 0 && height > 0
        ? { x, y, width, height }
        : null;
}
export function nativeOwner(receiver: object): string | null {
    const constructor = own(Object.getPrototypeOf(receiver), 'constructor');
    const name = typeof constructor === 'function' ? own(constructor, 'name') : null;
    return typeof name === 'string' && name.length > 0 ? name.slice(0, 128) : null;
}
