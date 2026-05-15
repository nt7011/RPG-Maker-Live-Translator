// Foresight tree SVG route rendering.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const parts = globalScope.LiveTranslatorForesightTreeViewerParts || {};
    globalScope.LiveTranslatorForesightTreeViewerParts = parts;

    // SVG connector routes for branch merges and control-flow jumps.
    const { cssToken, finiteNumber, nonEmptyString } = parts.utils;
    const { createSvgElement, findActionCardByScrollKey, finiteMetric, finiteScrollMetric, getActionCards, getElementContentRect, getElementDatasetValue, roundCoordinate } = parts.domUtils;
    
    function drawTreeRoutes(doc, scroll, model) {
            if (!doc || typeof doc.createElementNS !== 'function' || !scroll) return;
            const mergeSpecs = collectMergeRouteSpecs(model && model.nodes);
            const controlFlowSpecs = collectControlFlowRouteSpecs(model && model.nodes);
            if (!mergeSpecs.length && !controlFlowSpecs.length) return;
    
            const overlay = createSvgElement(doc, 'svg');
            overlay.setAttribute('class', 'foresight-merge-overlay');
            overlay.setAttribute('aria-hidden', 'true');
            const width = Math.max(1, finiteScrollMetric(scroll.scrollWidth), finiteScrollMetric(scroll.clientWidth));
            const height = Math.max(1, finiteScrollMetric(scroll.scrollHeight), finiteScrollMetric(scroll.clientHeight));
            overlay.setAttribute('width', String(width));
            overlay.setAttribute('height', String(height));
            overlay.setAttribute('viewBox', `0 0 ${width} ${height}`);
    
            let routeCount = 0;
            mergeSpecs.forEach((spec) => {
                const target = findMergeTargetCard(scroll, spec);
                const targetPoint = target ? getMergeTargetPoint(target, scroll) : null;
                if (!targetPoint) return;
                spec.branchIndices.forEach((branchIndex) => {
                    const lane = findMergeLane(scroll, spec.ownerKey, branchIndex);
                    const startPoint = lane ? getMergeLaneStartPoint(lane, scroll) : null;
                    if (!startPoint) return;
                    appendMergeRoute(doc, overlay, spec, branchIndex, startPoint, targetPoint);
                    routeCount += 1;
                });
            });
            controlFlowSpecs.forEach((spec) => {
                const source = findControlFlowSourceCard(scroll, spec);
                const target = findControlFlowTargetCard(scroll, spec);
                const sourcePoint = source ? getControlFlowSourcePoint(source, scroll, spec) : null;
                const targetPoint = target ? getControlFlowTargetPoint(target, scroll, spec) : null;
                if (!sourcePoint || !targetPoint) return;
                appendControlFlowRoute(doc, overlay, spec, sourcePoint, targetPoint);
                routeCount += 1;
            });
    
            if (routeCount <= 0) return;
            scroll.insertBefore(overlay, scroll.firstChild || null);
        }
    
    function collectMergeRouteSpecs(nodes, specs = []) {
            (Array.isArray(nodes) ? nodes : []).forEach((node) => {
                const ownerKey = nonEmptyString(node && node.ownerKey);
                const listContext = node && node.listContext && typeof node.listContext === 'object'
                    ? node.listContext
                    : {};
                const listId = nonEmptyString(listContext.listId);
                if (ownerKey && listId) {
                    (Array.isArray(node.mergeGroups) ? node.mergeGroups : []).forEach((group) => {
                        const joinIndex = finiteNumber(group && group.joinIndex);
                        if (joinIndex === null) return;
                        specs.push({
                            ownerKey,
                            listId,
                            joinIndex,
                            branchIndices: Array.isArray(group.branchIndices) ? group.branchIndices.slice() : [],
                        });
                    });
                }
                (Array.isArray(node && node.branches) ? node.branches : []).forEach((branch) => {
                    collectMergeRouteSpecs(branch && branch.nodes, specs);
                });
            });
            return specs;
        }
    
    function collectControlFlowRouteSpecs(nodes, specs = []) {
            (Array.isArray(nodes) ? nodes : []).forEach((node) => {
                const target = node && node.controlFlowTarget && typeof node.controlFlowTarget === 'object'
                    ? node.controlFlowTarget
                    : null;
                const listContext = node && node.listContext && typeof node.listContext === 'object'
                    ? node.listContext
                    : {};
                const listId = nonEmptyString(listContext.listId);
                const sourceIndex = finiteNumber(node && node.index);
                const targetIndex = finiteNumber(target && target.targetIndex);
                if (target && listId && sourceIndex !== null && targetIndex !== null) {
                    specs.push({
                        listId,
                        sourceIndex,
                        targetIndex,
                        kind: nonEmptyString(target.kind),
                        direction: nonEmptyString(target.direction),
                    });
                }
                (Array.isArray(node && node.branches) ? node.branches : []).forEach((branch) => {
                    collectControlFlowRouteSpecs(branch && branch.nodes, specs);
                });
            });
            return specs;
        }
    
    function findMergeTargetCard(scroll, spec) {
            const cards = getActionCards(scroll);
            return cards.find((card) => (
                getElementDatasetValue(card, 'foresightListId') === spec.listId
                && finiteNumber(getElementDatasetValue(card, 'foresightCommandIndex')) === spec.joinIndex
            )) || null;
        }
    
    function findMergeLane(scroll, ownerKey, branchIndex) {
            const lanes = typeof scroll.querySelectorAll === 'function'
                ? Array.from(scroll.querySelectorAll('.foresight-branch-lane'))
                : [];
            return lanes.find((lane) => (
                getElementDatasetValue(lane, 'foresightBranchOwnerKey') === ownerKey
                && finiteNumber(getElementDatasetValue(lane, 'foresightBranchIndex')) === normalizeBranchIndex(branchIndex, 0)
            )) || null;
        }

    function normalizeBranchIndex(value, fallback) {
            const numeric = finiteNumber(value);
            return numeric === null ? fallback : numeric;
        }
    
    function findControlFlowSourceCard(scroll, spec) {
            return findCommandCard(scroll, spec && spec.listId, spec && spec.sourceIndex);
        }
    
    function findControlFlowTargetCard(scroll, spec) {
            return findCommandCard(scroll, spec && spec.listId, spec && spec.targetIndex);
        }
    
    function findCommandCard(scroll, listId, index) {
            const cards = getActionCards(scroll);
            return cards.find((card) => (
                getElementDatasetValue(card, 'foresightListId') === String(listId || '')
                && finiteNumber(getElementDatasetValue(card, 'foresightCommandIndex')) === finiteNumber(index)
            )) || null;
        }
    
    function getMergeLaneStartPoint(lane, scroll) {
            const rect = getElementContentRect(lane, scroll);
            if (!rect) return null;
            return {
                x: rect.left + Math.min(18, Math.max(0, rect.width / 2)),
                y: rect.bottom,
            };
        }
    
    function getMergeTargetPoint(card, scroll) {
            const rect = getElementContentRect(card, scroll);
            if (!rect) return null;
            return {
                x: rect.left - 18,
                y: rect.top + 22,
            };
        }
    
    function getControlFlowSourcePoint(card, scroll, spec) {
            const rect = getElementContentRect(card, scroll);
            if (!rect) return null;
            const backward = String(spec && spec.direction) === 'backward';
            return {
                x: backward ? rect.left - 2 : rect.right + 2,
                y: rect.top + 18,
            };
        }
    
    function getControlFlowTargetPoint(card, scroll, spec) {
            const rect = getElementContentRect(card, scroll);
            if (!rect) return null;
            const backward = String(spec && spec.direction) === 'backward';
            return {
                x: backward ? rect.left - 18 : rect.right + 18,
                y: rect.top + 18,
            };
        }
    
    function appendMergeRoute(doc, overlay, spec, branchIndex, startPoint, targetPoint) {
            const laneDropY = Math.max(startPoint.y + 14, targetPoint.y - 28);
            const targetApproachY = Math.max(startPoint.y + 14, targetPoint.y - 14);
            const points = [
                [startPoint.x, startPoint.y],
                [startPoint.x, laneDropY],
                [targetPoint.x, targetApproachY],
                [targetPoint.x, targetPoint.y],
            ];
    
            const line = createSvgElement(doc, 'polyline');
            line.setAttribute('class', 'foresight-merge-route-line');
            line.setAttribute('points', points.map((point) => `${roundCoordinate(point[0])},${roundCoordinate(point[1])}`).join(' '));
            line.setAttribute('data-foresight-merge-join-index', String(spec.joinIndex));
            line.setAttribute('data-foresight-merge-branch-index', String(branchIndex));
            overlay.appendChild(line);
    
            const target = createSvgElement(doc, 'circle');
            target.setAttribute('class', 'foresight-merge-route-target');
            target.setAttribute('cx', String(roundCoordinate(targetPoint.x)));
            target.setAttribute('cy', String(roundCoordinate(targetPoint.y)));
            target.setAttribute('r', '3');
            overlay.appendChild(target);
        }
    
    function appendControlFlowRoute(doc, overlay, spec, sourcePoint, targetPoint) {
            const backward = String(spec && spec.direction) === 'backward';
            const elbowX = backward
                ? Math.min(sourcePoint.x, targetPoint.x) - 24
                : Math.max(sourcePoint.x, targetPoint.x) + 24;
            const points = [
                [sourcePoint.x, sourcePoint.y],
                [elbowX, sourcePoint.y],
                [elbowX, targetPoint.y],
                [targetPoint.x, targetPoint.y],
            ];
    
            const line = createSvgElement(doc, 'polyline');
            line.setAttribute('class', `foresight-control-flow-route-line foresight-control-flow-route-${cssToken(spec && spec.kind)}`);
            line.setAttribute('points', points.map((point) => `${roundCoordinate(point[0])},${roundCoordinate(point[1])}`).join(' '));
            line.setAttribute('data-foresight-control-flow-source-index', String(spec.sourceIndex));
            line.setAttribute('data-foresight-control-flow-target-index', String(spec.targetIndex));
            overlay.appendChild(line);
    
            const target = createSvgElement(doc, 'circle');
            target.setAttribute('class', 'foresight-control-flow-route-target');
            target.setAttribute('cx', String(roundCoordinate(targetPoint.x)));
            target.setAttribute('cy', String(roundCoordinate(targetPoint.y)));
            target.setAttribute('r', '3.5');
            overlay.appendChild(target);
        }
    
    parts.routes = Object.freeze({ drawTreeRoutes });

})();
