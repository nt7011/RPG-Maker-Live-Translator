// Foresight tree render shell and scroll state handling.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const parts = globalScope.LiveTranslatorForesightTreeViewerParts || {};
    globalScope.LiveTranslatorForesightTreeViewerParts = parts;

    // Render shell, DOM reuse, scroll preservation, and render-key diffing.
    const ACTIVE_SCROLL_REFRESH_GRACE_MS = 900;
    const { cloneValue, finiteNumber, nonEmptyString } = parts.utils;
    const { appendNodes, createEmpty, createOverview } = parts.dom;
    const { drawTreeRoutes } = parts.routes;
    const { findActionCardByScrollKey, finiteMetric, finiteScrollMetric, getActionCardScrollKey, getActionCards, getElementHeight, getElementLeftRelativeToScroll, getElementTopRelativeToScroll, getElementWidth, getMaxScrollLeft, getMaxScrollTop, clampScrollLeft, clampScrollTop } = parts.domUtils;
    const { createModel } = parts.model;
    
    function render(container, options = {}) {
            const model = createModel(options.snapshot, options);
            if (!container || !container.ownerDocument) return model;
            const doc = container.ownerDocument;
            const scrollState = captureScrollState(container);
    
            if (!model.hasSnapshot || !model.scan) {
                clearElement(container);
                container.appendChild(createEmpty(doc, 'No foresight scan recorded.'));
                setContainerRenderState(container, null);
                return model;
            }
    
            const renderKeys = createRenderKeys(model, options);
            const previousState = getContainerRenderState(container);
            const existingScroll = findForesightScroll(container);
            const scroll = existingScroll || doc.createElement('div');
            scroll.className = 'foresight-tree-scroll';
            bindScrollActivityTracker(scroll);
            syncForesightShell(container, createOverview(doc, model, options), scroll);
    
            const structureChanged = !previousState
                || !existingScroll
                || previousState.structureKey !== renderKeys.structureKey;
            const contentChanged = !previousState || previousState.contentKey !== renderKeys.contentKey;
            const deferDynamicRefresh = !structureChanged && contentChanged && isScrollRecentlyActive(scroll);
            if (!structureChanged && (!contentChanged || deferDynamicRefresh)) {
                return model;
            }
    
            clearElement(scroll);
            let hasRenderedTree = false;
            if (!model.nodes.length) {
                scroll.appendChild(createEmpty(doc, model.surfaceOnly === true
                    ? 'No foresight messages recorded.'
                    : 'No command actions recorded.'));
            } else {
                const list = doc.createElement('ol');
                list.className = 'foresight-tree-list';
                appendNodes(doc, list, model.nodes, options, 0);
                scroll.appendChild(list);
                hasRenderedTree = true;
            }
    
            if (hasRenderedTree) drawTreeRoutes(doc, scroll, model);
            restoreScrollState(scroll, scrollState);
            setContainerRenderState(container, renderKeys);
            return model;
        }
    
    function syncForesightShell(container, overview, scroll) {
            if (!container || !overview || !scroll) return;
            const currentOverview = findForesightOverview(container);
            if (currentOverview) removeElement(currentOverview);
            if (scroll.parentNode !== container) {
                container.appendChild(scroll);
            }
            container.insertBefore(overview, scroll);
            getElementChildren(container).forEach((child) => {
                if (child !== overview && child !== scroll) removeElement(child);
            });
        }
    
    function findForesightOverview(container) {
            return container && typeof container.querySelector === 'function'
                ? container.querySelector('.foresight-overview')
                : null;
        }
    
    function findForesightScroll(container) {
            return container && typeof container.querySelector === 'function'
                ? container.querySelector('.foresight-tree-scroll')
                : null;
        }
    
    function getContainerRenderState(container) {
            return container && container.__liveTranslatorForesightRenderState
                ? container.__liveTranslatorForesightRenderState
                : null;
        }
    
    function setContainerRenderState(container, state) {
            if (container) container.__liveTranslatorForesightRenderState = state || null;
        }
    
    function getElementChildren(element) {
            if (!element || !element.children) return [];
            try {
                return Array.from(element.children);
            } catch (_) {
                return [];
            }
        }
    
    function clearElement(element) {
            if (!element) return;
            if (typeof element.replaceChildren === 'function') {
                element.replaceChildren();
                return;
            }
            if (typeof element.innerHTML === 'string') {
                element.innerHTML = '';
                return;
            }
            getElementChildren(element).forEach(removeElement);
        }
    
    function removeElement(element) {
            const parent = element && element.parentNode;
            if (!parent) return;
            if (typeof parent.removeChild === 'function') {
                parent.removeChild(element);
                return;
            }
            if (Array.isArray(parent.children)) {
                parent.children = parent.children.filter((child) => child !== element);
                element.parentNode = null;
            }
        }
    
    function bindScrollActivityTracker(scroll) {
            if (!scroll
                || scroll.__liveTranslatorForesightScrollTracked === true
                || typeof scroll.addEventListener !== 'function') return;
            const markActive = () => {
                scroll.__liveTranslatorForesightLastScrollAt = nowMs();
            };
            scroll.__liveTranslatorForesightScrollTracked = true;
            try {
                scroll.addEventListener('scroll', markActive, { passive: true });
                scroll.addEventListener('wheel', markActive, { passive: true });
                scroll.addEventListener('touchmove', markActive, { passive: true });
                scroll.addEventListener('pointerdown', markActive, { passive: true });
            } catch (_) {}
        }
    
    function isScrollRecentlyActive(scroll) {
            const lastActiveAt = Number(scroll && scroll.__liveTranslatorForesightLastScrollAt);
            return Number.isFinite(lastActiveAt) && nowMs() - lastActiveAt < ACTIVE_SCROLL_REFRESH_GRACE_MS;
        }
    
    function nowMs() {
            return Date.now ? Date.now() : new Date().getTime();
        }
    
    function createRenderKeys(model, options) {
            const structure = createModelStructureRenderValue(model);
            const records = collectMessageRecordRenderValues(model && model.nodes);
            const content = {
                structure,
                dynamic: records.length && options.dynamicRenderKey !== undefined ? String(options.dynamicRenderKey) : '',
                records,
            };
            return {
                structureKey: stableRenderString(structure),
                contentKey: stableRenderString(content),
            };
        }
    
    function createModelStructureRenderValue(model) {
            return {
                messagesOnly: model && model.messagesOnly === true,
                actionLimit: model && model.actionLimit,
                actionsTruncated: model && model.actionsTruncated,
                condensedActionCount: model && model.condensedActionCount,
                nodes: createNodeStructureRenderValues(model && model.nodes),
            };
        }
    
    function createNodeStructureRenderValues(nodes) {
            return (Array.isArray(nodes) ? nodes : []).map(createNodeStructureRenderValue);
        }
    
    function createNodeStructureRenderValue(node) {
            if (!node) return null;
            if (node.condensed === true) {
                return {
                    condensed: true,
                    scrollKey: nonEmptyString(node.scrollKey),
                    text: nonEmptyString(node.text),
                    count: finiteNumber(node.count),
                    actions: cloneValue(node.actions, 0),
                };
            }
            if (node.messageOnlyBranch === true) {
                return {
                    messageOnlyBranch: true,
                    scrollKey: nonEmptyString(node.scrollKey),
                    text: nonEmptyString(node.text),
                    branchDepth: finiteNumber(node.branchDepth),
                    branchPath: cloneValue(node.branchPath, 0),
                    listContext: cloneValue(node.listContext, 0),
                    ownerKey: nonEmptyString(node.ownerKey),
                    branches: (Array.isArray(node.branches) ? node.branches : []).map(createBranchStructureRenderValue),
                    mergeGroups: cloneValue(node.mergeGroups, 0),
                };
            }
            return {
                scrollKey: nonEmptyString(node.scrollKey),
                index: finiteNumber(node.index),
                code: finiteNumber(node.code),
                label: nonEmptyString(node.label),
                classification: nonEmptyString(node.classification),
                action: nonEmptyString(node.action),
                native: node.native === true,
                scanBehavior: nonEmptyString(node.scanBehavior),
                stopReason: nonEmptyString(node.stopReason),
                stopReasonLabel: nonEmptyString(node.stopReasonLabel),
                priorityDistance: finiteNumber(node.priorityDistance),
                branchDepth: finiteNumber(node.branchDepth),
                branchPath: cloneValue(node.branchPath, 0),
                listContext: cloneValue(node.listContext, 0),
                routeCommandActions: cloneValue(node.routeCommandActions, 0),
                controlFlowTarget: cloneValue(node.controlFlowTarget, 0),
                messageRecordId: node.messageRecord && node.messageRecord.id ? String(node.messageRecord.id) : '',
                ownerKey: nonEmptyString(node.ownerKey),
                isBranching: node.isBranching === true,
                branches: (Array.isArray(node.branches) ? node.branches : []).map(createBranchStructureRenderValue),
            };
        }
    
    function createBranchStructureRenderValue(branch) {
            return {
                label: nonEmptyString(branch && branch.label),
                branchIndex: finiteNumber(branch && branch.branchIndex),
                branchPath: cloneValue(branch && branch.branchPath, 0),
                startIndex: finiteNumber(branch && branch.startIndex),
                endIndex: finiteNumber(branch && branch.endIndex),
                joinIndex: finiteNumber(branch && branch.joinIndex),
                actionCount: finiteNumber(branch && branch.actionCount),
                actionsTruncated: finiteNumber(branch && branch.actionsTruncated),
                stops: cloneValue(branch && branch.stops, 0),
                nodes: createNodeStructureRenderValues(branch && branch.nodes),
            };
        }
    
    function collectMessageRecordRenderValues(nodes, records = []) {
            (Array.isArray(nodes) ? nodes : []).forEach((node) => {
                if (!node || node.condensed === true) return;
                if (node.messageRecord) {
                    records.push({
                        scrollKey: nonEmptyString(node.scrollKey),
                        record: createMessageRecordRenderValue(node.messageRecord),
                    });
                }
                (Array.isArray(node.branches) ? node.branches : []).forEach((branch) => {
                    collectMessageRecordRenderValues(branch && branch.nodes, records);
                });
            });
            return records;
        }
    
    function createMessageRecordRenderValue(record) {
            const source = record && typeof record === 'object' ? record : {};
            return {
                id: source.id ? String(source.id) : '',
                status: source.status ? String(source.status) : '',
                hook: source.hook ? String(source.hook) : '',
                hookKey: source.hookKey ? String(source.hookKey) : '',
                rawText: source.rawText ? String(source.rawText) : '',
                original: source.original ? String(source.original) : '',
                visibleText: source.visibleText ? String(source.visibleText) : '',
                translation: source.translation ? String(source.translation) : '',
                translationReceived: source.translationReceived ? String(source.translationReceived) : '',
                priority: source.priority,
                metadata: cloneValue(source.metadata, 0),
            };
        }
    
    function stableRenderString(value, depth = 0) {
            if (value === null || value === undefined) return 'null';
            const type = typeof value;
            if (type === 'string' || type === 'number' || type === 'boolean') return JSON.stringify(value);
            if (depth >= 8) return '"[Object]"';
            if (Array.isArray(value)) {
                return `[${value.map((entry) => stableRenderString(entry, depth + 1)).join(',')}]`;
            }
            if (type !== 'object') return JSON.stringify(String(value));
            const keys = Object.keys(value).sort();
            return `{${keys.map((key) => `${JSON.stringify(key)}:${stableRenderString(value[key], depth + 1)}`).join(',')}}`;
        }
    
    function captureScrollState(container) {
            const scroll = container && typeof container.querySelector === 'function'
                ? container.querySelector('.foresight-tree-scroll')
                : null;
            if (!scroll) return null;
            const top = finiteScrollMetric(scroll.scrollTop);
            const left = finiteScrollMetric(scroll.scrollLeft);
            const maxTop = getMaxScrollTop(scroll);
            const maxLeft = getMaxScrollLeft(scroll);
            return {
                top,
                left,
                anchors: captureScrollAnchors(scroll),
                atBottom: maxTop > 0 && top >= maxTop - 2,
                atRight: maxLeft > 0 && left >= maxLeft - 2,
            };
        }
    
    function restoreScrollState(scroll, state) {
            if (!scroll || !state) return;
            const maxTop = getMaxScrollTop(scroll);
            const maxLeft = getMaxScrollLeft(scroll);
            let restoredTop = false;
            let restoredLeft = false;
            if (state.atBottom && maxTop > 0) {
                scroll.scrollTop = maxTop;
                restoredTop = true;
            }
    
            const anchors = Array.isArray(state.anchors) ? state.anchors : [];
            for (const anchor of anchors) {
                const element = findActionCardByScrollKey(scroll, anchor && anchor.key);
                if (!element) continue;
                // Preserve the same visible action in both axes. When a right-side
                // branch becomes the new head, the computed horizontal scroll can
                // clamp back to zero, which collapses the view left naturally.
                const currentOffset = getElementTopRelativeToScroll(element, scroll);
                const currentLeftOffset = getElementLeftRelativeToScroll(element, scroll);
                if (!restoredTop && currentOffset !== null) {
                    const nextTop = finiteScrollMetric(scroll.scrollTop) + currentOffset - finiteMetric(anchor.offsetTop);
                    scroll.scrollTop = clampScrollTop(nextTop, maxTop);
                    restoredTop = true;
                }
                if (!restoredLeft && currentLeftOffset !== null) {
                    const nextLeft = finiteScrollMetric(scroll.scrollLeft) + currentLeftOffset - finiteMetric(anchor.offsetLeft);
                    scroll.scrollLeft = clampScrollLeft(nextLeft, maxLeft);
                    restoredLeft = true;
                }
                if (restoredTop && restoredLeft) return;
            }
    
            if (!restoredTop && state.top > 0) {
                scroll.scrollTop = clampScrollTop(state.top, maxTop || state.top);
            }
            if (!restoredLeft && state.atRight && maxLeft > 0) {
                scroll.scrollLeft = maxLeft;
                return;
            }
            if (!restoredLeft && state.left > 0) {
                scroll.scrollLeft = clampScrollLeft(state.left, maxLeft || state.left);
            }
        }
    
    function captureScrollAnchors(scroll) {
            const cards = getActionCards(scroll);
            if (!cards.length) return [];
            const viewportHeight = finiteScrollMetric(scroll.clientHeight);
            const viewportWidth = finiteScrollMetric(scroll.clientWidth);
            const anchors = [];
    
            cards.forEach((card) => {
                if (anchors.length >= 8) return;
                const key = getActionCardScrollKey(card);
                if (!key) return;
                const offsetTop = getElementTopRelativeToScroll(card, scroll);
                if (offsetTop === null) return;
                const height = getElementHeight(card);
                if (offsetTop + height < -2) return;
                if (anchors.length > 0 && viewportHeight > 0 && offsetTop > viewportHeight + 2) return;
                const offsetLeft = getElementLeftRelativeToScroll(card, scroll);
                if (viewportWidth > 0 && offsetLeft !== null) {
                    const width = getElementWidth(card);
                    if (offsetLeft + width < -2 || offsetLeft > viewportWidth + 2) return;
                }
                anchors.push({ key, offsetTop, offsetLeft });
            });
    
            return anchors;
        }
    
    parts.renderer = Object.freeze({ render });

})();
