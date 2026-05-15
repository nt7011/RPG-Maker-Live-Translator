// Translator monitor copy actions helpers.
// These functions share state from gui/app/state.js and are loaded before app.js boots.
'use strict';

function copyForesightDiagnostics(feedbackTarget) {
    const payload = buildForesightDiagnosticsCopyText();
    writeClipboardText(payload)
        .then(() => flashCopyFeedback(feedbackTarget, 'Copied'))
        .catch((err) => {
            flashCopyFeedback(feedbackTarget, 'Failed');
            addLog('warn', `Foresight diagnostics copy failed: ${formatError(err)}`);
        });
}

function copyDrawCaptureTrace(feedbackTarget) {
    const payload = buildDrawCaptureTraceCopyText();
    writeClipboardText(payload)
        .then(() => flashCopyFeedback(feedbackTarget, 'Copied'))
        .catch((err) => {
            flashCopyFeedback(feedbackTarget, 'Failed');
            addLog('warn', `Draw capture trace copy failed: ${formatError(err)}`);
        });
}

function copyTextRecord(item, feedbackTarget) {
    const payload = buildTextRecordCopyText(item);
    writeClipboardText(payload)
        .then(() => flashCopyFeedback(feedbackTarget, 'Copied'))
        .catch((err) => {
            flashCopyFeedback(feedbackTarget, 'Failed');
            addLog('warn', `Text record copy failed: ${formatError(err)}`);
        });
}

function writeClipboardText(text) {
    if (typeof navigator !== 'undefined'
        && navigator.clipboard
        && typeof navigator.clipboard.writeText === 'function') {
        return navigator.clipboard.writeText(text).catch(() => writeClipboardTextFallback(text));
    }
    return writeClipboardTextFallback(text);
}

function writeClipboardTextFallback(text) {
    return new Promise((resolve, reject) => {
        const input = document.createElement('textarea');
        input.value = text;
        input.setAttribute('readonly', '');
        input.style.position = 'fixed';
        input.style.left = '-9999px';
        input.style.top = '0';
        document.body.appendChild(input);
        input.focus();
        input.select();
        try {
            if (!document.execCommand('copy')) {
                throw new Error('copy command returned false');
            }
            resolve();
        } catch (err) {
            reject(err);
        } finally {
            document.body.removeChild(input);
        }
    });
}

function flashCopyFeedback(target, label) {
    if (!target) return;
    if (target.classList && target.classList.contains('copy-record-button')) {
        flashCopyButton(target, label);
        return;
    }
    flashCopyRecord(target, label);
}

function flashCopyButton(button, label) {
    if (!button) return;
    const original = button.dataset.originalLabel || button.textContent || 'Copy';
    button.dataset.originalLabel = original;
    button.textContent = label;
    button.disabled = true;
    setTimeout(() => {
        if (!button.isConnected) return;
        button.textContent = button.dataset.originalLabel || 'Copy';
        button.disabled = false;
    }, 900);
}

function flashCopyRecord(record, label) {
    if (!record || !record.classList) return;
    const className = label === 'Failed' ? 'text-record-copy-failed' : 'text-record-copied';
    record.classList.remove('text-record-copied', 'text-record-copy-failed');
    record.classList.add(className);
    setTimeout(() => {
        if (!record.isConnected) return;
        record.classList.remove(className);
    }, 700);
}

function buildTextRecordCopyText(item) {
    return JSON.stringify(buildTextRecordCopyPayload(item), null, 2);
}

function buildTextRecordCopyPayload(item) {
    const history = getTextRecordHistory(item).map((entry) => ({
        at: copyTimestamp(entry.at),
        seq: entry.seq || null,
        id: entry.id || '',
        surfaceId: entry.surfaceId || '',
        adapterId: entry.adapterId || '',
        type: entry.type || 'event',
        status: entry.status || '',
        message: entry.message || '',
        details: entry.details || {},
    }));
    const payload = {
        copiedAt: copyTimestamp(Date.now()),
        id: item.id || '',
        hook: {
            key: item.hookKey || '',
            label: item.hook || '',
            type: normalizeHookClass(item.hookKey || item.hook),
        },
        status: item.status || 'detected',
        lifecycleState: item.lifecycleState || item.displayLifecycle || '',
        text: {
            original: item.original || '',
            translation: item.translation || '',
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
            onScreen: item.onScreen !== false,
            screenState: item.screenState || '',
            x: Number.isFinite(Number(item.x)) ? Number(item.x) : null,
            y: Number.isFinite(Number(item.y)) ? Number(item.y) : null,
            bounds: item.bounds || null,
        },
        timestamps: {
            firstSeenAt: copyTimestamp(item.firstSeenAt),
            seenAt: copyTimestamp(item.seenAt),
            updatedAt: copyTimestamp(item.updatedAt),
            disappearedAt: copyTimestamp(item.disappearedAt),
            deactivatedAt: copyTimestamp(item.deactivatedAt),
        },
        metadata: item.metadata || {},
        policy: getTextRecordPolicyDiagnostics(item),
        history,
    };
    return payload;
}

function buildDrawCaptureTraceCopyText(trace = state.drawCaptureTrace) {
    return JSON.stringify(buildDrawCaptureTraceCopyPayload(trace), null, 2);
}

function buildDrawCaptureTraceCopyPayload(trace = state.drawCaptureTrace) {
    const source = trace && typeof trace === 'object' ? trace : {};
    const events = Array.isArray(source.events) ? source.events : [];
    return {
        copiedAt: copyTimestamp(Date.now()),
        kind: 'draw-capture-trace',
        snapshot: {
            updatedAt: copyTimestamp(source.updatedAt),
            enabled: source.enabled !== false,
            size: source.size || events.length,
            limit: source.limit || null,
            sequence: source.sequence || null,
        },
        filters: source.filters || {},
        summary: source.summary || {},
        events: events.map(buildDrawCaptureTraceEventCopyPayload),
    };
}

function buildDrawCaptureTraceEventCopyPayload(event) {
    const source = event && typeof event === 'object' ? event : {};
    return {
        at: copyTimestamp(source.at),
        seq: source.seq || null,
        stage: source.stage || '',
        adapter: source.adapter || '',
        methodName: source.methodName || '',
        text: {
            raw: source.rawText || '',
            visible: source.visibleText || '',
            normalized: source.normalizedText || '',
        },
        decision: {
            reason: source.reason || '',
            category: source.category || '',
            status: source.status || '',
        },
        surface: {
            windowType: source.windowType || '',
            ownerType: source.ownerType || '',
            x: Number.isFinite(Number(source.x)) ? Number(source.x) : null,
            y: Number.isFinite(Number(source.y)) ? Number(source.y) : null,
            maxWidth: Number.isFinite(Number(source.maxWidth)) ? Number(source.maxWidth) : null,
            lineHeight: Number.isFinite(Number(source.lineHeight)) ? Number(source.lineHeight) : null,
            align: source.align || '',
            bounds: source.bounds || null,
        },
        item: {
            recordId: source.recordId || '',
            slotKey: source.slotKey || '',
        },
        details: source.details || {},
    };
}
