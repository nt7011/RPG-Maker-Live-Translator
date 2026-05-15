// Foresight tree DOM node rendering.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const parts = globalScope.LiveTranslatorForesightTreeViewerParts || {};
    globalScope.LiveTranslatorForesightTreeViewerParts = parts;

    // DOM card construction for overview, action cards, branches, and stops.
    const { cssToken, defaultFormatTime, finiteNumber, formatControlFlowKind, formatControlFlowTarget, formatCount, nonEmptyString } = parts.utils;
    const { setElementDatasetValue } = parts.domUtils;
    
    function createOverview(doc, model, options) {
            const overview = doc.createElement('div');
            overview.className = 'foresight-overview';
            const scan = model.scan || {};
            const summary = model.summary || {};
            const chips = [
                ['scan', scan.status || 'scanned'],
                ['messages', formatCount(summary.messages !== undefined ? summary.messages : scan.blocks)],
                ['risk', formatCount(summary.staleRiskCommands !== undefined ? summary.staleRiskCommands : scan.staleRiskCommands)],
                ['barriers', formatCount(summary.routeBarriers !== undefined ? summary.routeBarriers : scan.routeBarriers)],
            ];
            chips.forEach(([label, value]) => overview.appendChild(createChip(doc, label, value)));
            if (scan.stopReasonLabel || scan.stopReason) {
                overview.appendChild(createChip(doc, 'stop', createStopReasonText(scan.stopReason, scan.stopReasonLabel)));
            }
            if (model.actionsTruncated > 0) {
                overview.appendChild(createChip(doc, 'hidden', `${formatCount(model.actionsTruncated)} actions`));
            }
            if (model.condensedActionCount > 0) {
                overview.appendChild(createChip(doc, 'condensed', `${formatCount(model.condensedActionCount)} actions`));
            }
            if (scan.at || model.snapshotUpdatedAt) {
                const formatTime = typeof options.formatTime === 'function' ? options.formatTime : defaultFormatTime;
                overview.appendChild(createChip(doc, 'updated', formatTime(scan.at || model.snapshotUpdatedAt)));
            }
            return overview;
        }
    
    function createChip(doc, label, value) {
            const chip = doc.createElement('span');
            chip.className = `foresight-chip foresight-chip-${cssToken(label)}`;
            const key = doc.createElement('span');
            key.className = 'foresight-chip-label';
            key.textContent = label;
            const strong = doc.createElement('strong');
            strong.textContent = String(value === undefined || value === null || value === '' ? '-' : value);
            chip.appendChild(key);
            chip.appendChild(strong);
            return chip;
        }
    
    function appendNodes(doc, list, nodes, options, depth) {
            nodes.forEach((node) => {
                const item = doc.createElement('li');
                item.className = `foresight-tree-node foresight-depth-${Math.min(4, depth || 0)}`;
                if (node && node.condensed === true) {
                    item.appendChild(createCondensedActions(doc, node));
                    list.appendChild(item);
                    return;
                }
                if (node && node.messageOnlyBranch === true) {
                    item.appendChild(createMessageOnlyBranch(doc, node));
                    if (node.branches.length) {
                        item.appendChild(createBranchWrap(doc, node, options, depth + 1));
                    }
                    list.appendChild(item);
                    return;
                }
                item.appendChild(createActionCard(doc, node, options));
                if (node.isBranching || node.branches.length) {
                    item.appendChild(createBranchWrap(doc, node, options, depth + 1));
                }
                list.appendChild(item);
            });
        }
    
    function createCondensedActions(doc, node) {
            const wrap = doc.createElement('div');
            wrap.className = 'foresight-condensed-actions';
            if (node && node.scrollKey) setElementDatasetValue(wrap, 'foresightScrollKey', node.scrollKey);
            wrap.textContent = nonEmptyString(node && node.text) || '-';
            return wrap;
        }

    function createMessageOnlyBranch(doc, node) {
            const wrap = doc.createElement('div');
            wrap.className = 'foresight-message-branch';
            if (node && node.scrollKey) setElementDatasetValue(wrap, 'foresightScrollKey', node.scrollKey);
            wrap.textContent = nonEmptyString(node && node.text) || '|------|';
            return wrap;
        }
    
    function createActionCard(doc, node, options) {
            const card = doc.createElement('div');
            card.className = [
                'foresight-action-card',
                `foresight-class-${cssToken(node.classification)}`,
                `foresight-action-${cssToken(node.action)}`,
            ].join(' ');
            if (node.scrollKey) {
                setElementDatasetValue(card, 'foresightScrollKey', node.scrollKey);
            }
            if (node.ownerKey) setElementDatasetValue(card, 'foresightOwnerKey', node.ownerKey);
            if (node.index !== null) setElementDatasetValue(card, 'foresightCommandIndex', String(node.index));
            if (node.listContext && node.listContext.listId) {
                setElementDatasetValue(card, 'foresightListId', String(node.listContext.listId));
            }
    
            const header = doc.createElement('div');
            header.className = 'foresight-action-header';
            header.appendChild(createCodeBadge(doc, node.code));
    
            const label = doc.createElement('div');
            label.className = 'foresight-action-label';
            label.textContent = node.label;
            header.appendChild(label);
            const classBadge = createClassBadge(doc, node.classification);
            if (classBadge) header.appendChild(classBadge);
            card.appendChild(header);
    
            const meta = doc.createElement('div');
            meta.className = 'foresight-action-meta';
            meta.appendChild(createMetaPart(doc, `#${node.index === null ? '-' : node.index}`));
            meta.appendChild(createMetaPart(doc, node.action || node.scanBehavior || '-'));
            meta.appendChild(createMetaPart(doc, node.native ? 'native' : 'plugin'));
            if (node.stopReasonLabel || node.stopReason) {
                meta.appendChild(createMetaPart(
                    doc,
                    createStopReasonText(node.stopReason, node.stopReasonLabel),
                    'foresight-action-meta-stop'
                ));
            }
            card.appendChild(meta);
    
            if (node.messageRecord && typeof options.createTranslationPill === 'function') {
                const pill = options.createTranslationPill(node.messageRecord, node);
                if (pill) {
                    const wrap = doc.createElement('div');
                    wrap.className = 'foresight-message-pill';
                    wrap.appendChild(pill);
                    card.appendChild(wrap);
                }
            }
    
            if (node.routeCommandActions.length) {
                card.appendChild(createRouteList(doc, node.routeCommandActions));
            }
            if (node.controlFlowTarget) {
                card.appendChild(createControlFlowTarget(doc, node.controlFlowTarget));
            }
    
            return card;
        }
    
    function createCodeBadge(doc, code) {
            const badge = doc.createElement('span');
            badge.className = 'foresight-code-badge';
            badge.textContent = code === null ? '???' : String(code);
            return badge;
        }
    
    function createClassBadge(doc, classification) {
            const classificationKey = String(classification || '').toLowerCase();
            if (classificationKey === 'linear' || classificationKey === 'external') return null;
    
            const badge = doc.createElement('span');
            badge.className = `foresight-class-badge foresight-class-badge-${cssToken(classification)}`;
            badge.textContent = classificationKey === 'terminal' ? 'end' : classification || 'unknown';
            return badge;
        }
    
    function createMetaPart(doc, text, className) {
            const part = doc.createElement('span');
            if (className) part.className = className;
            part.textContent = text;
            return part;
        }
    
    function createStopReasonText(stopReason, stopReasonLabel) {
            return nonEmptyString(stopReason) || nonEmptyString(stopReasonLabel) || 'stopped';
        }
    
    function createRouteList(doc, routeActions) {
            const wrap = doc.createElement('div');
            wrap.className = 'foresight-route-list';
            routeActions.forEach((action) => {
                const row = doc.createElement('div');
                row.className = `foresight-route-row foresight-class-${cssToken(action.classification)}`;
                const code = doc.createElement('span');
                code.className = 'foresight-route-code';
                code.textContent = action.code === null || action.code === undefined ? '???' : String(action.code);
                const label = doc.createElement('span');
                label.className = 'foresight-route-label';
                label.textContent = action.label || 'Unknown route command';
                const classification = doc.createElement('span');
                classification.className = 'foresight-route-classification';
                classification.textContent = action.classification || 'unknown';
                row.appendChild(code);
                row.appendChild(label);
                row.appendChild(classification);
                wrap.appendChild(row);
            });
            return wrap;
        }
    
    function createControlFlowTarget(doc, target) {
            const wrap = doc.createElement('div');
            wrap.className = `foresight-control-flow-target foresight-control-flow-${cssToken(target && target.kind)}`;
            const key = doc.createElement('span');
            key.className = 'foresight-control-flow-key';
            key.textContent = formatControlFlowKind(target && target.kind);
            const value = doc.createElement('span');
            value.className = 'foresight-control-flow-value';
            value.textContent = formatControlFlowTarget(target);
            wrap.appendChild(key);
            wrap.appendChild(value);
            return wrap;
        }
    
    function createBranchWrap(doc, node, options, depth) {
            const wrap = doc.createElement('div');
            wrap.className = 'foresight-branch-wrap';
            if (node.ownerKey) setElementDatasetValue(wrap, 'foresightBranchOwnerKey', node.ownerKey);
            if (!node.branches.length) {
                const lane = doc.createElement('div');
                lane.className = 'foresight-branch-lane';
                const placeholder = doc.createElement('div');
                placeholder.className = 'foresight-branch-empty';
                placeholder.textContent = 'Branch target not scanned.';
                lane.appendChild(placeholder);
                wrap.appendChild(lane);
                return wrap;
            }
    
            node.branches.forEach((branch) => {
                const lane = doc.createElement('div');
                lane.className = 'foresight-branch-lane';
                if (node.ownerKey) setElementDatasetValue(lane, 'foresightBranchOwnerKey', node.ownerKey);
                setElementDatasetValue(lane, 'foresightBranchIndex', String(branch.branchIndex));
                const label = doc.createElement('div');
                label.className = 'foresight-branch-label';
                label.textContent = branch.label;
                lane.appendChild(label);
                if (branch.nodes.length) {
                    const list = doc.createElement('ol');
                    list.className = 'foresight-tree-list foresight-tree-list-branch';
                    appendNodes(doc, list, branch.nodes, options, depth);
                    lane.appendChild(list);
                } else {
                    const empty = doc.createElement('div');
                    empty.className = 'foresight-branch-empty';
                    empty.textContent = 'No command actions recorded.';
                    lane.appendChild(empty);
                }
                if (branch.stops && branch.stops.length) {
                    lane.appendChild(createBranchStopList(doc, branch.stops));
                }
                if (branch.actionsTruncated > 0) {
                    lane.appendChild(createChip(doc, 'hidden', `${formatCount(branch.actionsTruncated)} actions`));
                }
                wrap.appendChild(lane);
            });
            return wrap;
        }
    
    function createBranchStopList(doc, stops) {
            const list = doc.createElement('div');
            list.className = 'foresight-branch-stop-list';
            stops.forEach((stop) => {
                const row = doc.createElement('div');
                row.className = 'foresight-branch-stop';
                const code = doc.createElement('span');
                code.className = 'foresight-branch-stop-code';
                code.textContent = stop.code === null || stop.code === undefined ? '???' : String(stop.code);
                const label = doc.createElement('span');
                label.className = 'foresight-branch-stop-label';
                label.textContent = createStopReasonText(stop.stopReason, stop.stopReasonLabel);
                row.appendChild(code);
                row.appendChild(label);
                list.appendChild(row);
            });
            return list;
        }
    
    function createEmpty(doc, text) {
            const empty = doc.createElement('div');
            empty.className = 'empty';
            empty.textContent = text;
            return empty;
        }
    
    parts.dom = Object.freeze({ appendNodes, createEmpty, createOverview });

})();
