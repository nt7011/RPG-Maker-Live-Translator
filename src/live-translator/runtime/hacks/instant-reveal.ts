import { locateProperty, type OwnedHookSpec } from '../../observer-hooks/owned-hook-installer.js';
function own(value: unknown, key: string): unknown {
    if ((typeof value !== 'object' || value === null) && typeof value !== 'function')
        return undefined;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor !== undefined && 'value' in descriptor ? (descriptor.value as unknown) : undefined;
}
export function createInstantRevealHooks(scope: object, settings: unknown): readonly OwnedHookSpec[] {
    if (own(own(settings, 'hacks'), 'instantReveal') !== true)
        return [];
    const target = own(own(scope, 'Window_Message'), 'prototype');
    if (typeof target !== 'object' || target === null)
        return [];
    if (typeof locateProperty(target, 'updateShowFast')?.descriptor.value !== 'function')
        return [];
    return [
        {
            kind: 'method',
            target,
            key: 'updateShowFast',
            wrap: (native, enabled) => function (this: unknown, ...args: unknown[]) {
                const result = Reflect.apply(native, this, args);
                if (enabled())
                    (this as {
                        _showFast: boolean;
                    })._showFast = true;
                return result;
            },
        },
    ];
}
