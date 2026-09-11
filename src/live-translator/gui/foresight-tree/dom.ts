import { setElementDatasetValue } from './dom-utils.js';
import type { TimelineItem, TimelineLayout } from './layout.js';
import type { ForesightModel, ForesightNode, ForesightPathStop, UnknownRecord } from './model-types.js';
import { cssToken, defaultFormatTime, formatControlFlowKind, formatControlFlowTarget, formatCount, nonEmptyString, stringValue, } from './utils.js';
function isUnknownRecord(value: unknown): value is UnknownRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function recordOrEmpty(value: unknown): UnknownRecord {
    return isUnknownRecord(value) ? value : {};
}
function recordValue(value: unknown, key: string): unknown {
    return isUnknownRecord(value) ? value[key] : undefined;
}
function truthyOr(value: unknown, fallback: unknown): unknown {
    if (value)
        return value;
    return fallback;
}
function appendUnknownChild(parent: Element, child: unknown): void {
    if (!child)
        return;
    const appendChild: unknown = Reflect.get(parent, 'appendChild');
    if (typeof appendChild === 'function')
        Reflect.apply(appendChild, parent, [child]);
}
export function createOverview(doc: Document, model: ForesightModel, options: UnknownRecord): HTMLElement {
    const overview = doc.createElement('div');
    overview.className = 'foresight-overview';
    const scan = recordOrEmpty(model.scan);
    const summary = recordOrEmpty(model.summary);
    const chips: [
        string,
        unknown
    ][] = [
        ['scan', truthyOr(scan['status'], 'scanned')],
        ['messages', formatCount(summary['messages'] !== undefined ? summary['messages'] : scan['blocks'])],
        [
            'risk',
            formatCount(summary['staleRiskCommands'] !== undefined ? summary['staleRiskCommands'] : scan['staleRiskCommands']),
        ],
        [
            'barriers',
            formatCount(summary['routeBarriers'] !== undefined ? summary['routeBarriers'] : scan['routeBarriers']),
        ],
    ];
    chips.forEach(([label, value]) => overview.appendChild(createChip(doc, label, value)));
    if (scan['stopReasonLabel'] || scan['stopReason']) {
        overview.appendChild(createChip(doc, 'stop', createStopReasonText(scan['stopReason'], scan['stopReasonLabel'])));
    }
    if (model.actionsTruncated > 0) {
        overview.appendChild(createChip(doc, 'hidden', `${formatCount(model.actionsTruncated)} actions`));
    }
    if (model.admission.truncated) {
        overview.appendChild(createChip(doc, 'bounded', model.admission.reasons.join(', ')));
    }
    if (model.condensedActionCount > 0) {
        overview.appendChild(createChip(doc, 'condensed', `${formatCount(model.condensedActionCount)} actions`));
    }
    const updatedAt = truthyOr(scan['at'], model.snapshotUpdatedAt);
    if (updatedAt) {
        overview.appendChild(createChip(doc, 'updated', formatTime(options, updatedAt)));
    }
    return overview;
}
export function appendTimeline(doc: Document, container: Element, layout: TimelineLayout, options: UnknownRecord): void {
    const shell = doc.createElement('div');
    shell.className = layout.currentMessageRecord
        ? 'foresight-panel-timeline foresight-panel-timeline-with-current'
        : 'foresight-panel-timeline';
    if (layout.currentMessageRecord) {
        shell.appendChild(createCurrentMessageSlot(doc, layout.currentMessageRecord, options));
    }
    const grid = doc.createElement('div');
    grid.className = 'foresight-timeline-grid';
    setElementDatasetValue(grid, 'foresightColumnCount', String(layout.columnCount || 1));
    setElementDatasetValue(grid, 'foresightRowCount', String(Array.isArray(layout.rows) ? layout.rows.length : 0));
    (Array.isArray(layout.rows) ? layout.rows : []).forEach((row) => {
        (Array.isArray(row.items) ? row.items : []).forEach((item) => {
            grid.appendChild(createTimelineCell(doc, item, options));
        });
    });
    shell.appendChild(grid);
    container.appendChild(shell);
}
function createTimelineCell(doc: Document, item: TimelineItem, options: UnknownRecord): HTMLElement {
    const cell = doc.createElement('div');
    cell.className = [
        'foresight-timeline-cell',
        `foresight-timeline-cell-${cssToken(item.kind)}`,
        item.column === 0 ? 'foresight-timeline-cell-start' : '',
    ]
        .filter(Boolean)
        .join(' ');
    setElementDatasetValue(cell, 'foresightTimelineRow', String(item.rowIndex ?? 0));
    setElementDatasetValue(cell, 'foresightTimelineColumn', String(item.column));
    setGridPlacement(cell, item.column + 1, (item.rowIndex ?? 0) + 1);
    if (item.branchLabel) {
        const label = doc.createElement('div');
        label.className = 'foresight-timeline-label';
        label.textContent = item.branchLabel;
        cell.appendChild(label);
    }
    const panel = createTimelinePanel(doc, item, options);
    if (panel)
        cell.appendChild(panel);
    return cell;
}
function createTimelinePanel(doc: Document, item: TimelineItem, options: UnknownRecord): HTMLElement | null {
    if (item.kind === 'condensed')
        return createCondensedActions(doc, item.node);
    if (item.kind === 'placeholder')
        return createPlaceholderPanel(doc);
    if (item.kind === 'stop')
        return createStopPanel(doc, item.stops);
    if (item.kind === 'truncated')
        return createTruncatedPanel(doc, item.count);
    const node = item.node;
    if (options['messagesOnly'] === true && node.messageRecord) {
        return createMessageNodeCard(doc, node, options, false);
    }
    return createActionCard(doc, node, options);
}
function setGridPlacement(element: HTMLElement, column: number, row: number): void {
    element.style.gridColumn = String(column);
    element.style.gridRow = String(row);
}
function createChip(doc: Document, label: string, value: unknown): HTMLElement {
    const chip = doc.createElement('span');
    chip.className = `foresight-chip foresight-chip-${cssToken(label)}`;
    const key = doc.createElement('span');
    key.className = 'foresight-chip-label';
    key.textContent = label;
    const strong = doc.createElement('strong');
    strong.textContent = stringValue(value === undefined || value === null || value === '' ? '-' : value);
    chip.appendChild(key);
    chip.appendChild(strong);
    return chip;
}
function createCondensedActions(doc: Document, node: ForesightNode): HTMLElement {
    const wrap = doc.createElement('div');
    wrap.className = 'foresight-condensed-actions';
    if (node.scrollKey)
        setElementDatasetValue(wrap, 'foresightScrollKey', node.scrollKey);
    wrap.textContent = nonEmptyString(node.text) || '-';
    return wrap;
}
function createPlaceholderPanel(doc: Document): HTMLElement {
    const panel = doc.createElement('div');
    panel.className = 'foresight-placeholder-panel';
    panel.textContent = 'Branch target not scanned.';
    return panel;
}
function createStopPanel(doc: Document, stops: ForesightPathStop[]): HTMLElement {
    const panel = doc.createElement('div');
    panel.className = 'foresight-stop-panel';
    (Array.isArray(stops) ? stops : []).forEach((stop) => {
        const row = doc.createElement('div');
        row.className = 'foresight-stop-row';
        const code = doc.createElement('span');
        code.className = 'foresight-stop-code';
        code.textContent = stop.code !== null ? String(stop.code) : '???';
        const label = doc.createElement('span');
        label.className = 'foresight-stop-label';
        label.textContent = createStopReasonText(stop.stopReason, stop.stopReasonLabel);
        row.appendChild(code);
        row.appendChild(label);
        panel.appendChild(row);
    });
    return panel;
}
function createTruncatedPanel(doc: Document, count: number): HTMLElement {
    const panel = doc.createElement('div');
    panel.className = 'foresight-truncated-panel';
    panel.textContent = `${formatCount(count)} hidden actions`;
    return panel;
}
function createActionCard(doc: Document, node: ForesightNode, options: UnknownRecord): HTMLElement {
    const card = doc.createElement('div');
    card.className = [
        'foresight-panel-card',
        'foresight-action-card',
        `foresight-class-${cssToken(node.classification)}`,
        `foresight-action-${cssToken(node.action)}`,
    ].join(' ');
    if (node.scrollKey)
        setElementDatasetValue(card, 'foresightScrollKey', node.scrollKey);
    if (node.ownerKey)
        setElementDatasetValue(card, 'foresightOwnerKey', node.ownerKey);
    if (node.index !== null && node.index !== undefined) {
        setElementDatasetValue(card, 'foresightCommandIndex', String(node.index));
    }
    const listId = recordValue(node.listContext, 'listId');
    if (listId)
        setElementDatasetValue(card, 'foresightListId', stringValue(listId));
    const header = doc.createElement('div');
    header.className = 'foresight-action-header';
    header.appendChild(createCodeBadge(doc, node.code));
    const label = doc.createElement('div');
    label.className = 'foresight-action-label';
    label.textContent = node.label ?? '';
    header.appendChild(label);
    const classBadge = createClassBadge(doc, node.classification);
    if (classBadge)
        header.appendChild(classBadge);
    card.appendChild(header);
    const meta = doc.createElement('div');
    meta.className = 'foresight-action-meta';
    meta.appendChild(createMetaPart(doc, `#${node.index === null ? '-' : stringValue(node.index)}`));
    meta.appendChild(createMetaPart(doc, truthyOr(node.action, truthyOr(node.scanBehavior, '-'))));
    meta.appendChild(createMetaPart(doc, node.native ? 'native' : 'plugin'));
    if (node.stopReasonLabel || node.stopReason) {
        meta.appendChild(createMetaPart(doc, createStopReasonText(node.stopReason, node.stopReasonLabel), 'foresight-action-meta-stop'));
    }
    card.appendChild(meta);
    if (node.messageRecord) {
        const pill = createMessagePill(doc, node.messageRecord, node, options);
        if (pill) {
            const wrap = doc.createElement('div');
            wrap.className = 'foresight-message-pill';
            appendUnknownChild(wrap, pill);
            card.appendChild(wrap);
        }
    }
    const routeCommandActions = Array.isArray(node.routeCommandActions) ? node.routeCommandActions : [];
    if (routeCommandActions.length > 0)
        card.appendChild(createRouteList(doc, routeCommandActions));
    if (node.controlFlowTarget)
        card.appendChild(createControlFlowTarget(doc, node.controlFlowTarget));
    return card;
}
function createCurrentMessageSlot(doc: Document, record: UnknownRecord, options: UnknownRecord): HTMLElement {
    const slot = doc.createElement('div');
    slot.className = 'foresight-current-message-slot';
    slot.appendChild(createMessageNodeCard(doc, {
        scrollKey: createCurrentMessageScrollKey(record),
        messageRecord: record,
        ownerKey: '',
        index: null,
        listContext: {},
    }, options, true));
    return slot;
}
function createMessageNodeCard(doc: Document, node: ForesightNode, options: UnknownRecord, current = false): HTMLElement {
    const card = doc.createElement('div');
    card.className = [
        'foresight-panel-card',
        'foresight-message-node-card',
        current ? 'foresight-current-message-card' : '',
    ]
        .filter(Boolean)
        .join(' ');
    if (node.scrollKey)
        setElementDatasetValue(card, 'foresightScrollKey', node.scrollKey);
    if (node.ownerKey)
        setElementDatasetValue(card, 'foresightOwnerKey', node.ownerKey);
    if (node.index !== null && node.index !== undefined) {
        setElementDatasetValue(card, 'foresightCommandIndex', String(node.index));
    }
    const listId = recordValue(node.listContext, 'listId');
    if (listId)
        setElementDatasetValue(card, 'foresightListId', stringValue(listId));
    const pill = createMessagePill(doc, node.messageRecord, node, options);
    if (pill)
        appendUnknownChild(card, pill);
    return card;
}
function createMessagePill(doc: Document, record: UnknownRecord | null | undefined, node: ForesightNode, options: UnknownRecord): unknown {
    const factory = options['createTranslationPill'];
    if (record && typeof factory === 'function') {
        const pill: unknown = Reflect.apply(factory, undefined, [record, node]);
        if (pill)
            return pill;
    }
    return createStaticTranslationPill(doc, record);
}
function createStaticTranslationPill(doc: Document, record: UnknownRecord | null | undefined): HTMLElement | null {
    if (!record)
        return null;
    const metadata = recordOrEmpty(record['metadata']);
    const pill = doc.createElement('div');
    pill.className = [
        'foresight-text-pill',
        `text-status-${cssToken(truthyOr(record['status'], 'detected'))}`,
        'text-hook-message',
        'text-translation-neutral',
        metadata['syntheticForesightRecord'] ? 'foresight-text-pill-synthetic' : '',
    ]
        .filter(Boolean)
        .join(' ');
    const content = doc.createElement('span');
    content.className = 'foresight-text-pill-content';
    content.appendChild(createTextLine(doc, truthyOr(record['rawText'], truthyOr(record['original'], truthyOr(record['visibleText'], ''))), 'source'));
    content.appendChild(createTextLine(doc, truthyOr(record['translation'], truthyOr(record['translationReceived'], '')), 'translation'));
    pill.appendChild(content);
    return pill;
}
function createTextLine(doc: Document, value: unknown, kind: string): HTMLElement {
    const line = doc.createElement('span');
    line.className = `text-line ${cssToken(kind)}`;
    line.textContent = stringValue(truthyOr(value, ''));
    return line;
}
function createCurrentMessageScrollKey(record: UnknownRecord): string {
    const id = nonEmptyString(record['id']);
    if (id)
        return `current-message:${id}`;
    const text = nonEmptyString(record['normalizedSource']) ||
        nonEmptyString(record['translationSource']) ||
        nonEmptyString(record['rawText']) ||
        nonEmptyString(record['original']);
    return `current-message:${cssToken(text || 'active')}`;
}
function createCodeBadge(doc: Document, code: unknown): HTMLElement {
    const badge = doc.createElement('span');
    badge.className = 'foresight-code-badge';
    badge.textContent = code === null ? '???' : stringValue(code);
    return badge;
}
function createClassBadge(doc: Document, classification: unknown): HTMLElement | null {
    const classificationKey = stringValue(truthyOr(classification, '')).toLowerCase();
    if (classificationKey === 'linear' || classificationKey === 'external')
        return null;
    const badge = doc.createElement('span');
    badge.className = `foresight-class-badge foresight-class-badge-${cssToken(classification)}`;
    badge.textContent = classificationKey === 'terminal' ? 'end' : stringValue(truthyOr(classification, 'unknown'));
    return badge;
}
function createMetaPart(doc: Document, text: unknown, className = ''): HTMLElement {
    const part = doc.createElement('span');
    if (className)
        part.className = className;
    part.textContent = stringValue(text);
    return part;
}
function createStopReasonText(stopReason: unknown, stopReasonLabel: unknown): string {
    return nonEmptyString(stopReasonLabel) || nonEmptyString(stopReason) || 'stopped';
}
function createRouteList(doc: Document, routeActions: unknown[]): HTMLElement {
    const wrap = doc.createElement('div');
    wrap.className = 'foresight-route-list';
    routeActions.forEach((candidate) => {
        const action = recordOrEmpty(candidate);
        const row = doc.createElement('div');
        row.className = `foresight-route-row foresight-class-${cssToken(action['classification'])}`;
        const code = doc.createElement('span');
        code.className = 'foresight-route-code';
        code.textContent =
            action['code'] === null || action['code'] === undefined ? '???' : stringValue(action['code']);
        const label = doc.createElement('span');
        label.className = 'foresight-route-label';
        label.textContent = stringValue(truthyOr(action['label'], 'Unknown route command'));
        const classification = doc.createElement('span');
        classification.className = 'foresight-route-classification';
        classification.textContent = stringValue(truthyOr(action['classification'], 'unknown'));
        row.appendChild(code);
        row.appendChild(label);
        row.appendChild(classification);
        wrap.appendChild(row);
    });
    return wrap;
}
function createControlFlowTarget(doc: Document, target: unknown): HTMLElement {
    const wrap = doc.createElement('div');
    wrap.className = `foresight-control-flow-target foresight-control-flow-${cssToken(recordValue(target, 'kind'))}`;
    const key = doc.createElement('span');
    key.className = 'foresight-control-flow-key';
    key.textContent = formatControlFlowKind(recordValue(target, 'kind'));
    const value = doc.createElement('span');
    value.className = 'foresight-control-flow-value';
    value.textContent = formatControlFlowTarget(target);
    wrap.appendChild(key);
    wrap.appendChild(value);
    return wrap;
}
function formatTime(options: UnknownRecord, value: unknown): unknown {
    const formatter = options['formatTime'];
    return typeof formatter === 'function' ? Reflect.apply(formatter, undefined, [value]) : defaultFormatTime(value);
}
export function createEmpty(doc: Document, text: string): HTMLElement {
    const empty = doc.createElement('div');
    empty.className = 'empty';
    empty.textContent = text;
    return empty;
}
