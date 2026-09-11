import type { BitmapDrawRef, NativeCapture, NativeCaptureHost, SemanticAdapter, } from '../semantic-adapters/contract.js';
import { intersectSemanticAreas, type createBitmapSemanticClues } from '../stores/bitmap-semantic-clues.js';
import type { BitmapTextCommand } from './bitmap/bitmap-command-observer.js';
import { normalizedDrawTextSource } from './bitmap/text-command.js';
import { locateProperty, type OwnedHookSpec } from './owned-hook-installer.js';
import { BITMAP_LIMITS } from '../stores/bitmap-limits.js';
import type { BitmapSemanticDiagnostics } from '../stores/bitmap-semantic-diagnostics.js';
import { sameTextIgnoringWhitespace } from '../stores/styled-text.js';
export function createSemanticTextObserver(options: {
    readonly scope: object;
    readonly adapters: readonly SemanticAdapter[];
    readonly clues: ReturnType<typeof createBitmapSemanticClues>;
    readonly reportFailure: (error: unknown) => void;
    readonly diagnostics?: BitmapSemanticDiagnostics;
}) {
    const { clues } = options;
    const hooks: OwnedHookSpec[] = [];
    const captures: NativeCapture[] = [];
    const host: NativeCaptureHost = {
        scope: options.scope,
        maxDraws: BITMAP_LIMITS.evidence,
        enabled: clues.enabled,
        normalize: normalizedDrawTextSource,
        matches: sameTextIgnoringWhitespace,
        observeSource: (...args) => clues.observeSource(...args),
        observeSourceChange: (...args) => {
            clues.observeSourceChange(...args);
        },
        observeDraw: (...args) => {
            clues.observeDraw(...args);
        },
        safely(action) {
            try {
                action();
            }
            catch (error) {
                clues.disable();
                try {
                    options.reportFailure(error);
                }
                catch {
                }
            }
        },
        method(target, key, wrap) {
            const present = target !== null && typeof locateProperty(target, key)?.descriptor.value === 'function';
            if (options.diagnostics !== undefined) {
                const constructor: unknown = target === null ? null : Object.getOwnPropertyDescriptor(target, 'constructor')?.value;
                const name: unknown = typeof constructor === 'function'
                    ? Object.getOwnPropertyDescriptor(constructor, 'name')?.value
                    : null;
                options.diagnostics.hook(typeof name === 'string' && name ? `${name.slice(0, 128)}.${key}` : key, present);
            }
            if (!present)
                return;
            hooks.push({
                kind: 'method',
                target,
                key,
                wrap: (native, enabled) => {
                    const captured = wrap(native);
                    return function (this: unknown, ...args: unknown[]) {
                        return Reflect.apply(enabled() && clues.enabled() ? captured : native, this, args);
                    };
                },
            });
        },
        allocation(context, rejected) {
            const reasons: string[] | null = rejected === undefined ? null : [];
            const areas = captures.flatMap((capture) => {
                const area = capture.allocation?.(context, reasons === null
                    ? undefined
                    : (reason) => {
                        reasons.push(reason);
                    });
                return area == null ? [] : [area];
            });
            const area = intersectSemanticAreas(areas);
            if (area === null)
                rejected?.(areas.length > 0
                    ? 'native-allocations-do-not-intersect'
                    : reasons !== null && reasons.length > 0
                        ? reasons.join('; ')
                        : 'no-allocation-capture');
            return area;
        },
        ...(options.diagnostics === undefined ? {} : { diagnostic: (...args) => options.diagnostics?.draw(...args) }),
    };
    for (const factory of new Set(options.adapters.flatMap((adapter) => adapter.captures))) {
        if (!clues.enabled())
            break;
        host.safely(() => captures.push(factory(host)));
    }
    return {
        hooks,
        capture(command: BitmapTextCommand, draw: BitmapDrawRef): void {
            if (!clues.enabled())
                return;
            host.safely(() => {
                for (const capture of captures)
                    capture.capture?.({
                        bitmap: command.bitmap,
                        source: command.source,
                        text: command.text,
                        width: command.source.width,
                        height: command.source.height,
                    }, draw);
            });
        },
    };
}
