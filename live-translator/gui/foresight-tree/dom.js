// Foresight panel timeline DOM rendering.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const registry = globalScope.LiveTranslatorForesightTreeViewerRegistry;
    if (!registry || typeof registry.registerPart !== 'function' || typeof registry.requirePart !== 'function') {
        throw new Error('[ForesightTreeViewer] parts registry must load before DOM helpers.');
    }

    // DOM card construction for overview chips, timeline cells, and panels.
    const { cssToken, defaultFormatTime, finiteNumber, formatControlFlowKind, formatControlFlowTarget, formatCount, nonEmptyString } = registry.requirePart('utils');
    const { setElementDatasetValue } = registry.requirePart('domUtils');

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

    function appendTimeline(doc, container, layout, options) {
        const source = layout && typeof layout === 'object' ? layout : {};
        const shell = doc.createElement('div');
        shell.className = source.currentMessageRecord
            ? 'foresight-panel-timeline foresight-panel-timeline-with-current'
            : 'foresight-panel-timeline';

        if (source.currentMessageRecord) {
            shell.appendChild(createCurrentMessageSlot(doc, source.currentMessageRecord, options));
        }

        const grid = doc.createElement('div');
        grid.className = 'foresight-timeline-grid';
        setElementDatasetValue(grid, 'foresightColumnCount', String(source.columnCount || 1));
        setElementDatasetValue(grid, 'foresightRowCount', String(Array.isArray(source.rows) ? source.rows.length : 0));

        (Array.isArray(source.rows) ? source.rows : []).forEach((row) => {
            (Array.isArray(row.items) ? row.items : []).forEach((item) => {
                grid.appendChild(createTimelineCell(doc, item, options));
            });
        });

        shell.appendChild(grid);
        container.appendChild(shell);
    }

    function createTimelineCell(doc, item, options) {
        const source = item && typeof item === 'object' ? item : {};
        const cell = doc.createElement('div');
        cell.className = [
            'foresight-timeline-cell',
            `foresight-timeline-cell-${cssToken(source.kind || 'node')}`,
            source.column === 0 ? 'foresight-timeline-cell-start' : '',
        ].filter(Boolean).join(' ');
        setElementDatasetValue(cell, 'foresightTimelineRow', String(source.rowIndex || 0));
        setElementDatasetValue(cell, 'foresightTimelineColumn', String(source.column || 0));
        setGridPlacement(cell, (source.column || 0) + 1, (source.rowIndex || 0) + 1);

        if (source.branchLabel) {
            const label = doc.createElement('div');
            label.className = 'foresight-timeline-label';
            label.textContent = source.branchLabel;
            cell.appendChild(label);
        }

        const panel = createTimelinePanel(doc, source, options);
        if (panel) cell.appendChild(panel);
        return cell;
    }

    function createTimelinePanel(doc, item, options) {
        if (item.kind === 'condensed') return createCondensedActions(doc, item.node);
        if (item.kind === 'placeholder') return createPlaceholderPanel(doc);
        if (item.kind === 'stop') return createStopPanel(doc, item.stops);
        if (item.kind === 'truncated') return createTruncatedPanel(doc, item.count);
        const node = item.node;
        if (!node) return null;
        if (options && options.messagesOnly === true && node.messageRecord) {
            return createMessageNodeCard(doc, node, options, { current: false });
        }
        return createActionCard(doc, node, options || {});
    }

    function setGridPlacement(element, column, row) {
        const value = `grid-column:${column};grid-row:${row};`;
        if (element && element.style) {
            element.style.gridColumn = String(column);
            element.style.gridRow = String(row);
            return;
        }
        if (element && typeof element.setAttribute === 'function') {
            element.setAttribute('style', value);
        }
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

    function createCondensedActions(doc, node) {
        const wrap = doc.createElement('div');
        wrap.className = 'foresight-condensed-actions';
        if (node && node.scrollKey) setElementDatasetValue(wrap, 'foresightScrollKey', node.scrollKey);
        wrap.textContent = nonEmptyString(node && node.text) || '-';
        return wrap;
    }

    function createPlaceholderPanel(doc) {
        const panel = doc.createElement('div');
        panel.className = 'foresight-placeholder-panel';
        panel.textContent = 'Branch target not scanned.';
        return panel;
    }

    function createStopPanel(doc, stops) {
        const panel = doc.createElement('div');
        panel.className = 'foresight-stop-panel';
        (Array.isArray(stops) ? stops : []).forEach((stop) => {
            const row = doc.createElement('div');
            row.className = 'foresight-stop-row';
            const code = doc.createElement('span');
            code.className = 'foresight-stop-code';
            code.textContent = stop && stop.code !== null && stop.code !== undefined ? String(stop.code) : '???';
            const label = doc.createElement('span');
            label.className = 'foresight-stop-label';
            label.textContent = createStopReasonText(stop && stop.stopReason, stop && stop.stopReasonLabel);
            row.appendChild(code);
            row.appendChild(label);
            panel.appendChild(row);
        });
        return panel;
    }

    function createTruncatedPanel(doc, count) {
        const panel = doc.createElement('div');
        panel.className = 'foresight-truncated-panel';
        panel.textContent = `${formatCount(count)} hidden actions`;
        return panel;
    }

    function createActionCard(doc, node, options) {
        const card = doc.createElement('div');
        card.className = [
            'foresight-panel-card',
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

        if (node.messageRecord) {
            const pill = createMessagePill(doc, node.messageRecord, node, options);
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

    function createCurrentMessageSlot(doc, record, options = {}) {
        const slot = doc.createElement('div');
        slot.className = 'foresight-current-message-slot';
        slot.appendChild(createMessageNodeCard(doc, {
            scrollKey: createCurrentMessageScrollKey(record),
            messageRecord: record,
            ownerKey: '',
            index: null,
            listContext: {},
        }, options, { current: true }));
        return slot;
    }

    function createMessageNodeCard(doc, node, options, state = {}) {
        const card = doc.createElement('div');
        card.className = [
            'foresight-panel-card',
            'foresight-message-node-card',
            state.current === true ? 'foresight-current-message-card' : '',
        ].filter(Boolean).join(' ');
        if (node && node.scrollKey) setElementDatasetValue(card, 'foresightScrollKey', node.scrollKey);
        if (node && node.ownerKey) setElementDatasetValue(card, 'foresightOwnerKey', node.ownerKey);
        if (node && node.index !== null && node.index !== undefined) {
            setElementDatasetValue(card, 'foresightCommandIndex', String(node.index));
        }
        const listContext = node && node.listContext && typeof node.listContext === 'object' ? node.listContext : {};
        if (listContext.listId) setElementDatasetValue(card, 'foresightListId', String(listContext.listId));
        const pill = createMessagePill(doc, node && node.messageRecord, node, options);
        if (pill) card.appendChild(pill);
        return card;
    }

    function createMessagePill(doc, record, node, options) {
        if (record && typeof options.createTranslationPill === 'function') {
            const pill = options.createTranslationPill(record, node);
            if (pill) return pill;
        }
        return createStaticTranslationPill(doc, record);
    }

    function createStaticTranslationPill(doc, record) {
        if (!record) return null;
        const pill = doc.createElement('div');
        pill.className = [
            'foresight-text-pill',
            `text-status-${cssToken(record.status || 'detected')}`,
            'text-hook-message',
            'text-translation-neutral',
            record && record.metadata && record.metadata.syntheticForesightRecord ? 'foresight-text-pill-synthetic' : '',
        ].filter(Boolean).join(' ');
        const content = doc.createElement('span');
        content.className = 'foresight-text-pill-content';
        content.appendChild(createTextLine(doc, record.rawText || record.original || record.visibleText || '', 'source'));
        content.appendChild(createTextLine(doc, record.translation || record.translationReceived || '', 'translation'));
        pill.appendChild(content);
        return pill;
    }

    function createTextLine(doc, value, kind) {
        const line = doc.createElement('span');
        line.className = `text-line ${cssToken(kind)}`;
        line.textContent = String(value || '');
        return line;
    }

    function createCurrentMessageScrollKey(record) {
        const id = nonEmptyString(record && record.id);
        if (id) return `current-message:${id}`;
        const text = nonEmptyString(record && (record.normalizedSource || record.translationSource || record.rawText || record.original));
        return `current-message:${cssToken(text || 'active')}`;
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

    function createEmpty(doc, text) {
        const empty = doc.createElement('div');
        empty.className = 'empty';
        empty.textContent = text;
        return empty;
    }

    registry.registerPart('dom', Object.freeze({ appendTimeline, createEmpty, createOverview }));
})();
