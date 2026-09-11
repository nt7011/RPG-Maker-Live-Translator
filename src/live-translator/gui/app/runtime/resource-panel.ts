import { refs, state } from '../state.js';
import { createTextElement } from '../dom/builders.js';
export function formatResourceValue(value: number | null, unit: string): string {
    if (value === null)
        return '—';
    if (unit === 'bytes')
        return value < 1024 ? `${String(value)} B` : `${(value / 1048576).toFixed(2)} MiB`;
    return `${value.toLocaleString('en-US')}${unit === 'px' ? ' px' : ''}`;
}
export function renderResourcePanel(): void {
    const panel = refs['resource-panel'], body = refs['resource-details'], summary = refs['resource-summary'];
    if (!panel || !body || !summary)
        return;
    panel.hidden = !state.textDiagnosticsSurface;
    const copy = refs['resource-probe-copy'];
    if (copy) {
        copy.toggleAttribute('disabled', !state.textDiagnosticsSurface || !state.resources?.probe);
        copy.title = state.resources?.probe
            ? 'Copy resource history, first capacity refusal, source ownership, and current diagnostic context.'
            : 'Waiting for the temporary ownership probe. Restart the game after updating the diagnostic build.';
    }
    body.replaceChildren();
    const sample = state.resources;
    if (sample === null) {
        summary.textContent = 'Waiting for resource data';
        return;
    }
    const cap = sample.limits.find((row) => row.name === 'pixelBytes')?.limit ?? null;
    summary.textContent = `${formatResourceValue(sample.allocatedBytes, 'bytes')} / ${formatResourceValue(cap, 'bytes')}`;
    summary.className = `summary-status ${sample.consistent ? 'neutral' : 'warn'}`;
    body.appendChild(createTextElement('p', 'resource-note', `Generation ${String(sample.generation)} · ${sample.active ? 'Active' : 'Disposed'} · Peak ${formatResourceValue(sample.peakBytes, 'bytes')}`));
    if (!sample.consistent)
        body.appendChild(createTextElement('p', 'resource-note', 'Resource accounting is incomplete.'));
    const bar = document.createElement('progress');
    bar.max = cap && cap > 0 ? cap : 1;
    bar.value = sample.allocatedBytes;
    body.appendChild(bar);
    const memory = document.createElement('dl');
    memory.className = 'resource-memory';
    for (const row of sample.memory) {
        memory.appendChild(createTextElement('dt', '', row.label));
        memory.appendChild(createTextElement('dd', '', formatResourceValue(row.bytes, 'bytes')));
    }
    body.appendChild(memory);
    const table = document.createElement('table');
    table.className = 'resource-limits';
    const head = document.createElement('thead'), headings = document.createElement('tr');
    for (const label of ['Limit', 'Latest', 'Cap', 'Peak', 'Refusals'])
        headings.appendChild(createTextElement('th', '', label));
    head.appendChild(headings);
    table.appendChild(head);
    const rows = document.createElement('tbody');
    for (const limit of sample.limits) {
        const row = document.createElement('tr');
        row.appendChild(createTextElement('th', '', limit.label));
        for (const value of [limit.value, limit.limit, limit.peak])
            row.appendChild(createTextElement('td', '', formatResourceValue(value, limit.unit)));
        const refusals = createTextElement('td', limit.refusals > 0 ? 'resource-refused' : '', String(limit.refusals));
        if (limit.lastRequested !== null)
            refusals.title = `Last refused request: ${formatResourceValue(limit.lastRequested, limit.unit)} at ${formatResourceValue(limit.lastRefusedAt, limit.unit)}`;
        row.appendChild(refusals);
        rows.appendChild(row);
    }
    table.appendChild(rows);
    body.appendChild(table);
}
