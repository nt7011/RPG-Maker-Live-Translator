// Window surface role state.
//
// This module centralizes the small vocabulary used to describe where source
// ink was observed and where translated ink should be rendered. Callers should
// consume these derived booleans instead of re-interpreting staging/copy flags.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'runtime.windowSurfaceRoleState',
        factory() {
            const SOURCE_ROLES = Object.freeze({
                CURRENT: 'window-current-contents',
                STAGING: 'window-staging-contents',
                COPIED_RENDER_TARGET: 'copied-render-target',
                UNKNOWN: 'unknown',
            });

            const RENDER_ROLES = Object.freeze({
                CURRENT: 'window-current-contents',
                COPIED_TARGET: 'copied-target',
                COPIED_RENDER_TARGET: 'copied-render-target',
                UNKNOWN: 'unknown',
            });

            function describeWindowSourceSurface(input = {}) {
                const source = input && typeof input === 'object' ? input : {};
                const liveContents = source.liveContents || source.currentContents || null;
                const observedContents = source.observedContents || null;
                const fallbackContents = source.fallbackContents || source.contents || observedContents || liveContents || null;
                const sourceContentsBitmap = observedContents || fallbackContents;
                const sourceContentsRole = normalizeSourceContentsRole(
                    source.sourceContentsRole,
                    observedContents && liveContents && observedContents !== liveContents
                        ? SOURCE_ROLES.STAGING
                        : SOURCE_ROLES.CURRENT
                );
                return createSurfaceRoleState(Object.assign({}, source, {
                    sourceContentsBitmap,
                    sourceContentsRole,
                }));
            }

            function describeWindowEntrySurface(entry, overrides = {}) {
                const source = Object.assign({}, entry || {}, overrides || {});
                return createSurfaceRoleState({
                    screenState: source.screenState,
                    sourceContentsBitmap: source.sourceContentsBitmap || source.contentsBitmap || null,
                    sourceContentsRole: source.sourceContentsRole,
                    renderSurfaceRole: source.renderSurfaceRole,
                    requiresCopiedTarget: source.requiresCopiedTarget,
                    copiedTargetReplacement: source.copiedTargetReplacement,
                    pendingInvalidation: source.pendingInvalidation,
                });
            }

            function applyWindowEntrySurfaceRole(entry, stateOrInput = {}) {
                if (!entry) return null;
                const state = stateOrInput && stateOrInput.schemaVersion === 1
                    ? stateOrInput
                    : createSurfaceRoleState(stateOrInput);
                if (state.sourceContentsBitmap) entry.sourceContentsBitmap = state.sourceContentsBitmap;
                entry.sourceContentsRole = state.sourceContentsRole;
                entry.renderSurfaceRole = state.renderSurfaceRole;
                entry.requiresCopiedTarget = state.requiresCopiedTarget;
                entry.surfaceRoleState = state;
                return state;
            }

            function createSurfaceRoleState(input = {}) {
                const source = input && typeof input === 'object' ? input : {};
                const sourceContentsRole = normalizeSourceContentsRole(source.sourceContentsRole);
                const requiresCopiedTarget = source.requiresCopiedTarget === true
                    || sourceContentsRole === SOURCE_ROLES.STAGING;
                const copiedTargetReplacement = source.copiedTargetReplacement === true;
                const renderSurfaceRole = normalizeRenderSurfaceRole(
                    source.renderSurfaceRole,
                    requiresCopiedTarget || copiedTargetReplacement
                        ? RENDER_ROLES.COPIED_TARGET
                        : (sourceContentsRole === SOURCE_ROLES.COPIED_RENDER_TARGET
                            ? RENDER_ROLES.COPIED_RENDER_TARGET
                            : RENDER_ROLES.CURRENT)
                );
                const canReplayCopiedTargets = requiresCopiedTarget
                    || copiedTargetReplacement
                    || sourceContentsRole === SOURCE_ROLES.COPIED_RENDER_TARGET
                    || renderSurfaceRole === RENDER_ROLES.COPIED_TARGET;
                const canUseSourceInkForGeometry = sourceContentsRole === SOURCE_ROLES.CURRENT
                    || sourceContentsRole === SOURCE_ROLES.COPIED_RENDER_TARGET;
                return Object.freeze({
                    schemaVersion: 1,
                    screenState: normalizeScreenState(source.screenState),
                    sourceContentsBitmap: source.sourceContentsBitmap || null,
                    sourceContentsRole,
                    renderSurfaceRole,
                    requiresCopiedTarget,
                    copiedTargetReplacement,
                    pendingInvalidation: source.pendingInvalidation === true,
                    canReplayCopiedTargets,
                    canUseSourceInkForGeometry,
                    sourceInkAuthoritative: canUseSourceInkForGeometry && !requiresCopiedTarget,
                });
            }

            function isCopiedStagingEntry(entry) {
                const state = describeWindowEntrySurface(entry);
                return state.requiresCopiedTarget === true
                    || state.sourceContentsRole === SOURCE_ROLES.STAGING;
            }

            function isCopiedSourceEntry(entry, options = {}) {
                const state = describeWindowEntrySurface(entry, options || {});
                return state.canReplayCopiedTargets === true;
            }

            function isLiveCurrentContentsEntry(entry) {
                const state = describeWindowEntrySurface(entry);
                return state.requiresCopiedTarget !== true
                    && state.sourceContentsRole === SOURCE_ROLES.CURRENT;
            }

            function normalizeSourceContentsRole(role, fallback = SOURCE_ROLES.UNKNOWN) {
                const value = String(role || fallback || '').trim();
                if (value === 'window-contents') return SOURCE_ROLES.CURRENT;
                if (value === SOURCE_ROLES.CURRENT
                    || value === SOURCE_ROLES.STAGING
                    || value === SOURCE_ROLES.COPIED_RENDER_TARGET) {
                    return value;
                }
                return SOURCE_ROLES.UNKNOWN;
            }

            function normalizeRenderSurfaceRole(role, fallback = RENDER_ROLES.UNKNOWN) {
                const value = String(role || fallback || '').trim();
                if (value === RENDER_ROLES.CURRENT
                    || value === RENDER_ROLES.COPIED_TARGET
                    || value === RENDER_ROLES.COPIED_RENDER_TARGET) {
                    return value;
                }
                return RENDER_ROLES.UNKNOWN;
            }

            function normalizeScreenState(value) {
                const state = String(value || '').trim();
                return state || 'unknown';
            }

            return {
                SOURCE_ROLES,
                RENDER_ROLES,
                describeWindowSourceSurface,
                describeWindowEntrySurface,
                applyWindowEntrySurfaceRole,
                isCopiedStagingEntry,
                isCopiedSourceEntry,
                isLiveCurrentContentsEntry,
            };
        },
    });
})();
