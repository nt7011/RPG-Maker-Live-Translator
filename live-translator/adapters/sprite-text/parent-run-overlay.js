// Sprite text adapter support: parent run overlay.
// Documents the parent glyph-run responsibility without growing the facade.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before adapters/sprite-text/parent-run-overlay.js.');
    }

    function createController(scope = {}) {
        const callScope = (name) => (...args) => scope[name](...args);
        const {
            attachOverlayAfterSource,
            copySpriteColorEffects,
            createOverlaySprite,
            drawTextToBitmap,
            ensureParentRunState,
            finiteNumber,
            hasRenderedTranslation,
            hideRunSources,
            isActiveParentRunSlot,
            logOverlayDraw,
            measureTextWidth,
            refreshParentRunRenderable,
            removeParentRun,
            sanitizeVisibleText,
            shouldRenderParentRunOverlay,
            stringify,
            warn,
        } = Object.fromEntries([
            'attachOverlayAfterSource',
            'copySpriteColorEffects',
            'createOverlaySprite',
            'drawTextToBitmap',
            'ensureParentRunState',
            'finiteNumber',
            'hasRenderedTranslation',
            'hideRunSources',
            'isActiveParentRunSlot',
            'logOverlayDraw',
            'measureTextWidth',
            'refreshParentRunRenderable',
            'removeParentRun',
            'sanitizeVisibleText',
            'shouldRenderParentRunOverlay',
            'stringify',
            'warn',
        ].map((name) => [name, callScope(name)]));

        /**
         * Render a translated parent glyph run as a parent-level overlay.
         */
        function renderParentRunOverlay(run, source = 'translation') {
            if (!run || run.stale || !hasRenderedTranslation(run) || !run.parent) return false;
            if (!isActiveParentRunSlot(run)) return false;
            const layout = computeParentRunOverlayLayout(run);
            if (!layout) return false;
        
            let overlay = run.overlaySprite;
            if (!overlay || overlay._destroyed) {
                overlay = createOverlaySprite();
                if (!overlay) return false;
                run.overlaySprite = overlay;
            }
            const signature = createParentRunOverlaySignature(run, layout);
            let bitmap = run.overlayBitmap;
            let redrewBitmap = false;
            if (!bitmap || bitmap._destroyed || run._trOverlaySignature !== signature) {
                try {
                    bitmap = new Bitmap(layout.width, layout.height);
                    bitmap._trSpriteTextOverlayBitmap = true;
                    drawTextToBitmap(bitmap, {
                        drawState: run.drawState,
                        methodName: 'drawText',
                        drawParams: {
                            x: layout.outline,
                            y: 0,
                            maxWidth: Math.max(1, layout.width - layout.outline * 2),
                            lineHeight: layout.height,
                            align: 'left',
                        },
                    }, run.renderedText, { scaleText: true });
                    run.overlayBitmap = bitmap;
                    run._trOverlaySignature = signature;
                    redrewBitmap = true;
                } catch (_) {
                    return false;
                }
            }
            try {
                overlay._trSpriteTextObserverBypass = true;
                overlay._trSpriteTextShouldRender = () => shouldRenderParentRunOverlay(run);
                overlay.bitmap = bitmap;
                overlay.x = layout.x;
                overlay.y = layout.y;
                const reference = run.group && run.group[0] ? run.group[0].sprite : null;
                if (reference) copyRunReferenceVisualState(reference, overlay);
                if (!attachParentRunOverlay(run)) {
                    removeParentRun(run, 'attach-failed');
                    return false;
                }
                const renderable = refreshParentRunRenderable(run);
                overlay.renderable = renderable;
                hideRunSources(run, renderable);
                scope.activeParents.add(run.parent);
                if (redrewBitmap) logOverlayDraw('sprite-run', source, [run]);
                return true;
            } catch (error) {
                warn('[SpriteText] Failed to render glyph-run overlay.', error);
                removeParentRun(run, 'render-error');
                return false;
            }
        }

        /**
         * Compute the bitmap and local placement needed for a parent-run overlay.
         */
        function computeParentRunOverlayLayout(run) {
            if (!run || !run.bounds || !run.renderedText) return null;
            const measured = measureTextWidth(null, sanitizeVisibleText(run.renderedText), 0);
            const outline = run.drawState && Number.isFinite(Number(run.drawState.outlineWidth))
                ? Math.max(2, Number(run.drawState.outlineWidth) + 2)
                : 3;
            const width = Math.max(1, Math.ceil(run.bounds.x2 - run.bounds.x1), measured + outline * 2);
            const height = Math.max(1, Math.ceil(run.bounds.y2 - run.bounds.y1), Math.ceil(run.lineHeight || 24));
            return {
                outline,
                width,
                height,
                x: Math.floor(run.bounds.x1 - outline),
                y: Math.floor(run.bounds.y1),
            };
        }

        /**
         * Describe parent-run overlay content. Movement alone must not redraw text.
         */
        function createParentRunOverlaySignature(run, layout) {
            return [
                'parent-run',
                stringify(run && run.renderedText),
                stringify(run && run.fontSignature),
                stringify(run && run.lineHeight),
                layout ? layout.outline : '',
                layout ? layout.width : '',
                layout ? layout.height : '',
            ].join('|');
        }

        /**
         * Copy visual fields from the first glyph Sprite to a parent-run overlay.
         */
        function copyRunReferenceVisualState(reference, overlay) {
            if (!reference || !overlay) return;
            if (Number.isFinite(Number(reference.opacity))) overlay.opacity = reference.opacity;
            if (Number.isFinite(Number(reference.alpha))) overlay.alpha = reference.alpha;
            if (reference.blendMode !== undefined) overlay.blendMode = reference.blendMode;
            if (reference.tint !== undefined) overlay.tint = reference.tint;
            copySpriteColorEffects(reference, overlay);
            if (Number.isFinite(Number(reference.rotation))) overlay.rotation = reference.rotation;
            if (overlay.scale && reference.scale) {
                overlay.scale.x = Number.isFinite(Number(reference.scale.x)) ? reference.scale.x : overlay.scale.x;
                overlay.scale.y = Number.isFinite(Number(reference.scale.y)) ? reference.scale.y : overlay.scale.y;
            }
            if (overlay.anchor) {
                overlay.anchor.x = 0;
                overlay.anchor.y = 0;
            }
            overlay.visible = reference.visible !== false;
        }

        /**
         * Attach a parent-run overlay outside the source-owned child list when possible.
         */
        function attachParentRunOverlay(run) {
            if (!run || !run.overlaySprite || !run.parent) return false;
            const targetParent = resolveParentRunOverlayParent(run);
            if (!targetParent) return false;
            const overlay = run.overlaySprite;
            if (overlay.parent !== targetParent) {
                if (overlay.parent && typeof overlay.parent.removeChild === 'function') {
                    try { overlay.parent.removeChild(overlay); } catch (_) {}
                }
                if (typeof targetParent.addChild === 'function') {
                    try { targetParent.addChild(overlay); } catch (_) {}
                }
            }
            return overlay.parent === targetParent;
        }

        /**
         * Prefer a neutral sibling carrier so source plugins do not update our overlay as their child.
         */
        function resolveParentRunOverlayParent(run) {
            if (!run || !run.parent) return null;
            const carrier = ensureParentRunOverlayCarrier(run.parent);
            if (carrier && carrier !== run.parent) {
                run.overlayCarrier = carrier;
                return carrier;
            }
            run.overlayCarrier = null;
            return run.parent;
        }

        /**
         * Return the sidecar carrier for one source parent, or the parent itself as a safe fallback.
         */
        function ensureParentRunOverlayCarrier(parent) {
            if (!parent || parent._destroyed) return null;
            if (!parent.parent || parent.parent._destroyed) return parent;
            const state = ensureParentRunState(parent);
            if (!state) return parent;
            let carrier = state.overlayCarrier;
            if (!carrier || carrier._destroyed) {
                carrier = createParentRunOverlayCarrier();
                if (!carrier) return parent;
                state.overlayCarrier = carrier;
            }
            syncParentRunOverlayCarrier(parent, carrier);
            if (!attachOverlayAfterSource(parent, carrier)) return parent;
            return carrier;
        }

        /**
         * Create a source-neutral container for translated run overlays.
         */
        function createParentRunOverlayCarrier() {
            try {
                const carrier = new Sprite();
                carrier._trSpriteTextObserverBypass = true;
                carrier._trSpriteTextOverlayCarrier = true;
                return carrier;
            } catch (_) {
                return null;
            }
        }

        /**
         * Keep the sidecar carrier aligned with the source parent transform.
         */
        function syncParentRunOverlayCarrier(parent, carrier) {
            if (!parent || !carrier || carrier === parent) return false;
            try {
                carrier._trSpriteTextObserverBypass = true;
                carrier.x = finiteNumber(parent.x, 0);
                carrier.y = finiteNumber(parent.y, 0);
                if (Number.isFinite(Number(parent.opacity))) carrier.opacity = parent.opacity;
                if (Number.isFinite(Number(parent.alpha))) carrier.alpha = parent.alpha;
                if (parent.blendMode !== undefined) carrier.blendMode = parent.blendMode;
                if (parent.tint !== undefined) carrier.tint = parent.tint;
                if (Number.isFinite(Number(parent.rotation))) carrier.rotation = parent.rotation;
                if (parent.z !== undefined) carrier.z = parent.z;
                if (parent.zIndex !== undefined) carrier.zIndex = parent.zIndex;
                if (carrier.scale && parent.scale) {
                    carrier.scale.x = Number.isFinite(Number(parent.scale.x)) ? parent.scale.x : carrier.scale.x;
                    carrier.scale.y = Number.isFinite(Number(parent.scale.y)) ? parent.scale.y : carrier.scale.y;
                }
                if (carrier.pivot && parent.pivot) {
                    carrier.pivot.x = Number.isFinite(Number(parent.pivot.x)) ? parent.pivot.x : carrier.pivot.x;
                    carrier.pivot.y = Number.isFinite(Number(parent.pivot.y)) ? parent.pivot.y : carrier.pivot.y;
                }
                carrier.visible = parent.visible !== false;
                carrier.renderable = parent.renderable !== false;
                return true;
            } catch (_) {
                return false;
            }
        }

        /**
         * Remove an unused sidecar carrier from the display list.
         */
        function releaseParentRunOverlayCarrier(parent) {
            const state = parent ? scope.parentRunStates.get(parent) : null;
            const carrier = state && state.overlayCarrier;
            if (!carrier) return;
            if (parentHasLiveRunOverlay(parent)) return;
            if (carrier.parent && typeof carrier.parent.removeChild === 'function') {
                try { carrier.parent.removeChild(carrier); } catch (_) {}
            }
            state.overlayCarrier = null;
        }

        /**
         * Return true when any live run for a parent still owns an overlay.
         */
        function parentHasLiveRunOverlay(parent) {
            const state = parent ? scope.parentRunStates.get(parent) : null;
            if (!state || !state.runs) return false;
            let found = false;
            state.runs.forEach((run) => {
                if (run && !run.stale && run.overlaySprite && run.overlaySprite.parent) found = true;
            });
            return found;
        }

        return { renderParentRunOverlay, computeParentRunOverlayLayout, createParentRunOverlaySignature, copyRunReferenceVisualState, attachParentRunOverlay, resolveParentRunOverlayParent, ensureParentRunOverlayCarrier, createParentRunOverlayCarrier, syncParentRunOverlayCarrier, releaseParentRunOverlayCarrier, parentHasLiveRunOverlay };
    }

    defineRuntimeModule('adapters.spriteText.parentrunoverlay', { createController });
})();
