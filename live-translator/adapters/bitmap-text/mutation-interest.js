// Bitmap text adapter support: mutation interest planning.
// Mutation wrappers execute transactions; this controller decides whether one is needed.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'adapters.bitmapText.mutationInterest',
        factory() {

    function createController(scope = {}) {
        const { getBitmapState } = scope.controllerFacades.replay;

        function planBitmapMutationObservation(bitmap, methodName, args, bypassReason = '') {
            if (bypassReason) return createIgnoredMutationPlan();
            const notifySubscribers = hasMutationObserverInterest(bitmap);
            const handleMutation = shouldHandleBitmapMutation(bitmap, methodName);
            const copyBitmapTextSource = hasBitmapTextMutationSource(methodName, args);
            const flushPendingBitmapSource = hasPendingBitmapTextMutationSource(methodName, args);
            const drainPendingSource = flushPendingBitmapSource;
            const materializeCopiedTargets = copyBitmapTextSource
                || flushPendingBitmapSource
                || hasCopiedBitmapTextTargetInterest(bitmap);
            const recordLedgerMutation = hasSurfaceLedgerMutationInterest(bitmap, methodName, args);
            const recordCopyLineage = hasSurfaceLedgerCopyLineageInterest(methodName, args);
            const handleTextInk = typeof scope.hasBitmapNativeTextInkInterest === 'function'
                && scope.hasBitmapNativeTextInkInterest(bitmap);
            const providerCapabilities = collectProvidedMutationCapabilities(bitmap, methodName, args);
            const observe = notifySubscribers
                || handleMutation
                // Copy-target participants must observe source-copy blits
                // even when the target bitmap has no prior mutation state.
                || materializeCopiedTargets
                || flushPendingBitmapSource
                || recordLedgerMutation
                || recordCopyLineage
                || handleTextInk
                || providerCapabilities.length > 0;
            if (!observe) return createIgnoredMutationPlan();
            return {
                observe: true,
                capabilities: collectMutationJournalCapabilities({
                    drainPendingSource,
                    handleMutation,
                    materializeCopiedTargets,
                    recordLedgerMutation,
                    recordCopyLineage,
                    notifySubscribers,
                    handleTextInk,
                    providerCapabilities,
                }),
            };
        }

        function createIgnoredMutationPlan() {
            return { observe: false, capabilities: [] };
        }

        function hasMutationObserverInterest(bitmap) {
            return !!(bitmap && scope.bitmapServices.hasMutationInterest(bitmap));
        }

        function collectProvidedMutationCapabilities(bitmap, methodName, args) {
            const services = scope.bitmapServices;
            if (!services || typeof services.collectMutationCapabilities !== 'function') return [];
            try {
                const capabilities = services.collectMutationCapabilities(bitmap, {
                    methodName,
                    args: Array.isArray(args) ? args.slice() : [],
                });
                return Array.isArray(capabilities) ? capabilities : [];
            } catch (error) {
                reportMutationError('bitmapServices.collectMutationCapabilities', error);
                return [];
            }
        }

        function shouldHandleBitmapMutation(bitmap, methodName) {
            if (!bitmap) return false;
            const state = getBitmapState(bitmap);
            if (hasBitmapStateMutationInterest(state, methodName)) return true;
            return hasCopiedBitmapTextTargetInterest(bitmap);
        }

        function hasBitmapStateMutationInterest(state, methodName) {
            if (!state) return false;
            if (methodName === 'destroy') return true;
            if (state.destroyed) return false;
            if (state.entries && typeof state.entries.size === 'number' && state.entries.size > 0) return true;
            if (Array.isArray(state.renderOps) && state.renderOps.length) return true;
            if (state.nativeTextOps && typeof state.nativeTextOps.size === 'number' && state.nativeTextOps.size > 0) return true;
            return false;
        }

        function hasBitmapTextMutationSource(methodName, args) {
            switch (methodName) {
            case 'blt':
            case 'bltImage': {
                const sourceBitmap = args && args[0];
                const state = getBitmapState(sourceBitmap);
                return hasBitmapFallbackEntries(state);
            }
            default:
                return false;
            }
        }

        function hasPendingBitmapTextMutationSource(methodName, args) {
            switch (methodName) {
            case 'blt':
            case 'bltImage':
                return hasPendingBitmapTextSource(args && args[0]);
            default:
                return false;
            }
        }

        function hasSurfaceLedgerMutationInterest(targetBitmap, methodName, args) {
            const services = scope.bitmapServices;
            if (!services || typeof services.hasSurfaceLedgerRecord !== 'function') return false;
            if (hasLedgerRecord(targetBitmap)) return true;
            switch (methodName) {
            case 'blt':
            case 'bltImage':
                return hasLedgerRecord(args && args[0]);
            default:
                return false;
            }
        }

        function hasSurfaceLedgerCopyLineageInterest(methodName, args) {
            switch (methodName) {
            case 'blt':
            case 'bltImage':
                return hasLedgerRecord(args && args[0]);
            default:
                return false;
            }
        }

        function hasLedgerRecord(bitmap) {
            if (!bitmap || !scope.bitmapServices || typeof scope.bitmapServices.hasSurfaceLedgerRecord !== 'function') {
                return false;
            }
            try {
                return scope.bitmapServices.hasSurfaceLedgerRecord(bitmap) === true;
            } catch (error) {
                reportMutationError('bitmapServices.hasSurfaceLedgerRecord', error);
                return false;
            }
        }

        function collectMutationJournalCapabilities(input = {}) {
            const capabilities = [];
            if (input.drainPendingSource) pushMutationCapability(capabilities, 'pending-source-drain');
            if (input.handleMutation) pushMutationCapability(capabilities, 'invalidation');
            if (input.materializeCopiedTargets) pushMutationCapability(capabilities, 'copied-target-materialization');
            if (input.recordLedgerMutation) pushMutationCapability(capabilities, 'surface-ledger');
            if (input.recordCopyLineage) pushMutationCapability(capabilities, 'copy-lineage');
            if (input.handleTextInk) pushMutationCapability(capabilities, 'native-ink');
            if (input.notifySubscribers) pushMutationCapability(capabilities, 'observer');
            (Array.isArray(input.providerCapabilities) ? input.providerCapabilities : []).forEach((capability) => {
                pushMutationCapability(capabilities, capability);
            });
            return capabilities;
        }

        function pushMutationCapability(capabilities, value) {
            const capability = String(value || '');
            if (capability && capabilities.indexOf(capability) < 0) capabilities.push(capability);
        }

        function hasPendingBitmapTextSource(bitmap) {
            if (!bitmap) return false;
            const services = scope.bitmapServices;
            if (!services || typeof services.hasPendingDrawUnits !== 'function') return false;
            try {
                if (services.hasPendingDrawUnits(bitmap) === true) return true;
            } catch (error) {
                reportMutationError('bitmapServices.hasPendingDrawUnits', error);
            }
            return false;
        }

        function hasBitmapFallbackEntries(state) {
            if (!state || !state.entries || typeof state.entries.forEach !== 'function') return false;
            let found = false;
            try {
                state.entries.forEach((entry) => {
                    if (found) return;
                    found = isBitmapFallbackEntry(entry);
                });
            } catch (error) {
                reportMutationError('bitmap.entries.fallback', error);
            }
            return found;
        }

        function isBitmapFallbackEntry(entry) {
            return !!(entry && !entry.ownerWindow);
        }

        function hasCopiedBitmapTextTargetInterest(bitmap) {
            const services = scope.bitmapServices;
            if (!bitmap || !services || typeof services.hasCurrentCopyEdgesTo !== 'function') return false;
            try {
                return services.hasCurrentCopyEdgesTo(bitmap) === true;
            } catch (error) {
                reportMutationError('bitmap.hasCurrentCopyEdgesTo', error);
                return false;
            }
        }

        function reportMutationError(operation, error) {
            if (typeof scope.reportAdapterError === 'function') {
                scope.reportAdapterError(`mutation.${operation}`, error);
            }
        }

        return {
            planBitmapMutationObservation,
            hasMutationObserverInterest,
            shouldHandleBitmapMutation,
            hasBitmapStateMutationInterest,
            hasPendingBitmapTextSource,
        };
    }

            return { create: createController };
        },
    });
})();
