'use strict';

// Command-line parsing stays isolated from translation work so UI callers can build options directly.

const path = require('path');

const {
    DEFAULT_CONCURRENCY,
    DEFAULT_CONFIG_FILE,
    DEFAULT_INPUT_FILE,
    DEFAULT_INPUT_TOKEN_BUDGET,
    DEFAULT_RETRIES,
    DEFAULT_WRITE_RETRIES,
} = require('./constants');

function usage() {
    return [
        'Usage: node live-translator-installer/precacher/pretranslator.js [options]',
        '',
        'Options:',
        '  --in <file>                 Input precache JSON. Defaults to the script directory precache.json.',
        '  --config <file>             translator.json path. Defaults to the installer directory translator.json.',
        '  --concurrency <n>           Concurrent batch requests. Defaults to 1.',
        `  --input-token-budget <n>    Approximate prompt token budget per request. Defaults to ${DEFAULT_INPUT_TOKEN_BUDGET}.`,
        '  --retries <n>               Retries before splitting/failing a batch. Defaults to 2.',
        '  --system-prompt <text>      Full batch system prompt override.',
        '  --compact                   Write compact JSON instead of pretty JSON.',
        '  --overwrite                 Retranslate records even when translation is already set.',
        '  --dry-run                   Build batches and print stats without calling the model.',
        '  -h, --help                  Show this help.',
        '',
        'Notes:',
        '  Output tokens are capped at 2x the estimated request input tokens.',
    ].join('\n');
}

function parseArgs(argv) {
    const options = {
        in: DEFAULT_INPUT_FILE,
        config: DEFAULT_CONFIG_FILE,
        concurrency: DEFAULT_CONCURRENCY,
        inputTokenBudget: DEFAULT_INPUT_TOKEN_BUDGET,
        retries: DEFAULT_RETRIES,
        systemPrompt: null,
        pretty: true,
        overwrite: false,
        dryRun: false,
        help: false,
    };

    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '-h' || arg === '--help') {
            options.help = true;
        } else if (arg === '--compact') {
            options.pretty = false;
        } else if (arg === '--overwrite') {
            options.overwrite = true;
        } else if (arg === '--dry-run') {
            options.dryRun = true;
        } else if (arg === '--in' || arg === '--config' || arg === '--system-prompt'
            || arg === '--concurrency' || arg === '--input-token-budget' || arg === '--retries') {
            const value = argv[i + 1];
            if (!value || value.startsWith('--')) {
                throw new Error(`${arg} requires a value.`);
            }
            i += 1;
            applyOptionValue(options, arg.slice(2), value);
        } else if (arg.startsWith('--in=')) {
            options.in = arg.slice('--in='.length);
        } else if (arg.startsWith('--config=')) {
            options.config = arg.slice('--config='.length);
        } else if (arg.startsWith('--system-prompt=')) {
            options.systemPrompt = arg.slice('--system-prompt='.length);
        } else if (arg.startsWith('--concurrency=')) {
            applyOptionValue(options, 'concurrency', arg.slice('--concurrency='.length));
        } else if (arg.startsWith('--input-token-budget=')) {
            applyOptionValue(options, 'input-token-budget', arg.slice('--input-token-budget='.length));
        } else if (arg.startsWith('--retries=')) {
            applyOptionValue(options, 'retries', arg.slice('--retries='.length));
        } else {
            throw new Error(`Unknown argument: ${arg}`);
        }
    }

    options.in = path.resolve(options.in);
    options.config = path.resolve(options.config);
    return options;
}

function applyOptionValue(options, name, value) {
    if (name === 'in' || name === 'config') {
        options[name] = value;
        return;
    }
    if (name === 'system-prompt') {
        options.systemPrompt = value;
        return;
    }

    const numeric = Number(value);
    if (!Number.isInteger(numeric) || numeric <= 0) {
        throw new Error(`--${name} must be a positive integer.`);
    }

    if (name === 'concurrency') {
        options.concurrency = numeric;
    } else if (name === 'input-token-budget') {
        options.inputTokenBudget = numeric;
    } else if (name === 'retries') {
        options.retries = numeric;
    } else {
        throw new Error(`Unsupported option: ${name}`);
    }
}

module.exports = {
    applyOptionValue,
    parseArgs,
    usage,
};
