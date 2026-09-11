import { isGuiHtmlElement } from '../types.js';
export function getTextRecordDetailInsertIndex(container: HTMLElement, activeIndex: number, recordCount: number): number {
    const flexRowEndIndex = getTextRecordFlexRowEndIndex(container, activeIndex);
    if (flexRowEndIndex >= activeIndex)
        return Math.min(recordCount - 1, flexRowEndIndex);
    const columns = getTextRecordGridColumnCount(container);
    const rowEndIndex = activeIndex + (columns - ((activeIndex % columns) + 1));
    return Math.min(recordCount - 1, rowEndIndex);
}
export function getTextRecordFlexRowEndIndex(container: HTMLElement, activeIndex: number): number {
    if (activeIndex < 0)
        return -1;
    const records = Array.from(container.children).filter((node): node is HTMLElement => isGuiHtmlElement(node) && node.classList.contains('text-record'));
    const activeRecord = records[activeIndex];
    if (!activeRecord)
        return -1;
    const rowTop = activeRecord.offsetTop;
    let rowEndIndex = activeIndex;
    for (let index = activeIndex + 1; index < records.length; index += 1) {
        const record = records[index];
        if (!record || Math.abs(record.offsetTop - rowTop) > 1)
            break;
        rowEndIndex = index;
    }
    return rowEndIndex;
}
export function getTextRecordGridColumnCount(container: HTMLElement): number {
    try {
        const style = window.getComputedStyle(container);
        const columns = style.gridTemplateColumns.trim();
        if (!columns || columns === 'none')
            return 1;
        return Math.max(1, columns.split(/\s+/u).filter(Boolean).length);
    }
    catch {
        return 1;
    }
}
