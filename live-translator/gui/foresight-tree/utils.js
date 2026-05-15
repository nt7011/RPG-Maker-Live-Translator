// Foresight tree shared utility helpers.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const parts = globalScope.LiveTranslatorForesightTreeViewerParts || {};
    globalScope.LiveTranslatorForesightTreeViewerParts = parts;

    // Shared value normalization and formatting for model and DOM modules.
    function normalizeComparableText(value) {
            return String(value || '').replace(/\r\n/gu, '\n').replace(/\r/gu, '\n').trim();
        }
    
    function normalizeClass(value) {
            const text = String(value || '').trim().toLowerCase();
            return text || 'unknown';
        }
    
    function normalizeAction(value) {
            return String(value || '').trim().toLowerCase() || 'command';
        }
    
    function normalizeControlFlowTarget(target) {
            const source = target && typeof target === 'object' ? target : null;
            if (!source) return null;
            const targetIndex = finiteNumber(source.targetIndex);
            if (targetIndex === null) return null;
            return {
                kind: nonEmptyString(source.kind),
                sourceIndex: finiteNumber(source.sourceIndex),
                targetIndex,
                targetCode: source.targetCode === null || source.targetCode === undefined ? null : finiteNumber(source.targetCode),
                targetLabel: nonEmptyString(source.targetLabel),
                targetName: nonEmptyString(source.targetName),
                labelName: nonEmptyString(source.labelName),
                direction: nonEmptyString(source.direction),
                viaIndex: finiteNumber(source.viaIndex),
                viaCode: source.viaCode === null || source.viaCode === undefined ? null : finiteNumber(source.viaCode),
                viaLabel: nonEmptyString(source.viaLabel),
            };
        }
    
    function formatControlFlowKind(kind) {
            const value = String(kind || '').trim().toLowerCase();
            if (value === 'jump-label') return 'jump';
            if (value === 'break-loop') return 'break';
            if (value === 'repeat-loop') return 'repeat';
            if (value === 'loop-repeat') return 'loop';
            return value || 'flow';
        }
    
    function formatControlFlowTarget(target) {
            const index = finiteNumber(target && target.targetIndex);
            const code = target && target.targetCode === null ? null : finiteNumber(target && target.targetCode);
            const label = nonEmptyString(target && target.targetName)
                || nonEmptyString(target && target.targetLabel)
                || (code === null ? 'End' : 'Target');
            return `to #${index === null ? '?' : index} ${label}`;
        }
    
    function cssToken(value) {
            return String(value || 'unknown').toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, '') || 'unknown';
        }
    
    function cloneList(value) {
            return Array.isArray(value) ? value.slice() : [];
        }
    
    function cloneValue(value, depth) {
            if (value === null || value === undefined) return value;
            if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
            if (depth >= 4) return '[Object]';
            if (Array.isArray(value)) return value.map((entry) => cloneValue(entry, depth + 1));
            if (typeof value !== 'object') return String(value);
            const result = {};
            Object.keys(value).forEach((key) => {
                result[key] = cloneValue(value[key], depth + 1);
            });
            return result;
        }
    
    function formatCount(value) {
            const numeric = Number(value);
            return Number.isFinite(numeric) ? String(Math.round(numeric)) : '0';
        }
    
    function defaultFormatTime(value) {
            const date = new Date(value);
            return Number.isNaN(date.getTime()) ? '-' : date.toLocaleTimeString();
        }
    
    function positiveInteger(value, fallback) {
            const numeric = Number(value);
            return Number.isInteger(numeric) && numeric > 0 ? numeric : fallback;
        }
    
    function finiteNumber(value) {
            const numeric = Number(value);
            return Number.isFinite(numeric) ? numeric : null;
        }
    
    function nonEmptyString(value) {
            return typeof value === 'string' && value.trim() ? value.trim() : '';
        }
    
    parts.utils = Object.freeze({
        cloneList, cloneValue, cssToken, defaultFormatTime, finiteNumber, formatControlFlowKind,
        formatControlFlowTarget, formatCount, nonEmptyString, normalizeAction, normalizeClass,
        normalizeComparableText, normalizeControlFlowTarget, positiveInteger,
    });

})();
