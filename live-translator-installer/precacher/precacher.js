#!/usr/bin/env node

'use strict';

const fs = require('fs');
const path = require('path');

const LOCAL_DIR = process.cwd();
const OUTPUT_DIR = __dirname;
const ACCEPTED_FILE = 'precache.json';
const REJECTED_FILE = 'precache-rejected.json';
const DEFAULT_SETTINGS_FILE = path.resolve(OUTPUT_DIR, '..', 'settings.json');
const KOREAN_TEXT_PATTERN = /[\uAC00-\uD7AF]/u;
const JAPANESE_OR_CHINESE_TEXT_PATTERN = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/u;
const CONTROL_CODE_PLACEHOLDER = '¤';
const RAW_CONTROL_CODE_PATTERN = /\\(?:[A-Za-z0-9_#]+|[^\s\w])(?:\[[^\]]*\]|<[^>]*>)?/gu;

function resolveDataDir(argv = process.argv.slice(2)) {
    if (argv.length > 1) {
        throw new Error('Usage: node live-translator-installer/precacher/precacher.js [data-dir]');
    }
    if (argv.length === 1) {
        return path.resolve(LOCAL_DIR, argv[0]);
    }

    const dataDir = path.join(LOCAL_DIR, 'data');
    if (isDirectory(dataDir)) return dataDir;

    const wwwDataDir = path.join(LOCAL_DIR, 'www', 'data');
    if (isDirectory(wwwDataDir)) return wwwDataDir;

    return dataDir;
}

function isDirectory(dir) {
    try {
        return fs.statSync(dir).isDirectory();
    } catch (_) {
        return false;
    }
}

function listJsonFiles(dir) {
    const files = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true })
        .sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...listJsonFiles(fullPath));
        } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.json')) {
            files.push(fullPath);
        }
    }

    return files;
}

function readJsonFile(filePath) {
    const text = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/u, '');
    try {
        return JSON.parse(text);
    } catch (err) {
        const message = err && err.message ? err.message : String(err);
        throw new Error(`Failed to parse ${filePath}: ${message}`);
    }
}

function readSettingsFile(filePath = DEFAULT_SETTINGS_FILE) {
    if (!isFile(filePath)) return {};
    return readJsonFile(filePath);
}

function isFile(filePath) {
    try {
        return fs.statSync(filePath).isFile();
    } catch (_) {
        return false;
    }
}

function resolvePrecacheOptions(options = {}) {
    const settingsFile = options.settingsFile || DEFAULT_SETTINGS_FILE;
    let settings = options.settings && typeof options.settings === 'object'
        ? options.settings
        : null;
    let settingsReadError = null;

    if (!settings && options.readSettings !== false) {
        try {
            settings = readSettingsFile(settingsFile);
        } catch (err) {
            settingsReadError = err;
            settings = {};
        }
    }

    const disableCjkFilter = typeof options.disableCjkFilter === 'boolean'
        ? options.disableCjkFilter
        : isDisableCjkFilterEnabled(settings);

    return {
        disableCjkFilter,
        settingsFile,
        settingsReadError,
    };
}

function isDisableCjkFilterEnabled(settings) {
    if (!settings || typeof settings !== 'object') return false;
    return !!(settings.translation
        && typeof settings.translation === 'object'
        && settings.translation.disableCjkFilter === true);
}

function visitStringValues(value, visit) {
    if (typeof value === 'string') {
        visit(value);
        return;
    }

    if (Array.isArray(value)) {
        for (const item of value) visitStringValues(item, visit);
        return;
    }

    if (value && typeof value === 'object') {
        for (const item of Object.values(value)) visitStringValues(item, visit);
    }
}

function classifyRaw(raw, options = {}) {
    const disableCjkFilter = !!(options && options.disableCjkFilter);
    const codedRaw = createCodedRaw(raw);
    if (codedRaw.includes('//')) {
        return { accepted: false, reason: 'comment' };
    }

    const visible = stripControlPlaceholders(codedRaw).replace(/"/g, '').trim();
    if (!visible) {
        return { accepted: false, reason: 'empty' };
    }
    if (disableCjkFilter) {
        return { accepted: true, codedRaw };
    }
    if (KOREAN_TEXT_PATTERN.test(visible)) {
        return { accepted: false, reason: 'korean' };
    }
    if (!JAPANESE_OR_CHINESE_TEXT_PATTERN.test(visible)) {
        return { accepted: false, reason: 'no-cjk' };
    }

    return { accepted: true, codedRaw };
}

function createCodedRaw(value) {
    return String(value ?? '').replace(RAW_CONTROL_CODE_PATTERN, CONTROL_CODE_PLACEHOLDER).trim();
}

function stripControlPlaceholders(value) {
    return String(value ?? '').replace(new RegExp(CONTROL_CODE_PLACEHOLDER, 'g'), '');
}

function buildPrecache(dataDir, options = {}) {
    const precacheOptions = resolvePrecacheOptions(options);
    const files = listJsonFiles(dataDir);
    const seenRaw = new Set();
    const accepted = [];
    const rejected = [];
    const skipped = [];

    for (const filePath of files) {
        const source = sourcePathFor(filePath, dataDir);
        let parsed;

        try {
            parsed = readJsonFile(filePath);
        } catch (err) {
            skipped.push({
                source,
                reason: 'invalid-json',
                error: formatError(err),
            });
            continue;
        }

        visitStringValues(parsed, (raw) => {
            if (seenRaw.has(raw)) return;
            seenRaw.add(raw);

            const result = classifyRaw(raw, precacheOptions);
            if (result.accepted) {
                accepted.push({
                    raw,
                    codedRaw: result.codedRaw,
                    codedTranslation: '',
                    source,
                });
            } else {
                rejected.push({
                    raw,
                    reason: result.reason,
                    source,
                });
            }
        });
    }

    return { files, accepted, rejected, skipped, options: precacheOptions };
}

function sourcePathFor(filePath, dataDir) {
    const localRelative = path.relative(LOCAL_DIR, filePath);
    if (localRelative && !localRelative.startsWith('..') && !path.isAbsolute(localRelative)) {
        return normalizePath(localRelative);
    }
    return normalizePath(path.relative(dataDir, filePath));
}

function normalizePath(filePath) {
    return String(filePath || '').replace(/\\/g, '/');
}

function writeJsonFile(fileName, value) {
    const filePath = path.join(OUTPUT_DIR, fileName);
    fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    return filePath;
}

function formatError(err) {
    if (!err) return 'unknown error';
    return err.message ? err.message : String(err);
}

function run(argv = process.argv.slice(2), options = {}) {
    const dataDir = resolveDataDir(argv);
    if (!isDirectory(dataDir)) {
        throw new Error(`Data directory not found: ${dataDir}`);
    }

    const result = buildPrecache(dataDir, options);
    const acceptedPath = writeJsonFile(ACCEPTED_FILE, result.accepted);
    const rejectedPath = writeJsonFile(REJECTED_FILE, result.rejected);

    if (result.options.settingsReadError) {
        const mode = result.options.disableCjkFilter ? 'disabled' : 'enabled';
        console.warn(`[Precacher] Failed to read settings.json; using CJK filter ${mode}: ${formatError(result.options.settingsReadError)}`);
    }
    console.log(`[Precacher] CJK filter ${result.options.disableCjkFilter ? 'disabled' : 'enabled'}`);
    console.log(`[Precacher] Scanned ${result.files.length} JSON files from ${dataDir}`);
    if (result.skipped.length > 0) {
        console.warn(`[Precacher] Skipped ${result.skipped.length} invalid JSON file${result.skipped.length === 1 ? '' : 's'}`);
        for (const item of result.skipped) {
            console.warn(`[Precacher] Skipped ${item.source}: ${item.error}`);
        }
    }
    console.log(`[Precacher] Wrote ${result.accepted.length} accepted records to ${acceptedPath}`);
    console.log(`[Precacher] Wrote ${result.rejected.length} rejected records to ${rejectedPath}`);
    return result;
}

if (require.main === module) {
    try {
        run(process.argv.slice(2));
    } catch (err) {
        const message = err && err.message ? err.message : String(err);
        console.error(`[Precacher] ${message}`);
        process.exitCode = 1;
    }
}

module.exports = {
    buildPrecache,
    classifyRaw,
    createCodedRaw,
    isDisableCjkFilterEnabled,
    readSettingsFile,
    resolvePrecacheOptions,
    resolveDataDir,
    run,
};
