import { falsyFallback, stringValue } from '../types.js';
interface HistoryRowOptions {
    timeText?: unknown;
    labelText?: unknown;
    messageText?: unknown;
    detailsText?: unknown;
}
interface TitledMetaHeaderOptions {
    className?: string;
    titleTag?: string;
    titleText?: unknown;
    metaTag?: string;
    metaClassName?: string;
    metaText?: unknown;
}
export function createTextElement(tagName: string, className: string, text: unknown): HTMLElement {
    const element = document.createElement(tagName);
    if (className)
        element.className = className;
    element.textContent = text === undefined || text === null ? '' : stringValue(text);
    return element;
}
export function createEmptyState(text: unknown, className = 'empty'): HTMLElement {
    return createTextElement('div', className, falsyFallback(text, ''));
}
export function appendEmptyState(container: HTMLElement | null | undefined, text: unknown, className = 'empty'): HTMLElement | null {
    if (!container)
        return null;
    const empty = createEmptyState(text, className);
    container.appendChild(empty);
    return empty;
}
export function setToneText(element: HTMLElement | null | undefined, baseClassName: string, tone: string, value: unknown): void {
    if (!element)
        return;
    element.className = `${baseClassName} ${tone}`;
    element.textContent = stringValue(value);
}
export function createStatusPill(value: unknown, tone: string, className = 'status'): HTMLElement {
    const pill = createTextElement('span', `${className} ${tone}`, value);
    return pill;
}
export function createMetadataGrid(): HTMLElement {
    const grid = document.createElement('div');
    grid.className = 'text-meta-grid';
    return grid;
}
export function appendMetadataItem(container: HTMLElement, label: unknown, value: unknown): HTMLElement {
    const item = document.createElement('div');
    item.className = 'text-meta-item';
    item.dataset['metaLabel'] = stringValue(falsyFallback(label, ''));
    item.appendChild(createTextElement('span', '', label));
    item.appendChild(createTextElement('strong', '', value === undefined || value === null || value === '' ? '-' : value));
    container.appendChild(item);
    return item;
}
export function createTitledContainer(className: string, titleText: unknown, titleClassName = 'history-title'): HTMLElement {
    const container = document.createElement('div');
    container.className = className;
    container.appendChild(createTextElement('div', titleClassName, falsyFallback(titleText, 'Details')));
    return container;
}
export function createHistoryContainer(titleText: unknown = 'History'): HTMLElement {
    return createTitledContainer('history-list', titleText, 'history-title');
}
export function createHistoryEmpty(text: unknown): HTMLElement {
    return createEmptyState(text, 'history-empty');
}
export function createHistoryRow(options: HistoryRowOptions = {}): HTMLElement {
    const row = document.createElement('div');
    row.className = 'history-row';
    row.appendChild(createTextElement('span', 'history-time', falsyFallback(options.timeText, '-')));
    const body = document.createElement('div');
    body.className = 'history-body';
    body.appendChild(createTextElement('strong', '', falsyFallback(options.labelText, 'event')));
    if (options.messageText)
        body.appendChild(createTextElement('span', '', options.messageText));
    if (options.detailsText)
        body.appendChild(createTextElement('code', '', options.detailsText));
    row.appendChild(body);
    return row;
}
export function createTitledMetaHeader(options: TitledMetaHeaderOptions = {}): HTMLElement {
    const header = document.createElement('div');
    header.className = falsyFallback(options.className, 'section-title');
    header.appendChild(createTextElement(falsyFallback(options.titleTag, 'h2'), '', falsyFallback(options.titleText, 'Details')));
    if (options.metaText !== undefined) {
        header.appendChild(createTextElement(falsyFallback(options.metaTag, 'span'), falsyFallback(options.metaClassName, ''), falsyFallback(options.metaText, '-')));
    }
    return header;
}
