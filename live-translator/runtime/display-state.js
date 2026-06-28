// Shared display-tree and scene attachment helpers.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'runtime.displayState',
        factory(_dependencies, { scope }) {
            function createDisplayStateService(displayScope = scope) {
                const runtimeGlobal = displayScope || scope;

                function resolveActiveScene() {
                    try {
                        const sceneManager = runtimeGlobal.SceneManager || null;
                        return sceneManager && sceneManager._scene ? sceneManager._scene : null;
                    } catch (_) {
                        return null;
                    }
                }

                function isSceneRootCandidate(value) {
                    if (!value || typeof value !== 'object') return false;
                    try {
                        const SceneBase = runtimeGlobal.Scene_Base || null;
                        if (SceneBase && value instanceof SceneBase) return true;
                    } catch (_) {}
                    try {
                        const ctor = value.constructor || null;
                        const name = ctor && typeof ctor.name === 'string' ? ctor.name : '';
                        if (/^Scene_/.test(name)) return true;
                    } catch (_) {}
                    return false;
                }

                function isDestroyed(value) {
                    return !!(value && (value._destroyed || value.destroyed));
                }

                function isChildInParent(child, parent) {
                    if (!child || !parent || child.parent !== parent) return false;
                    const children = Array.isArray(parent.children) ? parent.children : null;
                    return children ? children.indexOf(child) >= 0 : true;
                }

                function describeDisplayChain(displayObject) {
                    if (!displayObject) {
                        return { state: 'missing', attached: false, root: null, activeScene: resolveActiveScene() };
                    }
                    if (isDestroyed(displayObject)) {
                        return { state: 'destroyed', attached: false, root: displayObject, activeScene: resolveActiveScene() };
                    }

                    let child = displayObject;
                    let parent = displayObject.parent || null;
                    let depth = 0;
                    while (parent && depth < 128) {
                        if (isDestroyed(parent)) {
                            return { state: 'destroyed-parent', attached: false, root: parent, activeScene: resolveActiveScene() };
                        }
                        if (!isChildInParent(child, parent)) {
                            return { state: 'broken-chain', attached: false, root: parent, activeScene: resolveActiveScene() };
                        }
                        child = parent;
                        parent = parent.parent || null;
                        depth += 1;
                    }
                    if (parent && depth >= 128) {
                        return { state: 'chain-too-deep', attached: false, root: child, activeScene: resolveActiveScene() };
                    }

                    const activeScene = resolveActiveScene();
                    const root = child || displayObject;
                    if (activeScene && isSceneRootCandidate(root)) {
                        if (root === activeScene) {
                            return { state: 'active-scene', attached: root !== displayObject, root, activeScene };
                        }
                        return { state: 'inactive-scene', attached: false, root, activeScene };
                    }

                    return {
                        state: root === displayObject ? 'unattached' : 'attached',
                        attached: !!root && root !== displayObject,
                        root,
                        activeScene,
                    };
                }

                function isDisplayObjectAttached(displayObject) {
                    return describeDisplayChain(displayObject).attached === true;
                }

                function describeSceneMembership(displayObject) {
                    const activeScene = resolveActiveScene();
                    if (!activeScene || !displayObject) {
                        return { state: activeScene ? 'missing' : 'no-active-scene', inCurrentScene: true, activeScene, root: null };
                    }
                    let cursor = displayObject;
                    let depth = 0;
                    while (cursor && depth < 128) {
                        if (cursor === activeScene) {
                            return { state: 'active-scene', inCurrentScene: true, activeScene, root: cursor };
                        }
                        if (isSceneRootCandidate(cursor)) {
                            return { state: 'inactive-scene', inCurrentScene: false, activeScene, root: cursor };
                        }
                        cursor = cursor.parent || null;
                        depth += 1;
                    }
                    return { state: 'no-scene-root', inCurrentScene: false, activeScene, root: null };
                }

                function isDisplayObjectInCurrentScene(displayObject) {
                    return describeSceneMembership(displayObject).inCurrentScene !== false;
                }

                return {
                    resolveActiveScene,
                    isSceneRootCandidate,
                    isDestroyed,
                    isChildInParent,
                    describeDisplayChain,
                    isDisplayObjectAttached,
                    describeSceneMembership,
                    isDisplayObjectInCurrentScene,
                };
            }

            return {
                createDisplayStateService,
            };
        },
    });
})();
