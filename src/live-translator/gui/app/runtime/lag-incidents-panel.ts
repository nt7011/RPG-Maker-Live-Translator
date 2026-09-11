import { refs, state } from '../state.js';
import { writeClipboardText } from '../copy/actions.js';
interface Panel {
    render: (view: unknown) => void;
}
interface DiagnosticGui {
    mount: (container: HTMLElement, copy: (text: string) => Promise<void>) => Panel;
}
let panel: Panel | null = null;
let loading = false, failed = false;
export function renderLagIncidentsPanel(): void {
    const container = refs['lag-incidents-panel'];
    if (!container)
        return;
    container.hidden = state.lagIncidents === null;
    if (container.hidden)
        return;
    const unavailable = (): void => {
        failed = true;
        const summary = container.querySelector('[data-lag-summary]');
        if (summary)
            summary.textContent = 'Incident panel unavailable';
    };
    try {
        if (panel) {
            panel.render(state.lagIncidents);
            return;
        }
        if (loading || failed)
            return;
        loading = true;
        const style = document.createElement('link');
        style.rel = 'stylesheet';
        style.href = '../../diagnostics/gui/lag-spikes.css';
        document.head.appendChild(style);
        const script = document.createElement('script');
        script.src = '../../diagnostics/gui/lag-spikes.js';
        script.onload = () => {
            try {
                const asset = Reflect.get(globalThis, 'RMLTDiagnosticsLagGui') as DiagnosticGui | undefined;
                if (!asset || typeof asset.mount !== 'function') {
                    unavailable();
                    return;
                }
                panel = asset.mount(container, writeClipboardText);
                renderLagIncidentsPanel();
            }
            catch {
                unavailable();
            }
        };
        script.onerror = unavailable;
        document.head.appendChild(script);
    }
    catch {
        unavailable();
    }
}
