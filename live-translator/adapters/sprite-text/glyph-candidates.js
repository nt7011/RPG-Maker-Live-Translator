// Sprite text adapter support: glyph candidates.
// Keeps Sprite-owned bitmap text responsibilities small enough to audit in isolation.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before adapters/sprite-text/glyph-candidates.js.');
    }

    function createController(scope = {}) {
        const callScope = (name) => (...args) => scope[name](...args);
        const {
            bucketCount,
            createOrUpdateParentRun,
            finiteNumber,
            getParentRunMap,
            getSpriteObservationStatus,
            glyphBounds,
            hasRenderedTranslation,
            isActiveParentRunSlot,
            observeRunWhenVisibleOrActive,
            rectCenterY,
            rectFromDimensions,
            removeParentRun,
            renderParentRunOverlay,
            requestRunTranslation,
            textUnitCount,
            updateRunVisibility,
            verticalOverlapAmount,
        } = Object.fromEntries([
            'bucketCount',
            'createOrUpdateParentRun',
            'finiteNumber',
            'getParentRunMap',
            'getSpriteObservationStatus',
            'glyphBounds',
            'hasRenderedTranslation',
            'isActiveParentRunSlot',
            'observeRunWhenVisibleOrActive',
            'rectCenterY',
            'rectFromDimensions',
            'removeParentRun',
            'renderParentRunOverlay',
            'requestRunTranslation',
            'textUnitCount',
            'updateRunVisibility',
            'verticalOverlapAmount',
        ].map((name) => [name, callScope(name)]));

        /**
         * Create a parent-run candidate from a single-glyph sprite entry.
         */
        function createGlyphCandidate(spriteState, entry) {
            if (!spriteState || !entry || !entry.group || !spriteState.sprite || !spriteState.bitmap) return null;
            const group = entry.group;
            const width = Math.max(1, group.bounds.x2 - group.bounds.x1);
            const height = Math.max(1, group.bounds.y2 - group.bounds.y1);
            const candidate = {
                sprite: spriteState.sprite,
                spriteState,
                entry,
                rawText: entry.rawText,
                trimmedText: entry.trimmedText,
                drawState: group.drawState,
                fontSignature: group.fontSignature,
                x: 0,
                y: 0,
                width,
                height,
                bounds: rectFromDimensions(0, 0, width, height),
                lineHeight: group.drawParams.lineHeight,
            };
            return refreshGlyphCandidateLayout(candidate) ? candidate : null;
        }
        
        /**
         * Refresh one glyph candidate in place so animated runs avoid per-frame allocation.
         */
        function refreshGlyphCandidateLayout(candidate) {
            if (!candidate || !candidate.spriteState || !candidate.entry || !candidate.entry.group) return false;
            const spriteState = candidate.spriteState;
            const sprite = spriteState.sprite;
            const bitmap = spriteState.bitmap;
            const group = candidate.entry.group;
            if (!sprite || sprite._destroyed || !bitmap || !group || !group.bounds) return false;
            const anchorX = sprite.anchor && Number.isFinite(Number(sprite.anchor.x)) ? Number(sprite.anchor.x) : 0;
            const anchorY = sprite.anchor && Number.isFinite(Number(sprite.anchor.y)) ? Number(sprite.anchor.y) : 0;
            const bitmapWidth = finiteNumber(bitmap.width, 0);
            const bitmapHeight = finiteNumber(bitmap.height, 0);
            const x = finiteNumber(sprite.x, 0) - anchorX * bitmapWidth + group.bounds.x1;
            const y = finiteNumber(sprite.y, 0) - anchorY * bitmapHeight + group.bounds.y1;
            const width = Math.max(1, group.bounds.x2 - group.bounds.x1);
            const height = Math.max(1, group.bounds.y2 - group.bounds.y1);
            candidate.sprite = sprite;
            candidate.rawText = candidate.entry.rawText;
            candidate.trimmedText = candidate.entry.trimmedText;
            candidate.drawState = group.drawState;
            candidate.fontSignature = group.fontSignature;
            candidate.x = x;
            candidate.y = y;
            candidate.width = width;
            candidate.height = height;
            candidate.lineHeight = group.drawParams.lineHeight;
            const bounds = candidate.bounds || {};
            bounds.x1 = x;
            bounds.y1 = y;
            bounds.x2 = x + width;
            bounds.y2 = y + height;
            candidate.bounds = bounds;
            return true;
        }
        
        /**
         * Collect single-glyph candidates from a parent container.
         */
        function collectGlyphCandidates(parent) {
            const children = parent && Array.isArray(parent.children) ? parent.children : [];
            const candidates = [];
            children.forEach((child, index) => {
                if (!child || child._destroyed || child._trSpriteTextObserverBypass) return;
                const state = scope.spriteStates.get(child);
                const candidate = state && state.singleGlyphCandidate ? createGlyphCandidate(state, state.singleGlyphCandidate.entry) : null;
                if (!candidate || textUnitCount(candidate.trimmedText) !== 1) return;
                candidate.childIndex = index;
                candidates.push(candidate);
            });
            return candidates;
        }
        
        /**
         * Process parent-level single-glyph runs.
         */
        function processParentGlyphRuns(parent) {
            if (!parent || parent._destroyed) return;
            const candidates = collectGlyphCandidates(parent);
            if (candidates.length) {
                scope.perf.count('spriteText.parentRun.candidates', candidates.length);
                scope.perf.top('spriteText.parentRun.candidateBucket', bucketCount(candidates.length));
            }
            const groups = buildGlyphGroups(candidates);
            if (groups.length) {
                scope.perf.count('spriteText.parentRun.groups', groups.length);
                scope.perf.top('spriteText.parentRun.groupBucket', bucketCount(groups.length));
                groups.forEach((group) => {
                    scope.perf.count('spriteText.parentRun.groupGlyphs', Array.isArray(group) ? group.length : 0);
                    scope.perf.top('spriteText.parentRun.groupGlyphBucket', bucketCount(Array.isArray(group) ? group.length : 0));
                });
            }
            const runMap = getParentRunMap(parent);
            const nextKeys = new Set();
            const processed = [];
            groups.forEach((group) => {
                const run = createOrUpdateParentRun(parent, group, runMap);
                if (!run) return;
                nextKeys.add(run.key);
                processed.push(run);
            });
            processed.forEach((run) => {
                if (!run || run.stale || !isActiveParentRunSlot(run)) return;
                observeRunWhenVisibleOrActive(run, getSpriteObservationStatus(run, 'detected'));
                updateRunVisibility(run);
                requestRunTranslation(run);
                if (hasRenderedTranslation(run)) renderParentRunOverlay(run, 'frame');
            });
            Array.from(runMap.entries()).forEach(([key, run]) => {
                if (!nextKeys.has(key)) {
                    removeParentRun(run, 'not-seen');
                    runMap.delete(key);
                }
            });
        }
        
        /**
         * Build glyph groups using child order first, then spatial lines.
         */
        function buildGlyphGroups(candidates) {
            const valid = (Array.isArray(candidates) ? candidates : [])
                .filter((candidate) => candidate && candidate.trimmedText && textUnitCount(candidate.trimmedText) === 1);
            if (valid.length < 2) return [];
        
            const groups = [];
            const used = new Set();
            buildGlyphGroupsByChildOrder(valid).forEach((group) => {
                groups.push(group);
                group.forEach((item) => used.add(item));
            });
            buildGlyphGroupsBySpatialLines(valid.filter((candidate) => !used.has(candidate))).forEach((group) => groups.push(group));
            return groups;
        }
        
        /**
         * Group glyphs by display-list order.
         */
        function buildGlyphGroupsByChildOrder(candidates) {
            return splitGlyphSequence(candidates, scope.GLYPH_VERTICAL_RATIO);
        }
        
        /**
         * Group remaining glyphs by spatial text lines.
         */
        function buildGlyphGroupsBySpatialLines(candidates) {
            const lines = [];
            candidates
                .slice()
                .sort((a, b) => (a.y !== b.y ? a.y - b.y : a.x - b.x))
                .forEach((candidate) => {
                    let bestLine = null;
                    let bestDistance = Infinity;
                    lines.forEach((line) => {
                        if (line.fontSignature !== candidate.fontSignature || !line.items.length) return;
                        const reference = line.items[0];
                        if (!glyphsVerticallyCompatible(reference, candidate, scope.GLYPH_SPATIAL_VERTICAL_RATIO)) return;
                        const distance = Math.abs(rectCenterY(glyphBounds(reference)) - rectCenterY(glyphBounds(candidate)));
                        if (distance < bestDistance) {
                            bestLine = line;
                            bestDistance = distance;
                        }
                    });
                    if (!bestLine) {
                        bestLine = { fontSignature: candidate.fontSignature, items: [] };
                        lines.push(bestLine);
                    }
                    bestLine.items.push(candidate);
                });
        
            const groups = [];
            lines.forEach((line) => {
                const sorted = line.items.slice().sort((a, b) => (a.x !== b.x ? a.x - b.x : finiteNumber(a.childIndex, 0) - finiteNumber(b.childIndex, 0)));
                splitGlyphSequence(sorted, scope.GLYPH_SPATIAL_VERTICAL_RATIO).forEach((group) => groups.push(group));
            });
            return groups;
        }
        
        /**
         * Split a glyph sequence into compatible text runs.
         */
        function splitGlyphSequence(items, verticalRatio) {
            const groups = [];
            let current = [];
            let last = null;
            const push = () => {
                if (current.length >= 2) groups.push(current);
                current = [];
            };
            items.forEach((item) => {
                if (!last || canContinueGlyphRun(last, item, verticalRatio)) current.push(item);
                else {
                    push();
                    current = [item];
                }
                last = item;
            });
            push();
            return groups;
        }
        
        /**
         * Decide whether one glyph can continue the previous glyph run.
         */
        function canContinueGlyphRun(last, item, verticalRatio) {
            if (!last || !item) return false;
            if (item.fontSignature !== last.fontSignature) return false;
            const lineHeight = Math.max(1, Number(item.lineHeight || last.lineHeight || item.height || last.height) || 24);
            const gapLimit = Math.max(scope.GAP_MIN, Math.ceil(lineHeight * scope.GAP_RATIO));
            const backtrackLimit = Math.max(2, Math.ceil(lineHeight * scope.GLYPH_BACKTRACK_RATIO));
            const gap = item.x - (last.x + last.width);
            if (gap > gapLimit) return false;
            if (item.x < last.x - backtrackLimit) return false;
            return glyphsVerticallyCompatible(last, item, verticalRatio);
        }
        
        /**
         * Return true when glyphs occupy compatible vertical space.
         */
        function glyphsVerticallyCompatible(a, b, ratio) {
            const aBounds = glyphBounds(a);
            const bBounds = glyphBounds(b);
            if (verticalOverlapAmount(aBounds, bBounds) > 0) return true;
            const lineHeight = Math.max(1, Number(a.lineHeight || b.lineHeight || a.height || b.height) || 24);
            return Math.abs(rectCenterY(aBounds) - rectCenterY(bBounds)) <= Math.max(4, Math.ceil(lineHeight * ratio));
        }

        return { createGlyphCandidate, refreshGlyphCandidateLayout, collectGlyphCandidates, processParentGlyphRuns, buildGlyphGroups, buildGlyphGroupsByChildOrder, buildGlyphGroupsBySpatialLines, splitGlyphSequence, canContinueGlyphRun, glyphsVerticallyCompatible };
    }

    defineRuntimeModule('adapters.spriteText.glyphcandidates', { createController });
})();
