export type LifecycleReason = 'contents-replaced' | 'not-current-scene' | 'scene-terminated' | 'window-destroyed' | 'window-detached' | 'window-offscreen' | 'window-stale' | 'window-unregistered' | 'window-visible';
export interface LifecycleReasons {
    readonly CONTENTS_REPLACED: 'contents-replaced';
    readonly NOT_CURRENT_SCENE: 'not-current-scene';
    readonly SCENE_TERMINATED: 'scene-terminated';
    readonly WINDOW_DESTROYED: 'window-destroyed';
    readonly WINDOW_DETACHED: 'window-detached';
    readonly WINDOW_OFFSCREEN: 'window-offscreen';
    readonly WINDOW_STALE: 'window-stale';
    readonly WINDOW_UNREGISTERED: 'window-unregistered';
    readonly WINDOW_VISIBLE: 'window-visible';
}
export interface LifecycleReasonsModule {
    readonly reasons: LifecycleReasons;
}
export function createLifecycleReasonsModule(): LifecycleReasonsModule {
    const reasons: LifecycleReasons = Object.freeze({
        CONTENTS_REPLACED: 'contents-replaced',
        NOT_CURRENT_SCENE: 'not-current-scene',
        SCENE_TERMINATED: 'scene-terminated',
        WINDOW_DESTROYED: 'window-destroyed',
        WINDOW_DETACHED: 'window-detached',
        WINDOW_OFFSCREEN: 'window-offscreen',
        WINDOW_STALE: 'window-stale',
        WINDOW_UNREGISTERED: 'window-unregistered',
        WINDOW_VISIBLE: 'window-visible',
    });
    return { reasons };
}
