'use strict';

// Formatting and logging helpers are shared by model requests and progress reporting.

function formatEta(seconds) {
    const numeric = Number(seconds);
    if (!Number.isFinite(numeric) || numeric < 0) return '-';
    const totalSeconds = Math.ceil(numeric);
    if (totalSeconds < 60) return `${totalSeconds}s`;
    const minutes = Math.floor(totalSeconds / 60);
    const remainderSeconds = totalSeconds % 60;
    if (minutes < 60) return remainderSeconds
        ? `${minutes}m ${remainderSeconds}s`
        : `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const remainderMinutes = minutes % 60;
    return remainderMinutes ? `${hours}h ${remainderMinutes}m` : `${hours}h`;
}

function formatError(err) {
    if (!err) return 'unknown error';
    return err && err.message ? err.message : String(err);
}

function log(message) {
    console.log(`[PrecacheTranslator] ${message}`);
}

function formatNumber(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return '0';
    return Math.round(numeric).toLocaleString('en-US');
}

module.exports = {
    formatError,
    formatEta,
    formatNumber,
    log,
};
