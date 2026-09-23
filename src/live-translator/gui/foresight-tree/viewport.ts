import type { ForesightViewNode } from '../../foresight/view.js';
import { TIMELINE, layoutTree, connectorPath, type NodeSize } from './layout.js';
export interface TreeCard {
    readonly element: HTMLElement;
    readonly content: HTMLElement;
}
export function mountTreeViewport(scroll: HTMLElement, canvas: HTMLElement, nodes: readonly ForesightViewNode[], cards: ReadonlyMap<number, TreeCard>, messagesOnly: boolean): () => void {
    const doc = canvas.ownerDocument;
    const win = doc.defaultView;
    const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'foresight-edges');
    svg.setAttribute('aria-hidden', 'true');
    const edges = nodes.flatMap((node) => node.next.map((target) => {
        const path = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
        svg.appendChild(path);
        return { from: node.id, to: target, path };
    }));
    canvas.insertBefore(svg, canvas.firstElementChild);
    const sizes = new Map<number, NodeSize>();
    let active = true, applied = false, previousCap = 0;
    function resize(): void {
        if (!active)
            return;
        const style = win?.getComputedStyle(scroll);
        const cssMax = Number.parseFloat(style?.maxHeight ?? '');
        const border = (Number.parseFloat(style?.borderTopWidth ?? '') || 0) +
            (Number.parseFloat(style?.borderBottomWidth ?? '') || 0);
        const maxHeight = Number.isFinite(cssMax) ? Math.max(0, cssMax - TIMELINE.scrollbar - border) : Infinity;
        let changed = !applied || previousCap !== maxHeight;
        previousCap = maxHeight;
        for (const [id, card] of cards) {
            const rect = card.element.getBoundingClientRect(), content = card.content.getBoundingClientRect();
            if (rect.height <= 0)
                continue;
            const size = { height: Math.ceil(rect.height), portY: content.top - rect.top + content.height / 2 };
            const previous = sizes.get(id);
            if (previous?.height === size.height && previous.portY === size.portY)
                continue;
            sizes.set(id, size);
            changed = true;
        }
        if (!changed)
            return;
        applied = true;
        const layout = layoutTree(nodes, maxHeight, sizes, messagesOnly);
        scroll.style.height = `${String(layout.height + TIMELINE.scrollbar + border)}px`;
        canvas.dataset['columnCount'] = String(layout.columnCount);
        canvas.style.width = `${String(layout.width)}px`;
        canvas.style.height = `${String(layout.height)}px`;
        svg.setAttribute('width', String(layout.width));
        svg.setAttribute('height', String(layout.height));
        const positioned = new Map(layout.nodes.map((item) => [item.node.id, item]));
        for (const item of layout.nodes) {
            const card = cards.get(item.node.id);
            if (card === undefined)
                continue;
            card.element.dataset['column'] = String(item.column);
            card.element.style.left = `${String(item.x)}px`;
            card.element.style.top = `${String(item.y)}px`;
        }
        for (const { from, to, path } of edges) {
            const start = positioned.get(from), end = positioned.get(to);
            if (start !== undefined && end !== undefined)
                path.setAttribute('d', connectorPath(start, end));
        }
    }
    resize();
    win?.addEventListener('resize', resize);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
    for (const card of cards.values()) {
        observer?.observe(card.element);
        observer?.observe(card.content);
    }
    return () => {
        active = false;
        observer?.disconnect();
        win?.removeEventListener('resize', resize);
    };
}
