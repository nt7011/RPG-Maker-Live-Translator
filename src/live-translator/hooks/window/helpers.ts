import type { DisplayStateModule } from '../../runtime/display-state.js';
import type { EntryLifecycleModule } from '../../runtime/entry-lifecycle.js';
import { encodeStableIdentity } from '../../runtime/identity-codec.js';
import type { LifecycleReasonsModule } from '../../runtime/lifecycle-reasons.js';
import { createWindowRegistryHelpers, type WindowRegistryHelpersModule } from './registry-helpers.js';
import { applyBitmapDrawState, captureBitmapDrawState, createWindowTextScaleScope, normalizeTextScalePercent, resolveTextScalePercent, scaleBitmapDrawState, scaleFontSizeValue, } from './text-scale.js';
export type { WindowRegistryHelpersModule } from './registry-helpers.js';
const WINDOW_ENTRY_KEY_IDENTITY_DOMAIN = 'window-text.entry-key';
export interface WindowHelpersModule extends WindowRegistryHelpersModule {
    readonly captureBitmapDrawState: typeof captureBitmapDrawState;
    readonly applyBitmapDrawState: typeof applyBitmapDrawState;
    readonly normalizeTextScalePercent: typeof normalizeTextScalePercent;
    readonly resolveTextScalePercent: typeof resolveTextScalePercent;
    readonly scaleBitmapDrawState: typeof scaleBitmapDrawState;
    readonly scaleFontSizeValue: typeof scaleFontSizeValue;
    readonly createWindowTextScaleScope: typeof createWindowTextScaleScope;
    readonly generateKey: (type: string | number, x: string | number, y: string | number, windowType?: unknown, text?: unknown, slotKey?: unknown) => string;
}
function stringValue(value: unknown): string {
    const converted: unknown = Reflect.apply(String, undefined, [value]);
    if (typeof converted !== 'string')
        throw new TypeError('String conversion did not return text.');
    return converted;
}
function generateKey(type: string | number, x: string | number, y: string | number, windowType: unknown = null, text: unknown = null, slotKey: unknown = null): string {
    void windowType;
    const typeValue = stringValue(type);
    const xValue = stringValue(x);
    const yValue = stringValue(y);
    const slotValue = stringValue(slotKey ?? '').trim();
    const textValue = stringValue(text ?? '').trim();
    const digest = encodeStableIdentity(WINDOW_ENTRY_KEY_IDENTITY_DOMAIN, [
        typeValue,
        xValue,
        yValue,
        slotValue,
        textValue,
    ]);
    return `${typeValue},${xValue},${yValue},${digest}`;
}
export function createWindowHelpersModule(displayStateModule: DisplayStateModule, lifecycleReasonsModule: LifecycleReasonsModule, entryLifecycleModule: EntryLifecycleModule, runtimeScope: unknown): WindowHelpersModule {
    return {
        captureBitmapDrawState,
        applyBitmapDrawState,
        normalizeTextScalePercent,
        resolveTextScalePercent,
        scaleBitmapDrawState,
        scaleFontSizeValue,
        createWindowTextScaleScope,
        generateKey,
        createWindowRegistryHelpers(context: unknown = {}) {
            return createWindowRegistryHelpers(displayStateModule, lifecycleReasonsModule.reasons, entryLifecycleModule, runtimeScope, context);
        },
    };
}
