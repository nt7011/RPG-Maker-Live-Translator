import './model-types.js';
import { appendTimeline, createEmpty, createOverview } from './dom.js';
import { clampScrollLeft, clampScrollTop, findActionCardByScrollKey, finiteMetric, finiteScrollMetric, getActionCardScrollKey, getActionCards, getElementHeight, getElementLeftRelativeToScroll, getElementTopRelativeToScroll, getElementWidth, getMaxScrollLeft, getMaxScrollTop, } from './dom-utils.js';
import { createTimelineLayout } from './layout.js';
import type { TimelineItem, TimelineLayout } from './layout.js';
import { serializeGuiValueOutcome } from '../projection.js';
import { createModel } from './model.js';
import type { ForesightBranch, ForesightModel, ForesightNode, UnknownRecord } from './model-types.js';
import { finiteNumber, nonEmptyString, stringValue } from './utils.js';
const ACTIVE_SCROLL_REFRESH_GRACE_MS = 900;
const RENDER_STATE_PROPERTY = '__liveTranslatorForesightRenderState';
const SCROLL_TRACKED_PROPERTY = '__liveTranslatorForesightScrollTracked';
const LAST_SCROLL_AT_PROPERTY = '__liveTranslatorForesightLastScrollAt';
interface RenderKeys {
    structureComplete: boolean;
    structureKey: string;
    contentComplete: boolean;
    contentKey: string;
}
interface ScrollAnchor {
    key: string;
    offsetTop: number;
    offsetLeft: number | null;
}
interface ScrollState {
    top: number;
    left: number;
    anchors: ScrollAnchor[];
    atBottom: boolean;
    atRight: boolean;
}
interface MessageRecordRenderEntry {
    scrollKey: string;
    record: UnknownRecord;
}
function isUnknownRecord(value: unknown): value is UnknownRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function recordOrEmpty(value: unknown): UnknownRecord {
    return isUnknownRecord(value) ? value : {};
}
function propertyValue(value: object, key: PropertyKey): unknown {
    return Reflect.get(value, key);
}
function ownDataValue(value: object, key: PropertyKey): unknown {
    try {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        return descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value') ? descriptor.value : undefined;
    }
    catch {
        return undefined;
    }
}
export function render(container: HTMLElement | null | undefined, options: unknown = {}): ForesightModel {
    const normalizedOptions = recordOrEmpty(options);
    const model = createModel(ownDataValue(normalizedOptions, 'snapshot'), normalizedOptions);
    if (!container)
        return model;
    const doc = container.ownerDocument;
    const scrollState = captureScrollState(container);
    if (!model.hasSnapshot || !model.scan) {
        clearElement(container);
        container.appendChild(createEmpty(doc, 'No foresight scan recorded.'));
        setContainerRenderState(container, null);
        return model;
    }
    const layout = createTimelineLayout(model);
    const renderKeys = createRenderKeys(model, layout, normalizedOptions);
    const previousState = getContainerRenderState(container);
    const existingScroll = findForesightScroll(container);
    const scroll = existingScroll ?? doc.createElement('div');
    scroll.className = model.messagesOnly
        ? 'foresight-panel-scroll foresight-panel-scroll-messages-only'
        : 'foresight-panel-scroll';
    bindScrollActivityTracker(scroll);
    syncForesightShell(container, model.messagesOnly ? null : createOverview(doc, model, normalizedOptions), scroll);
    syncScrollLayoutMetrics(scroll);
    const structureChanged = !previousState ||
        !existingScroll ||
        !previousState.structureComplete ||
        !renderKeys.structureComplete ||
        previousState.structureKey !== renderKeys.structureKey;
    const contentChanged = !previousState?.contentComplete ||
        !renderKeys.contentComplete ||
        previousState.contentKey !== renderKeys.contentKey;
    const deferDynamicRefresh = !structureChanged &&
        contentChanged &&
        previousState.contentComplete &&
        renderKeys.contentComplete &&
        isScrollRecentlyActive(scroll);
    if (!structureChanged && (!contentChanged || deferDynamicRefresh))
        return model;
    clearElement(scroll);
    const hasCurrentMessage = Boolean(model.currentMessageRecord);
    if (model.nodes.length === 0 && !hasCurrentMessage) {
        scroll.appendChild(createEmpty(doc, 'No command actions recorded.'));
    }
    else {
        appendTimeline(doc, scroll, layout, normalizedOptions);
    }
    syncScrollLayoutMetrics(scroll);
    restoreScrollState(scroll, scrollState);
    setContainerRenderState(container, renderKeys);
    return model;
}
function syncScrollLayoutMetrics(scroll: HTMLElement): void {
    const width = finiteScrollMetric(scroll.clientWidth);
    const setProperty: unknown = Reflect.get(scroll.style, 'setProperty');
    if (!width || typeof setProperty !== 'function')
        return;
    Reflect.apply(setProperty, scroll.style, ['--foresight-panel-width', `${String(Math.round(width))}px`]);
}
function syncForesightShell(container: HTMLElement, overview: HTMLElement | null, scroll: HTMLElement): void {
    const currentOverview = findForesightOverview(container);
    if (currentOverview)
        removeElement(currentOverview);
    if (scroll.parentNode !== container)
        container.appendChild(scroll);
    if (overview)
        container.insertBefore(overview, scroll);
    getElementChildren(container).forEach((child) => {
        if (child !== overview && child !== scroll)
            removeElement(child);
    });
}
function findForesightOverview(container: ParentNode): HTMLElement | null {
    return container.querySelector<HTMLElement>('.foresight-overview');
}
function findForesightScroll(container: ParentNode): HTMLElement | null {
    return container.querySelector<HTMLElement>('.foresight-panel-scroll');
}
function getContainerRenderState(container: HTMLElement): RenderKeys | null {
    const state = propertyValue(container, RENDER_STATE_PROPERTY);
    if (!isUnknownRecord(state))
        return null;
    const structureKey = state['structureKey'];
    const structureComplete = state['structureComplete'];
    const contentKey = state['contentKey'];
    const contentComplete = state['contentComplete'];
    return typeof structureKey === 'string' &&
        typeof structureComplete === 'boolean' &&
        typeof contentKey === 'string' &&
        typeof contentComplete === 'boolean'
        ? { structureComplete, structureKey, contentComplete, contentKey }
        : null;
}
function setContainerRenderState(container: HTMLElement, state: RenderKeys | null): void {
    Reflect.set(container, RENDER_STATE_PROPERTY, state);
}
function getElementChildren(element: Element | null): Element[] {
    if (!element)
        return [];
    try {
        return Array.from(element.children);
    }
    catch {
        return [];
    }
}
function clearElement(element: Element | null): void {
    if (!element)
        return;
    const replaceChildren: unknown = propertyValue(element, 'replaceChildren');
    if (typeof replaceChildren === 'function') {
        Reflect.apply(replaceChildren, element, []);
        return;
    }
    if (typeof propertyValue(element, 'innerHTML') === 'string') {
        Reflect.set(element, 'innerHTML', '');
        return;
    }
    getElementChildren(element).forEach(removeElement);
}
function removeElement(element: Element): void {
    const parent = element.parentNode;
    if (!parent)
        return;
    const removeChild: unknown = propertyValue(parent, 'removeChild');
    if (typeof removeChild === 'function') {
        Reflect.apply(removeChild, parent, [element]);
        return;
    }
    const children = propertyValue(parent, 'children');
    if (Array.isArray(children)) {
        Reflect.set(parent, 'children', children.filter((child) => child !== element));
        Reflect.set(element, 'parentNode', null);
    }
}
function bindScrollActivityTracker(scroll: HTMLElement): void {
    if (propertyValue(scroll, SCROLL_TRACKED_PROPERTY) === true)
        return;
    const markActive = (): void => {
        Reflect.set(scroll, LAST_SCROLL_AT_PROPERTY, nowMs());
    };
    Reflect.set(scroll, SCROLL_TRACKED_PROPERTY, true);
    try {
        scroll.addEventListener('scroll', markActive, { passive: true });
        scroll.addEventListener('wheel', markActive, { passive: true });
        scroll.addEventListener('touchmove', markActive, { passive: true });
        scroll.addEventListener('pointerdown', markActive, { passive: true });
    }
    catch {
    }
}
function isScrollRecentlyActive(scroll: HTMLElement): boolean {
    const lastActiveAt = Number(propertyValue(scroll, LAST_SCROLL_AT_PROPERTY));
    return Number.isFinite(lastActiveAt) && nowMs() - lastActiveAt < ACTIVE_SCROLL_REFRESH_GRACE_MS;
}
function nowMs(): number {
    return Date.now();
}
function createRenderKeys(model: ForesightModel, layout: TimelineLayout, options: UnknownRecord): RenderKeys {
    const structure = createModelStructureRenderValue(model);
    const panelLayout = createTimelineLayoutRenderValue(layout);
    const records = collectMessageRecordRenderValues(model.nodes);
    const dynamicRenderKey = ownDataValue(options, 'dynamicRenderKey');
    const content = {
        structure,
        panelLayout,
        dynamic: records.length > 0 ? (dynamicRenderKey ?? null) : null,
        currentMessageRecord: createMessageRecordRenderValue(model.currentMessageRecord),
        records,
    };
    const structureKey = createBoundedRenderKey(structure);
    const contentKey = createBoundedRenderKey(content);
    return {
        structureComplete: structureKey.complete,
        structureKey: structureKey.key,
        contentComplete: contentKey.complete,
        contentKey: contentKey.key,
    };
}
function createBoundedRenderKey(value: unknown): {
    complete: boolean;
    key: string;
} {
    try {
        const outcome = serializeGuiValueOutcome(value);
        return { complete: outcome.complete, key: outcome.text };
    }
    catch {
        return incompleteRenderKey();
    }
}
function incompleteRenderKey(): {
    complete: false;
    key: string;
} {
    return { complete: false, key: '{"$rmltProjection":"unreadable"}' };
}
function createTimelineLayoutRenderValue(layout: TimelineLayout): unknown {
    return {
        columnCount: finiteNumber(layout.columnCount),
        rows: (Array.isArray(layout.rows) ? layout.rows : []).map((row) => ({
            rowIndex: finiteNumber(row.rowIndex),
            lane: finiteNumber(row.lane),
            items: (Array.isArray(row.items) ? row.items : []).map(createTimelineItemRenderValue),
        })),
    };
}
function createTimelineItemRenderValue(item: TimelineItem): unknown {
    const node = item.kind === 'node' || item.kind === 'condensed' ? item.node : null;
    return {
        kind: nonEmptyString(item.kind),
        column: finiteNumber(item.column),
        branchLabel: nonEmptyString(item.branchLabel),
        scrollKey: nonEmptyString(node?.scrollKey),
        stops: item.kind === 'stop' ? item.stops : null,
        count: finiteNumber(item.kind === 'truncated' ? item.count : undefined),
    };
}
function createModelStructureRenderValue(model: ForesightModel): unknown {
    const currentMessageRecordId = model.currentMessageRecord?.['id'];
    return {
        messagesOnly: model.messagesOnly,
        actionLimit: model.actionLimit,
        actionsTruncated: model.actionsTruncated,
        condensedActionCount: model.condensedActionCount,
        currentMessageRecordId: currentMessageRecordId ? stringValue(currentMessageRecordId) : '',
        nodes: createNodeStructureRenderValues(model.nodes),
    };
}
function createNodeStructureRenderValues(nodes: ForesightNode[] | null | undefined): unknown[] {
    return (Array.isArray(nodes) ? nodes : []).map(createNodeStructureRenderValue);
}
function createNodeStructureRenderValue(node: ForesightNode | null | undefined): unknown {
    if (!node)
        return null;
    if (node.condensed === true) {
        return {
            condensed: true,
            scrollKey: nonEmptyString(node.scrollKey),
            text: nonEmptyString(node.text),
            count: finiteNumber(node.count),
            actions: node.actions ?? null,
        };
    }
    if (node.messageOnlyJunction === true) {
        return {
            messageOnlyJunction: true,
            scrollKey: nonEmptyString(node.scrollKey),
            branchDepth: finiteNumber(node.branchDepth),
            branchPath: node.branchPath ?? null,
            listContext: node.listContext ?? null,
            ownerKey: nonEmptyString(node.ownerKey),
            branches: (Array.isArray(node.branches) ? node.branches : []).map(createBranchStructureRenderValue),
            mergeGroups: node.mergeGroups ?? null,
        };
    }
    const messageRecordId = node.messageRecord?.['id'];
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
        branchPath: node.branchPath ?? null,
        listContext: node.listContext ?? null,
        routeCommandActions: node.routeCommandActions ?? null,
        controlFlowTarget: node.controlFlowTarget ?? null,
        messageRecordId: messageRecordId ? stringValue(messageRecordId) : '',
        ownerKey: nonEmptyString(node.ownerKey),
        isBranching: node.isBranching === true,
        branches: (Array.isArray(node.branches) ? node.branches : []).map(createBranchStructureRenderValue),
    };
}
function createBranchStructureRenderValue(branch: ForesightBranch | null | undefined): unknown {
    return {
        label: nonEmptyString(branch?.label),
        branchIndex: finiteNumber(branch?.branchIndex),
        branchPath: branch?.branchPath ?? null,
        startIndex: finiteNumber(branch?.startIndex),
        endIndex: finiteNumber(branch?.endIndex),
        joinIndex: finiteNumber(branch?.joinIndex),
        actionCount: finiteNumber(branch?.actionCount),
        actionsTruncated: finiteNumber(branch?.actionsTruncated),
        stops: branch?.stops ?? null,
        nodes: createNodeStructureRenderValues(branch?.nodes),
    };
}
function collectMessageRecordRenderValues(nodes: ForesightNode[] | null | undefined, records: MessageRecordRenderEntry[] = []): MessageRecordRenderEntry[] {
    (Array.isArray(nodes) ? nodes : []).forEach((node) => {
        if (node.condensed === true)
            return;
        if (node.messageRecord) {
            records.push({
                scrollKey: nonEmptyString(node.scrollKey),
                record: createMessageRecordRenderValue(node.messageRecord),
            });
        }
        (Array.isArray(node.branches) ? node.branches : []).forEach((branch) => {
            collectMessageRecordRenderValues(branch.nodes, records);
        });
    });
    return records;
}
function createMessageRecordRenderValue(record: UnknownRecord | null | undefined): UnknownRecord {
    const source = recordOrEmpty(record);
    return {
        id: source['id'] ? stringValue(source['id']) : '',
        status: source['status'] ? stringValue(source['status']) : '',
        hook: source['hook'] ? stringValue(source['hook']) : '',
        hookKey: source['hookKey'] ? stringValue(source['hookKey']) : '',
        rawText: source['rawText'] ? stringValue(source['rawText']) : '',
        original: source['original'] ? stringValue(source['original']) : '',
        visibleText: source['visibleText'] ? stringValue(source['visibleText']) : '',
        translation: source['translation'] ? stringValue(source['translation']) : '',
        translationReceived: source['translationReceived'] ? stringValue(source['translationReceived']) : '',
        priority: source['priority'] ?? null,
        metadata: source['metadata'] ?? null,
    };
}
function captureScrollState(container: ParentNode): ScrollState | null {
    const scroll = findForesightScroll(container);
    if (!scroll)
        return null;
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
function restoreScrollState(scroll: HTMLElement, state: ScrollState | null): void {
    if (!state)
        return;
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
        const element = findActionCardByScrollKey(scroll, anchor.key);
        if (!element)
            continue;
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
        if (restoredTop && restoredLeft)
            return;
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
function captureScrollAnchors(scroll: HTMLElement): ScrollAnchor[] {
    const cards = getActionCards(scroll);
    if (cards.length === 0)
        return [];
    const viewportHeight = finiteScrollMetric(scroll.clientHeight);
    const viewportWidth = finiteScrollMetric(scroll.clientWidth);
    const anchors: ScrollAnchor[] = [];
    cards.forEach((card) => {
        if (anchors.length >= 8)
            return;
        const key = getActionCardScrollKey(card);
        if (!key)
            return;
        const offsetTop = getElementTopRelativeToScroll(card, scroll);
        if (offsetTop === null)
            return;
        const height = getElementHeight(card);
        if (offsetTop + height < -2)
            return;
        if (anchors.length > 0 && viewportHeight > 0 && offsetTop > viewportHeight + 2)
            return;
        const offsetLeft = getElementLeftRelativeToScroll(card, scroll);
        if (viewportWidth > 0 && offsetLeft !== null) {
            const width = getElementWidth(card);
            if (offsetLeft + width < -2 || offsetLeft > viewportWidth + 2)
                return;
        }
        anchors.push({ key, offsetTop, offsetLeft });
    });
    return anchors;
}
