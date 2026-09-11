interface DatasetElement {
    readonly dataset?: Record<string, string | undefined>;
    setAttribute(name: string, value: string): void;
    getAttribute(name: string): string | null;
}
export interface ElementContentRect {
    left: number;
    top: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
}
function datasetAttributeName(key: string): string {
    return `data-${key.replace(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`)}`;
}
export function setElementDatasetValue(element: DatasetElement | null, key: string, value: string): void {
    if (!element)
        return;
    if (element.dataset) {
        element.dataset[key] = value;
    }
    else {
        element.setAttribute(datasetAttributeName(key), value);
    }
}
export function getElementDatasetValue(element: DatasetElement | null, key: string): string {
    if (!element)
        return '';
    const datasetValue = element.dataset?.[key];
    if (datasetValue !== undefined)
        return datasetValue;
    return element.getAttribute(datasetAttributeName(key)) ?? '';
}
export function createSvgElement(documentValue: Document, tagName: string): SVGElement {
    return documentValue.createElementNS('http://www.w3.org/2000/svg', tagName);
}
export function roundCoordinate(value: unknown): number {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.round(numeric * 10) / 10 : 0;
}
export function getActionCards(container: ParentNode | null): Element[] {
    if (!container)
        return [];
    try {
        return Array.from(container.querySelectorAll('.foresight-panel-card'));
    }
    catch {
        return [];
    }
}
export function findActionCardByScrollKey(container: ParentNode | null, key: string): Element | null {
    if (!key)
        return null;
    return getActionCards(container).find((card) => getActionCardScrollKey(card) === key) ?? null;
}
export function getActionCardScrollKey(card: DatasetElement | null): string {
    if (!card)
        return '';
    const datasetValue = card.dataset?.['foresightScrollKey'];
    if (datasetValue)
        return datasetValue;
    return card.getAttribute('data-foresight-scroll-key') ?? '';
}
export function getElementTopRelativeToScroll(element: Element | null, scroll: Element | null): number | null {
    if (!element || !scroll)
        return null;
    const elementRect = element.getBoundingClientRect();
    const scrollRect = scroll.getBoundingClientRect();
    return finiteMetric(elementRect.top) - finiteMetric(scrollRect.top);
}
export function getElementLeftRelativeToScroll(element: Element | null, scroll: Element | null): number | null {
    if (!element || !scroll)
        return null;
    const elementRect = element.getBoundingClientRect();
    const scrollRect = scroll.getBoundingClientRect();
    return finiteMetric(elementRect.left) - finiteMetric(scrollRect.left);
}
export function getElementHeight(element: Element | null): number {
    if (!element)
        return 0;
    const rect = element.getBoundingClientRect();
    const explicitHeight = finiteMetric(rect.height, Number.NaN);
    if (Number.isFinite(explicitHeight) && explicitHeight > 0)
        return explicitHeight;
    return Math.max(0, finiteMetric(rect.bottom) - finiteMetric(rect.top));
}
export function getElementWidth(element: Element | null): number {
    if (!element)
        return 0;
    const rect = element.getBoundingClientRect();
    const explicitWidth = finiteMetric(rect.width, Number.NaN);
    if (Number.isFinite(explicitWidth) && explicitWidth > 0)
        return explicitWidth;
    return Math.max(0, finiteMetric(rect.right) - finiteMetric(rect.left));
}
export function clampScrollTop(value: unknown, max: number): number {
    const numeric = finiteScrollMetric(value);
    return max > 0 ? Math.min(numeric, max) : numeric;
}
export function clampScrollLeft(value: unknown, max: number): number {
    const numeric = finiteScrollMetric(value);
    return max > 0 ? Math.min(numeric, max) : numeric;
}
export function getMaxScrollTop(scroll: HTMLElement | null): number {
    const scrollHeight = finiteScrollMetric(scroll?.scrollHeight);
    const clientHeight = finiteScrollMetric(scroll?.clientHeight);
    return Math.max(0, scrollHeight - clientHeight);
}
export function getMaxScrollLeft(scroll: HTMLElement | null): number {
    const scrollWidth = finiteScrollMetric(scroll?.scrollWidth);
    const clientWidth = finiteScrollMetric(scroll?.clientWidth);
    return Math.max(0, scrollWidth - clientWidth);
}
export function finiteScrollMetric(value: unknown): number {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
}
export function finiteMetric(value: unknown, fallback = 0): number {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
}
export function getElementContentRect(element: Element | null, scroll: HTMLElement | null): ElementContentRect | null {
    if (!element || !scroll)
        return null;
    const rect = element.getBoundingClientRect();
    const scrollRect = scroll.getBoundingClientRect();
    const left = finiteMetric(rect.left) - finiteMetric(scrollRect.left) + finiteScrollMetric(scroll.scrollLeft);
    const top = finiteMetric(rect.top) - finiteMetric(scrollRect.top) + finiteScrollMetric(scroll.scrollTop);
    const width = Math.max(0, finiteMetric(rect.width, finiteMetric(rect.right) - finiteMetric(rect.left)));
    const height = Math.max(0, finiteMetric(rect.height, finiteMetric(rect.bottom) - finiteMetric(rect.top)));
    return {
        left,
        top,
        right: left + width,
        bottom: top + height,
        width,
        height,
    };
}
