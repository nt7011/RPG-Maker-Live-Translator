// Translator monitor DOM builder helpers.
// Keep these helpers small and markup-oriented so feature files stay readable.
'use strict';

function createTextElement(tagName, className, text) {
    const element = document.createElement(tagName);
    if (className) element.className = className;
    element.textContent = text === undefined || text === null ? '' : String(text);
    return element;
}

function createEmptyState(text, className = 'empty') {
    return createTextElement('div', className, text || '');
}

function appendEmptyState(container, text, className = 'empty') {
    if (!container) return null;
    const empty = createEmptyState(text, className);
    container.appendChild(empty);
    return empty;
}

function setToneText(element, baseClassName, tone, value) {
    if (!element) return;
    element.className = `${baseClassName} ${tone}`;
    element.textContent = value;
}

function createStatusPill(value, tone, className = 'status') {
    const pill = createTextElement('span', `${className} ${tone}`, value);
    return pill;
}

function createMetadataGrid() {
    const grid = document.createElement('div');
    grid.className = 'text-meta-grid';
    return grid;
}

function appendMetadataItem(container, label, value) {
    const item = document.createElement('div');
    item.className = 'text-meta-item';
    item.dataset.metaLabel = String(label || '');
    item.appendChild(createTextElement('span', '', label));
    item.appendChild(createTextElement(
        'strong',
        '',
        value === undefined || value === null || value === '' ? '-' : value
    ));
    container.appendChild(item);
    return item;
}

function createTitledContainer(className, titleText, titleClassName = 'history-title') {
    const container = document.createElement('div');
    container.className = className;
    container.appendChild(createTextElement('div', titleClassName, titleText || 'Details'));
    return container;
}

function createHistoryContainer(titleText = 'History') {
    return createTitledContainer('history-list', titleText, 'history-title');
}

function createHistoryEmpty(text) {
    return createEmptyState(text, 'history-empty');
}

function createHistoryRow(options = {}) {
    const row = document.createElement('div');
    row.className = 'history-row';
    row.appendChild(createTextElement('span', 'history-time', options.timeText || '-'));

    const body = document.createElement('div');
    body.className = 'history-body';
    body.appendChild(createTextElement('strong', '', options.labelText || 'event'));
    if (options.messageText) body.appendChild(createTextElement('span', '', options.messageText));
    if (options.detailsText) body.appendChild(createTextElement('code', '', options.detailsText));
    row.appendChild(body);
    return row;
}

function createTitledMetaHeader(options = {}) {
    const header = document.createElement('div');
    header.className = options.className || 'section-title';
    header.appendChild(createTextElement(options.titleTag || 'h2', '', options.titleText || 'Details'));
    if (options.metaText !== undefined) {
        header.appendChild(createTextElement(options.metaTag || 'span', options.metaClassName || '', options.metaText || '-'));
    }
    return header;
}
