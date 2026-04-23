#!/usr/bin/env node

'use strict';

const fs = require('fs');
const path = require('path');

const LOCAL_DIR = process.cwd();
const OUTPUT_DIR = __dirname;
const ACCEPTED_FILE = 'precache.json';
const REJECTED_FILE = 'precache-rejected.json';
const CJK_TEXT_PATTERN = /[\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF\uFF66-\uFF9F]/u;
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

function classifyRaw(raw) {
    const codedRaw = createCodedRaw(raw);
    if (codedRaw.includes('//')) {
        return { accepted: false, reason: 'comment' };
    }

    const visible = stripControlPlaceholders(codedRaw).replace(/"/g, '').trim();
    if (!visible) {
        return { accepted: false, reason: 'empty' };
    }
    if (!CJK_TEXT_PATTERN.test(visible)) {
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

function buildPrecache(dataDir) {
    const files = listJsonFiles(dataDir);
    const seenRaw = new Set();
    const accepted = [];
    const rejected = [];

    for (const filePath of files) {
        const parsed = readJsonFile(filePath);
        const source = sourcePathFor(filePath, dataDir);

        visitStringValues(parsed, (raw) => {
            if (seenRaw.has(raw)) return;
            seenRaw.add(raw);

            const result = classifyRaw(raw);
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

    return { files, accepted, rejected };
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

function run(argv = process.argv.slice(2)) {
    const dataDir = resolveDataDir(argv);
    if (!isDirectory(dataDir)) {
        throw new Error(`Data directory not found: ${dataDir}`);
    }

    const result = buildPrecache(dataDir);
    const acceptedPath = writeJsonFile(ACCEPTED_FILE, result.accepted);
    const rejectedPath = writeJsonFile(REJECTED_FILE, result.rejected);

    console.log(`[Precacher] Scanned ${result.files.length} JSON files from ${dataDir}`);
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
    resolveDataDir,
    run,
};
