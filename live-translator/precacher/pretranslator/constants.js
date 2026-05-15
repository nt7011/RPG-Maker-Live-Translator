'use strict';

// Shared defaults for the precache translation CLI. Keeping paths here lets CLI parsing and orchestration agree on the same installer layout.

const path = require('path');

const PRECACHER_DIR = path.dirname(__dirname);
const INSTALLER_DIR = path.dirname(PRECACHER_DIR);
const DEFAULT_INPUT_FILE = path.join(PRECACHER_DIR, 'precache.json');
const DEFAULT_CONFIG_FILE = path.join(INSTALLER_DIR, 'translator.json');
const DEFAULT_INPUT_TOKEN_BUDGET = 1024;
const DEFAULT_CONCURRENCY = 1;
const DEFAULT_RETRIES = 2;
const DEFAULT_WRITE_RETRIES = 20;
const BENCHMARK_INTERVAL_MS = 5000;
const TPS_WINDOW_MS = 30000;
const OUTPUT_TOKEN_CAP_MULTIPLIER = 2;
const RAW_CONTROL_CODE_PATTERN = /\\(?:[A-Za-z0-9_#]+|[^\s\w])(?:\[[^\]]*\]|<[^>]*>)?/gu;
const CONTROL_CODE_PLACEHOLDER = '¤';
const DEFAULT_BATCH_SYSTEM_PROMPT = [
    "Translate the user's text into Korean. Raw translation only, no explanations or alternative translations.",
    'Format: JSON Lines. Return one JSON Line per input line containing raw translated output. {"id":123,"translation":"translated text"}\\n',
    `Preserve every ${CONTROL_CODE_PLACEHOLDER} character exactly if one appears in the source text.`,
].join('\n');

module.exports = {
    BENCHMARK_INTERVAL_MS,
    CONTROL_CODE_PLACEHOLDER,
    DEFAULT_BATCH_SYSTEM_PROMPT,
    DEFAULT_CONCURRENCY,
    DEFAULT_CONFIG_FILE,
    DEFAULT_INPUT_FILE,
    DEFAULT_INPUT_TOKEN_BUDGET,
    DEFAULT_RETRIES,
    DEFAULT_WRITE_RETRIES,
    OUTPUT_TOKEN_CAP_MULTIPLIER,
    RAW_CONTROL_CODE_PATTERN,
    TPS_WINDOW_MS,
};
