import { addLog, formatError } from '../core.js';
import { normalizeCoordinate, normalizeHookClass } from '../formatters.js';
import { GUI_PROJECTION_LIMITS, serializeGuiValue, type GuiProjectionLimits } from '../../projection.js';
import { copyTimestamp } from './values.js';
import { state } from '../state.js';
import { copyRuntimeFeedHealth } from '../runtime/feed-health.js';
import { getConfiguredGuiProjectionLimits } from '../policy.js';
import type { GuiDrawCaptureTrace, GuiTextRecord, UnknownRecord } from '../types.js';
import { falsyFallback, isGuiButtonElement } from '../types.js';
import { getSemanticFamily } from '../text-records/semantic-family.js';
const applyCopyFunction = Reflect.apply;
const getCopyProperty = Reflect.get;
const CopyPromise = Promise;
const CopyError = Error;
const MAX_RETAINED_TEXT_EVENTS = 256 * 80;
const TEXT_DIAGNOSTICS_COPY_LIMITS: GuiProjectionLimits = Object.freeze({
    ...GUI_PROJECTION_LIMITS,
    maxArrayEntries: MAX_RETAINED_TEXT_EVENTS,
    maxDescriptorReads: 1048576,
    maxNodes: 524288,
    maxSerializedBytes: 32 * 1024 * 1024,
    maxStringCodeUnits: 1024 * 1024,
    maxTotalStringCodeUnits: 32 * 1024 * 1024,
});
function readCopyProperty(value: unknown, key: PropertyKey): unknown {
    if ((typeof value !== 'object' || value === null) && typeof value !== 'function')
        return undefined;
    return applyCopyFunction(getCopyProperty, Reflect, [value, key, value]);
}
export function copyForesightDiagnostics(feedbackTarget: HTMLElement | null | undefined): void {
    void runCopyAction(buildForesightDiagnosticsCopyPayload, feedbackTarget, 'Foresight status', getConfiguredGuiProjectionLimits());
}
export function buildForesightDiagnosticsCopyPayload(): UnknownRecord {
    const snapshot = state.foresight;
    return {
        copiedAt: copyTimestamp(Date.now()),
        kind: 'foresight-diagnostics',
        runtimeFeed: copyRuntimeFeedHealth(state.runtimeFeedHealth, ['foresight', 'textRecords', 'translation']),
        summary: snapshot?.summary ?? {},
        updatedAt: copyTimestamp(snapshot?.updatedAt),
        recent: snapshot?.recent ?? [],
    };
}
export function copyDrawCaptureTrace(feedbackTarget: HTMLElement | null | undefined): void {
    void runCopyAction(() => buildDrawCaptureTraceCopyPayload(), feedbackTarget, 'Draw capture trace', getConfiguredGuiProjectionLimits());
}
export function copyTextRecord(item: GuiTextRecord, feedbackTarget: HTMLElement | null | undefined): void {
    copyTextRecordValue(() => buildTextRecordCopyPayload(item), feedbackTarget);
}
export function copyTextRecordValue(buildValue: () => unknown, feedbackTarget: HTMLElement | null | undefined): void {
    void runCopyAction(buildValue, feedbackTarget, 'Text record', getConfiguredGuiProjectionLimits(TEXT_DIAGNOSTICS_COPY_LIMITS));
}
export function copyTextTroubleshootingLog(feedbackTarget: HTMLElement | null | undefined): void {
    void runCopyAction(buildTextTroubleshootingLogCopyPayload, feedbackTarget, 'Master text log', getConfiguredGuiProjectionLimits(TEXT_DIAGNOSTICS_COPY_LIMITS));
}
export function buildResourceProbeCopyPayload(): UnknownRecord {
    const resources = state.resources;
    if (!state.textDiagnosticsSurface || !resources?.probe)
        throw new CopyError('Resource ownership probe is unavailable.');
    const { probe, ...currentResources } = resources;
    return {
        kind: 'resource-leak-report',
        version: 1,
        copiedAt: copyTimestamp(Date.now()),
        installedVersion: state.installedVersion,
        diagnosticsRevision: state.diagnosticsFeedRevision,
        resources: currentResources,
        ownership: JSON.parse(probe) as unknown,
        runtimeContext: state.runtimeContext,
        runtimeFeed: state.runtimeFeedHealth,
        translation: state.translationDiagnostics,
        provider: state.translatorProvider,
        providerStatus: state.providerStatus,
        translatorConfigError: state.translatorConfigError,
        rejections: state.drawCaptureTrace,
        diagnosticItems: state.diagnosticRecords,
        lagIncidents: state.lagIncidents,
        guiLog: state.logLines,
    };
}
export function copyResourceProbe(feedbackTarget: HTMLElement | null | undefined): Promise<void> {
    return runCopyAction(buildResourceProbeCopyPayload, feedbackTarget, 'Resource leak report', {
        ...TEXT_DIAGNOSTICS_COPY_LIMITS,
        maxNodes: 1048576,
        maxDescriptorReads: 2097152,
    });
}
export function buildTextTroubleshootingLogCopyPayload(): UnknownRecord {
    const items = state.diagnosticRecords;
    const events = items.flatMap((item) => item.history).sort(compareTextHistorySequence);
    return {
        copiedAt: copyTimestamp(Date.now()),
        kind: 'text-troubleshooting-log',
        diagnosticsRevision: state.diagnosticsFeedRevision,
        items,
        events,
    };
}
function compareTextHistorySequence(left: {
    seq: unknown;
}, right: {
    seq: unknown;
}): number {
    const leftSequence = Number(left.seq);
    const rightSequence = Number(right.seq);
    return (Number.isFinite(leftSequence) ? leftSequence : 0) - (Number.isFinite(rightSequence) ? rightSequence : 0);
}
export function runCopyAction(buildPayload: () => unknown, feedbackTarget: HTMLElement | null | undefined, failureLabel: string, limits: GuiProjectionLimits = GUI_PROJECTION_LIMITS): Promise<void> {
    return CopyPromise.resolve()
        .then(() => writeClipboardText(serializeGuiValue(applyCopyFunction(buildPayload, undefined, []), limits)))
        .then(() => {
        flashCopyFeedback(feedbackTarget, 'Copied');
    })
        .catch((error: unknown) => {
        reportCopyFailure(feedbackTarget, failureLabel, error);
    });
}
export function writeClipboardText(text: string): Promise<void> {
    let clipboard: unknown;
    let writeText: unknown;
    let pending: unknown;
    let then: unknown;
    try {
        clipboard = readCopyProperty(readCopyProperty(globalThis, 'navigator'), 'clipboard');
        writeText = readCopyProperty(clipboard, 'writeText');
        if (typeof writeText !== 'function')
            return writeClipboardTextFallback(text);
        pending = applyCopyFunction(writeText, clipboard, [text]);
        if ((typeof pending !== 'object' || pending === null) && typeof pending !== 'function') {
            return writeClipboardTextFallback(text);
        }
        then = applyCopyFunction(getCopyProperty, Reflect, [pending, 'then', pending]);
        if (typeof then !== 'function')
            return writeClipboardTextFallback(text);
    }
    catch {
        return writeClipboardTextFallback(text);
    }
    const primary = new CopyPromise<void>((resolve, reject) => {
        applyCopyFunction(then, pending, [
            () => {
                resolve();
            },
            reject,
        ]);
    });
    return primary.then(() => undefined, () => writeClipboardTextFallback(text));
}
export function writeClipboardTextFallback(text: string): Promise<void> {
    return new CopyPromise<void>((resolve, reject) => {
        let input: HTMLTextAreaElement | null = null;
        let body: HTMLElement | null = null;
        let attached = false;
        let failed = false;
        let failure: unknown;
        try {
            input = document.createElement('textarea');
            input.value = text;
            input.setAttribute('readonly', '');
            input.style.position = 'fixed';
            input.style.left = '-9999px';
            input.style.top = '0';
            body = document.body;
            attached = true;
            body.appendChild(input);
            input.focus();
            input.select();
            const execCommand = readCopyProperty(document, 'execCommand');
            const copied = typeof execCommand === 'function' && applyCopyFunction(execCommand, document, ['copy']) === true;
            if (!copied)
                throw new CopyError('copy command returned false');
        }
        catch (error: unknown) {
            failed = true;
            failure = error;
        }
        finally {
            if (attached && input && body) {
                try {
                    body.removeChild(input);
                }
                catch (error: unknown) {
                    if (!failed) {
                        failed = true;
                        failure = error;
                    }
                }
            }
        }
        if (failed)
            reject(normalizeCopyError(failure));
        else
            resolve();
    });
}
function normalizeCopyError(error: unknown): Error {
    if (error instanceof CopyError)
        return error;
    try {
        return new CopyError(formatError(error));
    }
    catch {
        return new CopyError('unknown copy error');
    }
}
function reportCopyFailure(feedbackTarget: HTMLElement | null | undefined, failureLabel: string, error: unknown): void {
    try {
        flashCopyFeedback(feedbackTarget, 'Failed');
    }
    catch {
    }
    let details = 'unknown copy error';
    try {
        details = formatError(error);
    }
    catch {
    }
    try {
        addLog('warn', `${failureLabel} copy failed: ${details}`);
    }
    catch {
    }
}
export function flashCopyFeedback(target: HTMLElement | null | undefined, label: string): void {
    if (!target)
        return;
    if (target.classList.contains('copy-record-button')) {
        flashCopyButton(target, label);
        return;
    }
    flashCopyRecord(target, label);
}
export function flashCopyButton(button: HTMLElement, label: string): void {
    if (!isGuiButtonElement(button)) {
        flashCopyRecord(button, label);
        return;
    }
    const original = falsyFallback(button.dataset['originalLabel'], falsyFallback(button.textContent, 'Copy'));
    button.dataset['originalLabel'] = original;
    button.textContent = label;
    setTimeout(() => {
        if (!button.isConnected)
            return;
        button.textContent = falsyFallback(button.dataset['originalLabel'], 'Copy');
    }, 900);
}
export function flashCopyRecord(record: HTMLElement | null | undefined, label: string): void {
    if (!record)
        return;
    const className = label === 'Failed' ? 'text-record-copy-failed' : 'text-record-copied';
    record.classList.remove('text-record-copied', 'text-record-copy-failed');
    record.classList.add(className);
    setTimeout(() => {
        if (!record.isConnected)
            return;
        record.classList.remove(className);
    }, 700);
}
export function buildTextRecordCopyPayload(item: GuiTextRecord): UnknownRecord {
    const payload = {
        copiedAt: copyTimestamp(Date.now()),
        diagnosticsRevision: state.diagnosticsFeedRevision,
        id: item.id || '',
        semanticFamily: getSemanticFamily(item),
        hook: {
            key: item.hookKey || '',
            label: item.hook || '',
            type: normalizeHookClass(item.hookKey || item.hook),
        },
        latestRecordStatus: item.status || 'detected',
        text: {
            original: item.original || '',
            translation: item.translation,
            translationState: item.translationState,
            policyReason: item.policyReason,
            raw: item.rawText || '',
            converted: item.convertedText || '',
            visible: item.visibleText || '',
            translationSource: item.translationSource || '',
            normalizedSource: item.normalizedSource || '',
            translationReceived: item.translationReceived || '',
            translationDrawn: item.translationDrawn || '',
        },
        surface: {
            surfaceType: item.surfaceType || '',
            windowType: item.windowType || '',
            ownerType: item.ownerType || '',
            methodName: item.methodName || '',
            onScreen: item.onScreen,
            screenState: item.screenState || '',
            x: normalizeCoordinate(item.x),
            y: normalizeCoordinate(item.y),
            bounds: item.bounds ?? null,
        },
        timestamps: {
            firstSeenAt: copyTimestamp(item.firstSeenAt),
            seenAt: copyTimestamp(item.seenAt),
            updatedAt: copyTimestamp(item.updatedAt),
            disappearedAt: copyTimestamp(item.disappearedAt),
            deactivatedAt: copyTimestamp(item.deactivatedAt),
        },
        metadata: item.metadata,
        policy: item.policy,
        historyRetention: item.historyRetention ?? null,
        history: item.history,
    };
    return payload;
}
export function buildDrawCaptureTraceCopyPayload(trace: GuiDrawCaptureTrace | null = state.drawCaptureTrace): UnknownRecord {
    const source = trace;
    const events = source?.events ?? [];
    return {
        copiedAt: copyTimestamp(Date.now()),
        kind: 'draw-capture-trace',
        runtimeFeed: copyRuntimeFeedHealth(state.runtimeFeedHealth, ['drawCapture']),
        snapshot: {
            updatedAt: copyTimestamp(source?.updatedAt),
            enabled: source?.enabled !== false,
            size: falsyFallback(source?.size, events.length),
            limit: falsyFallback(source?.limit, null),
            sequence: falsyFallback(source?.sequence, null),
        },
        filters: source?.filters ?? {},
        summary: source?.summary ?? {},
        events,
    };
}
