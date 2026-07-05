// Runtime bitmap support: source observation contract.
// This module owns the native draw lifecycle vocabulary shared by
// bitmap-backed adapters and runtime draw-unit routing.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'runtime.bitmap.sourceObservation',
        factory() {
            function createSourceObservation(status, reason) {
                return normalizeSourceObservation({ status, reason }, status, reason);
            }

            function normalizeSourceObservation(sourceObservation, fallbackStatus = '', fallbackReason = '') {
                const source = sourceObservation && typeof sourceObservation === 'object' ? sourceObservation : {};
                const status = normalizeSourceObservationStatus(source.status || fallbackStatus);
                return {
                    status,
                    reason: stringify(source.reason || source.intelReason || fallbackReason || ''),
                };
            }

            function normalizeSourceObservationStatus(status) {
                const value = stringify(status || '').replace(/_/g, '-').toLowerCase();
                if (value === 'observed' || value === 'observe') return 'observed';
                if (value === 'suppressed' || value === 'suppress' || value === 'source-suppressed') return 'suppressed';
                if (value === 'ignored' || value === 'ignore' || value === 'unobserved' || value === 'not-recordable') return 'ignored';
                if (value === 'rejected' || value === 'reject' || value === 'record-missed') return 'rejected';
                return value ? 'ignored' : 'observed';
            }

            function stringify(value) {
                return value === undefined || value === null ? '' : String(value);
            }

            return {
                createSourceObservation,
                normalizeSourceObservation,
                normalizeSourceObservationStatus,
            };
        },
    });
})();
