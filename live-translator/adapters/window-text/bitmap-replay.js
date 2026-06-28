// Window text adapter support: bitmap replay.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'adapters.windowText.bitmapReplay',
        requires: {
            bitmapDiagnostics: 'adapters.windowText.bitmapDiagnostics',
            bitmapReplayBindingsModule: 'adapters.windowText.bitmapReplayBindings',
            copiedTargetReplayModule: 'adapters.windowText.copiedTargetReplay',
            entrySnapshotsModule: 'adapters.windowText.entrySnapshots',
            replayCompositionModule: 'adapters.windowText.replayComposition',
        },
        factory({ bitmapDiagnostics, bitmapReplayBindingsModule, copiedTargetReplayModule, entrySnapshotsModule, replayCompositionModule }) {

    function createBitmapReplayController(context = {}) {
    const { entryLifecycleState } = context;
    const bitmapTools = bitmapDiagnostics.create(context);
    const { mergeBounds, isValidRect, roundDiagnosticNumber, cloneDiagnosticRect, cloneDiagnosticArea, calculateBitmapSurfaceTextYOffset, estimateBitmapSurfaceTextBounds, createClearRectFromArea, getReplayItemRect, mergeReplayRect, expandReplayDirtyRect, replayRectsOverlap, getBitmapCanvasContext, supportsBitmapReplayClip, getReplayClipArea, getBitmapSnapshotContext, getEntryContentsRevision, getSnapshotContentsRevision, getWindowDataContentsRevision, getEntrySnapshotPadding, getSnapshotArea, getSnapshotDiagnostics, summarizeReplayItemsForDiagnostics, summarizeReplayStateForDiagnostics } = bitmapTools;
    const bitmapReplayBindings = bitmapReplayBindingsModule.create({
                services: context.services,
            });
    const replayComposition = replayCompositionModule.create({
                entryLifecycleState,
                services: context.services,
                facades: context.facades,
                bitmapTools,
                windowEntryBelongsToContents: bitmapReplayBindings.windowEntryBelongsToContents,
                replayRectsOverlap,
            });
    const entrySnapshots = entrySnapshotsModule.create({
                entryLifecycleState,
                services: context.services,
                facades: context.facades,
                bitmapTools,
                isUsableBitmap: bitmapReplayBindings.isUsableBitmap,
                resolveBitmapWindowData: bitmapReplayBindings.resolveBitmapWindowData,
                windowEntryBelongsToContents: bitmapReplayBindings.windowEntryBelongsToContents,
                replayRectsOverlap,
                finalizeWindowReplayBitmapDirty: bitmapReplayBindings.finalizeWindowReplayBitmapDirty,
            });
    const copiedTargetReplay = copiedTargetReplayModule.create({
                entryLifecycleState,
                services: context.services,
                facades: context.facades,
                bitmapTools,
                windowEntryBelongsToContents: bitmapReplayBindings.windowEntryBelongsToContents,
                resolveBitmapWindowData: bitmapReplayBindings.resolveBitmapWindowData,
                getWindowEntrySnapshotBounds: entrySnapshots.getWindowEntrySnapshotBounds,
            });
    
    function isTransientRefreshWindow(windowInstance, windowType) {
                const type = String(windowType || '');
                if (/Window_(?:BattleLog|ScrollText|MapName|NameBox)/.test(type)) return true;
                if (/Log/u.test(type)) return true;
                try {
                    const hasLogBuffers = Array.isArray(windowInstance && windowInstance._lines)
                        || Array.isArray(windowInstance && windowInstance._logs);
                    const hasLogMethods = typeof (windowInstance && windowInstance.drawLineText) === 'function'
                        || typeof (windowInstance && windowInstance.addText) === 'function'
                        || typeof (windowInstance && windowInstance.push) === 'function';
                    if (hasLogBuffers && hasLogMethods) return true;
                    if (Array.isArray(windowInstance && windowInstance._methods)
                        && typeof (windowInstance && windowInstance.callNextMethod) === 'function') {
                        return true;
                    }
                } catch (_) {}
                return false;
            }
    
    function isCoreRefreshWindowType(windowType) {
                return /^Window_(?:ActorCommand|BattleActor|BattleEnemy|BattleItem|BattleSkill|BattleStatus|ChoiceList|Command|DebugEdit|DebugRange|EquipCommand|EquipItem|EquipSlot|EquipStatus|EventItem|GameEnd|Gold|HorzCommand|ItemCategory|ItemList|MenuActor|MenuCommand|MenuStatus|NameEdit|NameInput|NumberInput|Options|PartyCommand|SavefileList|ShopBuy|ShopCommand|ShopNumber|ShopSell|ShopStatus|SkillList|SkillStatus|SkillType|Status|StatusBase|StatusEquip|StatusParams|TitleCommand)$/u.test(String(windowType || ''));
            }
    
    
        return { mergeBounds, isValidRect, roundDiagnosticNumber, cloneDiagnosticRect, cloneDiagnosticArea, calculateBitmapSurfaceTextYOffset, estimateBitmapSurfaceTextBounds, withWindowRedrawClear: bitmapReplayBindings.withWindowRedrawClear, isWindowRedrawClearActive: bitmapReplayBindings.isWindowRedrawClearActive, withWindowContents: bitmapReplayBindings.withWindowContents, isUsableBitmap: bitmapReplayBindings.isUsableBitmap, getRedrawContents: bitmapReplayBindings.getRedrawContents, wasDrawnToDetachedContents: bitmapReplayBindings.wasDrawnToDetachedContents, isTransientRefreshWindow, isCoreRefreshWindowType, getBitmapReplayApi: bitmapReplayBindings.getBitmapReplayApi, registerCopiedWindowTextTargetProvider: copiedTargetReplay.registerCopiedWindowTextTargetProvider, assignWindowTextDrawOrder: bitmapReplayBindings.assignWindowTextDrawOrder, rememberInlineReplacement: bitmapReplayBindings.rememberInlineReplacement, captureWindowEntrySource: entrySnapshots.captureWindowEntrySource, restoreWindowEntrySource: entrySnapshots.restoreWindowEntrySource, restoreEntriesForBitmapMutation: entrySnapshots.restoreEntriesForBitmapMutation, redrawRestoredEntriesForBitmapMutation: entrySnapshots.redrawRestoredEntriesForBitmapMutation, materializeCopiedTargetsBeforeBitmapMutation: copiedTargetReplay.materializeCopiedTargetsBeforeBitmapMutation, redrawMaterializedCopiedTargetsAfterBitmapMutation: copiedTargetReplay.redrawMaterializedCopiedTargetsAfterBitmapMutation, invalidateCopiedTargetsForBitmapMutation: copiedTargetReplay.invalidateCopiedTargetsForBitmapMutation, hasLedgerCopiedTargetsForBitmap: copiedTargetReplay.hasLedgerCopiedTargetsForBitmap, materializeCopiedRenderTargetsForEntry: copiedTargetReplay.materializeCopiedRenderTargetsForEntry, redrawCopiedWindowTextTargets: copiedTargetReplay.redrawCopiedWindowTextTargets, createClearRectFromArea, getReplayItemRect, mergeReplayRect, expandReplayDirtyRect, replayRectsOverlap, collectWindowTextReplayItems: replayComposition.collectWindowTextReplayItems, windowEntryBelongsToContents: bitmapReplayBindings.windowEntryBelongsToContents, combineReplayItems: replayComposition.combineReplayItems, filterReplayForEntry: replayComposition.filterReplayForEntry, replayMixedItems: replayComposition.replayMixedItems, replayWindowTextEntry: replayComposition.replayWindowTextEntry, getWindowReplayText: replayComposition.getWindowReplayText, getBitmapCanvasContext, supportsBitmapReplayClip, withBitmapReplayClip: replayComposition.withBitmapReplayClip, getReplayClipArea, getBitmapSnapshotContext, captureWindowEntryBackground: entrySnapshots.captureWindowEntryBackground, captureWindowEntryBackgroundPatch: entrySnapshots.captureWindowEntryBackgroundPatch, ensureWindowEntryBackground: entrySnapshots.ensureWindowEntryBackground, getWindowEntryBackgroundSnapshotStatus: entrySnapshots.getWindowEntryBackgroundSnapshotStatus, getWindowEntrySourceSnapshotStatus: entrySnapshots.getWindowEntrySourceSnapshotStatus, restoreWindowEntryBackground: entrySnapshots.restoreWindowEntryBackground, getEntryContentsRevision, getSnapshotContentsRevision, getWindowDataContentsRevision, getEntrySnapshotPadding, getSnapshotArea, getSnapshotDiagnostics, summarizeReplayItemsForDiagnostics, summarizeReplayStateForDiagnostics };
    }
            return { create: createBitmapReplayController };
        },
    });

})();
