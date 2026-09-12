import { resolveSpeedupMultiplier } from '../../configuration/speedup.js';
import { locateProperty, type OwnedHookSpec } from '../../observer-hooks/owned-hook-installer.js';
type NativeMethod = (this: unknown, ...args: unknown[]) => unknown;
interface NativeScene {
    isStarted(): boolean;
}
interface NativeSceneManager {
    readonly _scene: NativeScene | null;
    readonly _stopped?: boolean;
    isSceneChanging(): boolean;
    isCurrentSceneStarted(): boolean;
    isGameActive(): boolean;
    updateInputData(): void;
    changeScene(): void;
}
function own(value: unknown, key: string): unknown {
    if ((typeof value !== 'object' || value === null) && typeof value !== 'function')
        return undefined;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor !== undefined && 'value' in descriptor ? (descriptor.value as unknown) : undefined;
}
function method(target: unknown, key: string): NativeMethod | undefined {
    if ((typeof target !== 'object' || target === null) && typeof target !== 'function')
        return undefined;
    const value: unknown = locateProperty(target, key)?.descriptor.value;
    return typeof value === 'function' ? (value as NativeMethod) : undefined;
}
export function createSpeedupHooks(scope: object, settings: unknown): readonly OwnedHookSpec[] {
    const hacks = own(settings, 'hacks');
    if (own(hacks, 'keepFastForwardAvailable') !== true)
        return [];
    const multiplier = resolveSpeedupMultiplier(own(hacks, 'fastForwardMultiplier'));
    const engine = own(own(scope, 'Utils'), 'RPGMAKER_NAME');
    if (engine !== 'MV' && engine !== 'MZ')
        return [];
    const managerCandidate = own(scope, 'SceneManager') as NativeSceneManager | undefined;
    const input = own(scope, 'Input');
    const touch = own(scope, 'TouchInput');
    const keyHeld = method(input, 'isLongPressed');
    const touchHeld = method(touch, 'isLongPressed');
    const tickKey = engine === 'MZ' ? 'updateMain' : 'updateScene';
    const required = [tickKey, 'isSceneChanging', 'stop'];
    if (engine === 'MV')
        required.push('updateInputData', 'changeScene', 'isCurrentSceneStarted');
    else
        required.push('isGameActive');
    if (!managerCandidate || !keyHeld || !touchHeld || required.some((key) => !method(managerCandidate, key)))
        return [];
    const manager = managerCandidate;
    const readKeyHeld = keyHeld;
    const readTouchHeld = touchHeld;
    let running = false;
    let accelerating = false;
    let stopped = false;
    let credit = 0;
    let creditScene: WeakRef<NativeScene> | undefined;
    function held(): boolean {
        return Reflect.apply(readKeyHeld, input, ['ok']) === true || Reflect.apply(readTouchHeld, touch, []) === true;
    }
    function sceneRunning(scene: NativeScene | null): boolean {
        if (!scene || manager.isSceneChanging())
            return false;
        return engine === 'MV'
            ? !manager._stopped && manager.isCurrentSceneStarted()
            : scene.isStarted() && manager.isGameActive();
    }
    function canContinue(scene: NativeScene | null): boolean {
        return !stopped && manager._scene === scene && sceneRunning(scene) && held();
    }
    const hooks: OwnedHookSpec[] = [
        {
            kind: 'method',
            target: manager,
            key: tickKey,
            wrap: (native, enabled) => function (this: unknown, ...args: unknown[]) {
                if (!enabled() || this !== manager || running)
                    return Reflect.apply(native, this, args);
                const scene = manager._scene;
                running = true;
                stopped = false;
                try {
                    accelerating = sceneRunning(scene) && held();
                    if (!accelerating || creditScene?.deref() !== scene)
                        credit = 0;
                    if (creditScene?.deref() !== scene)
                        creditScene = scene ? new WeakRef(scene) : undefined;
                    const result = Reflect.apply(native, this, args);
                    if (!accelerating)
                        return result;
                    credit += multiplier - 1;
                    while (credit >= 1 && enabled() && canContinue(scene)) {
                        credit -= 1;
                        if (engine === 'MV') {
                            manager.updateInputData();
                            manager.changeScene();
                            if (!enabled() || !canContinue(scene))
                                break;
                        }
                        Reflect.apply(native, this, args);
                    }
                    if (!enabled() || !canContinue(scene))
                        credit = 0;
                    return result;
                }
                catch (error) {
                    credit = 0;
                    throw error;
                }
                finally {
                    accelerating = false;
                    running = false;
                }
            },
        },
        {
            kind: 'method',
            target: manager,
            key: 'stop',
            wrap: (native, enabled) => function (this: unknown, ...args: unknown[]) {
                if (enabled() && this === manager) {
                    stopped = true;
                    credit = 0;
                }
                return Reflect.apply(native, this, args);
            },
        },
    ];
    const fastForwardTargets: object[] = [];
    for (const className of ['Scene_Map', 'Window_BattleLog', 'Window_ScrollText']) {
        const target = own(own(scope, className), 'prototype');
        if (typeof target !== 'object' || target === null || !method(target, 'isFastForward'))
            continue;
        if (fastForwardTargets.includes(target))
            continue;
        let position = fastForwardTargets.length;
        for (let ancestor = Object.getPrototypeOf(target) as object | null; ancestor !== null; ancestor = Object.getPrototypeOf(ancestor) as object | null) {
            const index = fastForwardTargets.indexOf(ancestor);
            if (index >= 0)
                position = Math.min(position, index);
        }
        fastForwardTargets.splice(position, 0, target);
    }
    for (const target of fastForwardTargets) {
        hooks.push({
            kind: 'method',
            target,
            key: 'isFastForward',
            wrap: (native, enabled) => function (this: unknown, ...args: unknown[]) {
                return enabled() && accelerating ? false : Reflect.apply(native, this, args);
            },
        });
    }
    return hooks;
}
