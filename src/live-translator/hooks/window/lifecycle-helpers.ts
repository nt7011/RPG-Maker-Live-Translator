import { hasHookInChain } from '../../runtime/hook-wrapper.js';
export interface WindowLifecycleHelpersModule {
    readonly hasHookInChain: typeof hasHookInChain;
}
export function createWindowLifecycleHelpersModule(): WindowLifecycleHelpersModule {
    return {
        hasHookInChain,
    };
}
