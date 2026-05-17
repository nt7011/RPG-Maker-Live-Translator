// Translator monitor foresight copy helpers.
// These functions share state from gui/app/state.js and are loaded before app.js boots.
'use strict';

function buildForesightDiagnosticsCopyText(snapshot = state.foresight, textRecords = getForesightTextRecords()) {
    return JSON.stringify(buildForesightDiagnosticsCopyPayload(snapshot, textRecords), null, 2);
}

function buildForesightDiagnosticsCopyPayload(snapshot = state.foresight, textRecords = getForesightTextRecords()) {
    const model = createForesightDiagnosticsModel(snapshot, textRecords);
    const records = collectForesightModelRecords(model);
    return {
        copiedAt: copyTimestamp(Date.now()),
        kind: 'foresight-diagnostics',
        summary: model.summary || {},
        snapshot: {
            updatedAt: copyTimestamp(model.snapshotUpdatedAt),
            scanCount: model.scanCount || 0,
        },
        latestScan: buildForesightScanCopyPayload(model.scan),
        actionTrail: {
            limit: model.actionLimit || FORESIGHT_ACTION_DISPLAY_LIMIT,
            shown: model.actionCount || 0,
            available: model.actionsAvailable || 0,
            truncated: model.actionsTruncated || 0,
            actions: (model.nodes || []).map(buildForesightActionCopyPayload),
        },
        linkedTextRecords: records.map(buildForesightLinkedRecordCopyPayload),
    };
}

function createForesightDiagnosticsModel(snapshot, textRecords) {
    const viewer = globalThis.LiveTranslatorForesightTreeViewer
        || (globalThis.window && globalThis.window.LiveTranslatorForesightTreeViewer);
    if (viewer && typeof viewer.createModel === 'function') {
        return viewer.createModel(snapshot, {
            textRecords: Array.isArray(textRecords) ? textRecords : [],
            maxActions: FORESIGHT_ACTION_DISPLAY_LIMIT,
        });
    }
    const source = snapshot && typeof snapshot === 'object' ? snapshot : null;
    const scans = source && Array.isArray(source.recent) ? source.recent : [];
    const scan = scans.length ? scans[scans.length - 1] : null;
    const actions = scan && Array.isArray(scan.commandActions)
        ? scan.commandActions.slice(0, FORESIGHT_ACTION_DISPLAY_LIMIT)
        : [];
    return {
        hasSnapshot: Boolean(source),
        snapshotUpdatedAt: source && source.updatedAt ? source.updatedAt : null,
        scan,
        scanCount: scans.length,
        summary: source && source.summary && typeof source.summary === 'object'
            ? Object.assign({}, source.summary)
            : null,
        actionLimit: FORESIGHT_ACTION_DISPLAY_LIMIT,
        actionCount: actions.length,
        actionsAvailable: actions.length + (Number(scan && scan.commandActionsTruncated) || 0),
        actionsTruncated: Number(scan && scan.commandActionsTruncated) || 0,
        nodes: actions.map((action) => ({
            raw: action,
            index: action && action.index,
            code: action && action.code,
            label: action && action.label,
            classification: action && action.classification,
            action: action && action.action,
            native: action && action.native === true,
            category: action && action.category,
            scanBehavior: action && action.scanBehavior,
            stalenessRisk: action && action.stalenessRisk,
            summary: action && action.summary,
            stopReason: action && action.stopReason,
            stopReasonLabel: action && action.stopReasonLabel,
            listContext: action && action.listContext,
            nestedList: action && action.nestedList,
            budget: action && action.budget,
            consumedCommands: Array.isArray(action && action.consumedCommands) ? action.consumedCommands : [],
            routeCommandActions: Array.isArray(action && action.routeCommandActions) ? action.routeCommandActions : [],
            controlFlowTarget: action && action.controlFlowTarget,
            branches: [],
            messageRecord: null,
        })),
    };
}

function buildForesightScanCopyPayload(scan) {
    const source = scan && typeof scan === 'object' ? scan : {};
    return {
        at: copyTimestamp(source.at),
        interpreterId: source.interpreterId || '',
        status: source.status || '',
        matchedCurrentMessage: source.matchedCurrentMessage === true,
        startIndex: source.startIndex === undefined ? null : source.startIndex,
        stopIndex: source.stopIndex === undefined ? null : source.stopIndex,
        stopReason: source.stopReason || '',
        stopReasonLabel: source.stopReasonLabel || '',
        barrier: {
            code: source.barrierCode === undefined ? null : source.barrierCode,
            label: source.barrierLabel || '',
        },
        budget: cloneForesightValue(source.budget, 0),
        counts: {
            blocks: source.blocks || 0,
            scannedCommands: source.scannedCommands || 0,
            advancedCommands: source.advancedCommands || 0,
            staleRiskCommands: source.staleRiskCommands || 0,
            routeCommands: source.routeCommands || 0,
            routeBarriers: source.routeBarriers || 0,
        },
        movementRouteBarrier: {
            code: source.routeBarrierCode === undefined ? null : source.routeBarrierCode,
            label: source.routeBarrierLabel || '',
            reason: source.routeBarrierReason || '',
        },
        commandLabels: {
            transparent: source.transparentCommandLabels || {},
            staleRisk: source.staleRiskCommandLabels || {},
        },
        pathStops: cloneForesightList(source.pathStops),
    };
}

function buildForesightActionCopyPayload(node) {
    const source = node && typeof node === 'object' ? node : {};
    const raw = source.raw && typeof source.raw === 'object' ? source.raw : {};
    return {
        index: source.index === undefined ? null : source.index,
        code: source.code === undefined ? null : source.code,
        label: source.label || raw.label || '',
        classification: source.classification || raw.classification || '',
        action: source.action || raw.action || '',
        native: source.native === true || raw.native === true,
        category: source.category || raw.category || '',
        scanBehavior: source.scanBehavior || raw.scanBehavior || '',
        stalenessRisk: source.stalenessRisk || raw.stalenessRisk || '',
        summary: source.summary || raw.summary || '',
        stopReason: source.stopReason || raw.stopReason || '',
        stopReasonLabel: source.stopReasonLabel || raw.stopReasonLabel || '',
        priorityDistance: source.priorityDistance === undefined ? raw.priorityDistance : source.priorityDistance,
        branchDepth: source.branchDepth === undefined ? raw.branchDepth : source.branchDepth,
        branchPath: cloneForesightList(source.branchPath || raw.branchPath),
        listContext: cloneForesightValue(source.listContext || raw.listContext, 0),
        nestedList: cloneForesightValue(source.nestedList || raw.nestedList, 0),
        budget: cloneForesightValue(source.budget || raw.budget, 0),
        consumedCommands: cloneForesightList(source.consumedCommands || raw.consumedCommands),
        routeCommandActions: cloneForesightList(source.routeCommandActions || raw.routeCommandActions),
        controlFlowTarget: cloneForesightValue(source.controlFlowTarget || raw.controlFlowTarget, 0),
        linkedTextRecordId: source.messageRecord && source.messageRecord.id ? source.messageRecord.id : '',
        branches: Array.isArray(source.branches)
            ? source.branches.map(buildForesightBranchCopyPayload)
            : [],
        mergeGroups: Array.isArray(source.mergeGroups)
            ? source.mergeGroups.map(buildForesightMergeCopyPayload)
            : [],
    };
}

function buildForesightBranchCopyPayload(branch) {
    const source = branch && typeof branch === 'object' ? branch : {};
    return {
        label: source.label || '',
        branchIndex: source.branchIndex === undefined ? null : source.branchIndex,
        branchPath: cloneForesightList(source.branchPath),
        startIndex: source.startIndex === undefined ? null : source.startIndex,
        endIndex: source.endIndex === undefined ? null : source.endIndex,
        joinIndex: source.joinIndex === undefined ? null : source.joinIndex,
        budget: cloneForesightValue(source.budget, 0),
        actionCount: source.actionCount || 0,
        actionsTruncated: source.actionsTruncated || 0,
        stops: cloneForesightList(source.stops),
        actions: Array.isArray(source.nodes) ? source.nodes.map(buildForesightActionCopyPayload) : [],
    };
}

function buildForesightMergeCopyPayload(group) {
    const source = group && typeof group === 'object' ? group : {};
    return {
        joinIndex: source.joinIndex === undefined ? null : source.joinIndex,
        branchIndices: cloneForesightList(source.branchIndices),
        lanePositions: cloneForesightList(source.lanePositions),
    };
}

function collectForesightModelRecords(model) {
    const records = [];
    const seen = new Set();
    collectForesightNodeRecords(model && model.nodes, records, seen);
    return records;
}

function collectForesightNodeRecords(nodes, records, seen) {
    (Array.isArray(nodes) ? nodes : []).forEach((node) => {
        const record = node && node.messageRecord;
        const key = record && (record.id || getTextRecordKey(record));
        if (record && key && !seen.has(String(key))) {
            seen.add(String(key));
            records.push(record);
        }
        (Array.isArray(node && node.branches) ? node.branches : []).forEach((branch) => {
            collectForesightNodeRecords(branch && branch.nodes, records, seen);
        });
    });
}

function buildForesightLinkedRecordCopyPayload(item) {
    const railInfo = getTextRecordTranslationRailInfo(item);
    return {
        id: item.id || '',
        hook: {
            key: item.hookKey || '',
            label: item.hook || '',
            type: normalizeHookClass(item.hookKey || item.hook),
        },
        status: item.status || 'detected',
        lifecycleState: item.lifecycleState || item.displayLifecycle || '',
        translationRail: {
            state: railInfo.state || 'neutral',
            label: railInfo.label || '',
            priority: railInfo.priority,
            stream: railInfo.stream === true,
            jobId: railInfo.job && railInfo.job.id ? railInfo.job.id : '',
        },
        text: {
            original: item.original || '',
            translation: item.translation || '',
            raw: item.rawText || '',
            visible: item.visibleText || '',
            translationSource: item.translationSource || '',
            normalizedSource: item.normalizedSource || '',
            translationReceived: item.translationReceived || '',
            translationDrawn: item.translationDrawn || '',
        },
        timestamps: {
            firstSeenAt: copyTimestamp(item.firstSeenAt),
            seenAt: copyTimestamp(item.seenAt),
            updatedAt: copyTimestamp(item.updatedAt),
            deactivatedAt: copyTimestamp(item.deactivatedAt),
        },
        foresight: extractForesightRecordMetadata(item),
    };
}

function extractForesightRecordMetadata(item) {
    const metadata = item && item.metadata && typeof item.metadata === 'object' ? item.metadata : {};
    return {
        foresight: metadata.foresight === true,
        foresightIndex: metadata.foresightIndex === undefined ? null : metadata.foresightIndex,
        foresightPriority: metadata.foresightPriority === undefined ? null : metadata.foresightPriority,
        foresightBudget: metadata.foresightBudget || null,
        interpreterId: metadata.interpreterId || '',
        listId: metadata.listId || '',
        commonEventId: metadata.commonEventId === undefined ? null : metadata.commonEventId,
        commonEventName: metadata.commonEventName || '',
        messageStartIndex: metadata.messageStartIndex === undefined ? null : metadata.messageStartIndex,
        messageNextIndex: metadata.messageNextIndex === undefined ? null : metadata.messageNextIndex,
        diagnostics: metadata.foresightDiagnostics || null,
    };
}

function copyTimestamp(value) {
    if (value === undefined || value === null || value === '') return null;
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return {
        epochMs: date.getTime(),
        local: date.toLocaleString(),
    };
}
