import type { BitmapDrawRef, NativeCapture, NativeCaptureHost, NativeMethod, SemanticAdapter, } from '../semantic-adapters/contract.js';
import { intersectSemanticAreas, type createBitmapSemanticClues } from '../stores/bitmap-semantic-clues.js';
import type { BitmapTextCommand } from './bitmap/bitmap-command-observer.js';
import { normalizedDrawTextSource } from './bitmap/text-command.js';
import { locateProperty, type OwnedHookSpec } from './owned-hook-installer.js';
import { BITMAP_LIMITS } from '../stores/bitmap-limits.js';
import type { BitmapSemanticDiagnostics } from '../stores/bitmap-semantic-diagnostics.js';
import type { ForesightPositionCapture } from '../foresight/position.js';
import { sameTextIgnoringWhitespace } from '../stores/styled-text.js';
import { permitsSemanticMethod, semanticMethodTargets, semanticNativeTargets, spriteInitializationHook, } from './semantic-native-targets.js';
function observingMethod(wrap: (native: NativeMethod) => NativeMethod, observing: () => boolean) {
    return (native: NativeMethod, enabled: () => boolean): NativeMethod => {
        const captured = wrap(native);
        return function (this: unknown, ...args: unknown[]) {
            return Reflect.apply(enabled() && observing() ? captured : native, this, args);
        };
    };
}
function methodAvailability(target: object, key: string): 'missing' | 'hookable' | 'unhookable' {
    const located = locateProperty(target, key);
    if (located === null)
        return 'missing';
    return typeof located.descriptor.value === 'function' &&
        (located.owner === target
            ? located.descriptor.configurable === true || located.descriptor.writable === true
            : Object.isExtensible(target))
        ? 'hookable'
        : 'unhookable';
}
export function createSemanticTextObserver(options: {
    readonly scope: object;
    readonly adapters: readonly SemanticAdapter[];
    readonly clues: ReturnType<typeof createBitmapSemanticClues>;
    readonly reportFailure: (error: unknown) => void;
    readonly diagnostics?: BitmapSemanticDiagnostics;
    readonly messageOrigin?: ForesightPositionCapture;
}) {
    const { clues } = options;
    const hooks: OwnedHookSpec[] = [];
    const captures: NativeCapture[] = [];
    const families = new Set(options.adapters.map((adapter) => adapter.family));
    function captureFailed(error: unknown): void {
        clues.disable();
        try {
            options.reportFailure(error);
        }
        catch {
        }
    }
    let targets;
    try {
        targets = semanticNativeTargets(options.scope, families);
    }
    catch (error) {
        captureFailed(error);
        return {
            hooks,
            capture(): void {
            },
        };
    }
    const registered = new Set<string>();
    let captureUnhookableMethods = 0;
    const hookDiagnostics: {
        name: string;
        hookable: boolean;
    }[] | null = options.diagnostics === undefined ? null : [];
    const host: NativeCaptureHost = {
        roots: Object.freeze({
            base: targets.base.root,
            message: targets.message.root,
            selectable: targets.selectable.root,
            help: targets.help.root,
            sprite: targets.sprite.root,
        }),
        accepts: (family) => families.has(family) || (family === 'game-message' && families.has('window')),
        maxDraws: BITMAP_LIMITS.evidence,
        enabled: clues.enabled,
        normalize: normalizedDrawTextSource,
        matches: sameTextIgnoringWhitespace,
        observeSource: (...args) => {
            const token = clues.observeSource(...args);
            if (token !== null)
                options.messageOrigin?.observeSource(args[0], token, args[2]);
            return token;
        },
        observeSourceChange: (...args) => {
            clues.observeSourceChange(...args);
        },
        observeFailure: (source) => {
            clues.invalidateSource(source);
        },
        observeDraw: (...args) => {
            clues.observeDraw(...args);
        },
        safely(action) {
            try {
                action();
            }
            catch (error) {
                captureFailed(error);
            }
        },
        method(family, key, wrap) {
            if (!permitsSemanticMethod(family, key))
                throw new Error('Semantic capture requested an undeclared native method');
            const operation = `${family}.${key}`;
            if (registered.has(operation))
                throw new Error('Semantic capture requested a duplicate native method');
            registered.add(operation);
            const origin = family === 'message' && key === 'startMessage' ? options.messageOrigin : undefined;
            const observed = observingMethod(origin === undefined ? wrap : (native) => origin.wrapMessage(wrap(native)), clues.enabled);
            if (family === 'sprite') {
                const root = targets.sprite.root;
                if (root === null)
                    return;
                const availability = methodAvailability(root, 'initialize');
                const hookable = availability === 'hookable';
                if (availability === 'unhookable')
                    captureUnhookableMethods++;
                hookDiagnostics?.push({ name: 'Sprite.initialize', hookable });
                if (hookable)
                    hooks.push(spriteInitializationHook(root, observed, clues.enabled, options.reportFailure));
                return;
            }
            for (const target of semanticMethodTargets(targets, family, key)) {
                const availability = methodAvailability(target, key);
                const hookable = availability === 'hookable';
                if (availability === 'unhookable')
                    captureUnhookableMethods++;
                if (options.diagnostics !== undefined) {
                    const constructor: unknown = Object.getOwnPropertyDescriptor(target, 'constructor')?.value;
                    const name: unknown = typeof constructor === 'function'
                        ? Object.getOwnPropertyDescriptor(constructor, 'name')?.value
                        : null;
                    hookDiagnostics?.push({
                        name: typeof name === 'string' && name ? `${name.slice(0, 128)}.${key}` : key,
                        hookable,
                    });
                }
                if (hookable)
                    hooks.push({ kind: 'method', target, key, wrap: observed });
            }
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
        host.safely(() => {
            const firstHook = hooks.length;
            captureUnhookableMethods = 0;
            if (hookDiagnostics !== null)
                hookDiagnostics.length = 0;
            const capture = factory(host);
            const admitted = capture.allocation === undefined || captureUnhookableMethods === 0;
            if (!admitted) {
                hooks.length = firstHook;
            }
            else
                captures.push(capture);
            for (const diagnostic of hookDiagnostics ?? [])
                options.diagnostics?.hook(diagnostic.name, admitted && diagnostic.hookable);
        });
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
                        placement: { ...command.layout.placement },
                        alignment: command.layout.alignment,
                    }, draw);
            });
        },
    };
}
