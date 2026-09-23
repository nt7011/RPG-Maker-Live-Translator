import { refs, state } from '../state.js';
import { applyFoldedPanelDefault } from '../core.js';
import { render, clear } from '../../foresight-tree/renderer.js';
import { describeStop } from '../../foresight-tree/model.js';
const bound = new WeakSet<HTMLElement>();
export function bindForesightPanel(): void {
    const toggle = refs['foresight-messages-only'] as HTMLInputElement | undefined;
    if (toggle === undefined || bound.has(toggle))
        return;
    bound.add(toggle);
    toggle.checked = state.foresightMessagesOnly;
    toggle.addEventListener('change', () => {
        state.foresightMessagesOnly = toggle.checked;
        renderForesightPanel();
    });
}
export function renderForesightPanel(): void {
    const panel = refs['foresight-panel'], container = refs['foresight-tree'];
    if (panel === undefined || container === undefined)
        return;
    panel.hidden = false;
    const snapshot = state.runtimeTextRecords, view = snapshot?.foresight ?? null;
    const connected = snapshot?.active === true;
    const hasContent = connected && (view?.graph.nodes.length ?? 0) > 0;
    applyFoldedPanelDefault('foresight-panel', 'foresight', hasContent, hasContent);
    const summary = refs['foresight-summary'];
    if (summary !== undefined)
        summary.textContent = !connected
            ? 'Waiting for runtime'
            : view === null
                ? 'Inactive'
                : view.graph.projection?.state === 'building'
                    ? 'Building message view…'
                    : view.state;
    const metrics = refs['foresight-metrics'];
    if (metrics !== undefined)
        metrics.textContent =
            view?.stats === undefined || view.stats === null
                ? ''
                : `${view.stats.candidates.toLocaleString()} candidates · ${view.prepared.toLocaleString()} prepared · ${view.failed.toLocaleString()} failed · ${view.stats.reads.toLocaleString()} commands inspected`;
    const limits = refs['foresight-limits'];
    if (limits !== undefined) {
        const stops = Object.entries(view?.stats?.stops ?? {})
            .filter(([name, count]) => name !== 'end' && count > 0)
            .map(([name, count]) => `${name}: ${String(count)}`);
        const projection = view?.graph.projection;
        const reduction = projection?.state === 'limited'
            ? 'Message view reached its processing limit; paths remain unknown.'
            : projection != null && projection.omittedNodes > 0
                ? `${String(projection.omittedNodes)} message-view nodes omitted.`
                : '';
        const truncated = view?.graph.truncated ? 'The scan view is capped; some future paths remain unknown.' : '';
        const last = view?.stats?.lastStop;
        limits.textContent = [
            reduction,
            truncated,
            stops.length > 0 ? `Scan stops — ${stops.join(', ')}` : '',
            last && last.reason !== 'end' ? describeStop(last) : '',
        ]
            .filter(Boolean)
            .join(' ');
        limits.hidden = !limits.textContent;
    }
    const copy = refs['foresight-copy'];
    if (copy !== undefined)
        (copy as HTMLButtonElement).disabled = !connected || view === null;
    if (!connected) {
        clear(container);
        container.replaceChildren();
        const empty = container.ownerDocument.createElement('p');
        empty.className = 'empty';
        empty.textContent = 'Waiting for the current runtime feed.';
        container.appendChild(empty);
        return;
    }
    const current = snapshot.records.find((record) => record.textId === view?.anchor?.textId) ?? null;
    render(container, view, view?.showSpoilers === true, snapshot.generation, state.foresightMessagesOnly, current);
}
