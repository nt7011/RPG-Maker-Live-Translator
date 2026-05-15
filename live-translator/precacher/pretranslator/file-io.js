'use strict';

// JSON file helpers own atomic writes and checkpoint retry behavior for long-running translation jobs.

const fs = require('fs');
const path = require('path');

const { DEFAULT_WRITE_RETRIES } = require('./constants');
const { sleep } = require('./abort');

let atomicWriteCounter = 0;

function readJsonFile(filePath) {
    const text = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/u, '');
    try {
        return JSON.parse(text);
    } catch (err) {
        const message = err && err.message ? err.message : String(err);
        throw new Error(`Failed to parse ${filePath}: ${message}`);
    }
}

function writeJsonAtomic(filePath, value, options = {}) {
    const pretty = options.pretty !== false;
    const payload = pretty
        ? `${JSON.stringify(value, null, 2)}\n`
        : JSON.stringify(value);
    const tmpFile = `${filePath}.tmp-${process.pid}-${Date.now()}-${++atomicWriteCounter}`;

    try {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(tmpFile, payload, 'utf8');
        fs.renameSync(tmpFile, filePath);
    } catch (err) {
        try { fs.unlinkSync(tmpFile); } catch (_) {}
        throw err;
    }
}

async function writeJsonAtomicWithRetry(filePath, value, options = {}) {
    const retries = Number.isInteger(options.writeRetries) && options.writeRetries >= 0
        ? options.writeRetries
        : DEFAULT_WRITE_RETRIES;
    let lastError = null;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
        try {
            writeJsonAtomic(filePath, value, options);
            return;
        } catch (err) {
            lastError = err;
            if (attempt >= retries || !isRetriableFileError(err)) {
                throw err;
            }
            await sleep(Math.min(2000, 100 + attempt * 100), options.signal);
        }
    }

    throw lastError;
}

function createCheckpointWriter(filePath, value, options = {}) {
    let chain = Promise.resolve();
    return {
        save() {
            const next = chain
                .catch(() => {})
                .then(() => writeJsonAtomicWithRetry(filePath, value, options));
            chain = next;
            return next;
        },
        drain() {
            return chain;
        },
    };
}

function isRetriableFileError(err) {
    const code = err && err.code ? String(err.code) : '';
    return code === 'EPERM' || code === 'EACCES' || code === 'EBUSY';
}

module.exports = {
    createCheckpointWriter,
    readJsonFile,
    writeJsonAtomic,
    writeJsonAtomicWithRetry,
};
