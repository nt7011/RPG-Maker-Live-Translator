import type { ThinkBlockStripper, TranslationProviderCommonModule } from '../common.js';
type FalsySensitiveValue = string | number | boolean | bigint | symbol | object;
interface LlamaCppProtocolDependencies {
    readonly createThinkBlockStripper: () => ThinkBlockStripper;
    readonly DEFAULT_LOCAL_MAX_OUTPUT_TOKENS: number;
}
interface LlamaCppConfigCandidate {
    readonly model?: unknown;
    readonly max_output_tokens?: unknown;
    readonly temperature?: unknown;
    readonly top_p?: unknown;
    readonly top_k?: unknown;
    readonly min_p?: unknown;
    readonly repeat_penalty?: unknown;
}
interface LlamaCppModelCandidate {
    readonly id?: unknown;
    readonly owned_by?: unknown;
}
interface LlamaCppSlotPropertiesCandidate {
    readonly total_slots?: unknown;
}
interface LlamaCppSelectionCandidate {
    readonly requestedModel?: unknown;
}
interface MessageCandidate {
    readonly content?: unknown;
}
interface MessagePartCandidate {
    readonly text?: unknown;
}
interface ChoiceCandidate {
    readonly message?: unknown;
    readonly delta?: unknown;
    readonly finish_reason?: unknown;
}
interface ChoicesCandidate {
    readonly choices?: unknown;
}
interface ErrorCandidate {
    readonly message?: unknown;
}
export interface LlamaCppModelSelection {
    readonly configuredModel: string;
    readonly requestedModel: string;
    readonly modelKey: string;
    readonly modelAuthor: string;
    readonly modelName: string;
}
export interface LlamaCppChatMessage {
    readonly role: 'system' | 'user';
    readonly content: unknown;
}
export interface LlamaCppChatBody {
    readonly model: unknown;
    readonly messages: LlamaCppChatMessage[];
    readonly stream: boolean;
    readonly chat_template_kwargs: {
        readonly enable_thinking: false;
    };
    readonly thinking_budget_tokens: 0;
    readonly max_tokens: unknown;
    temperature?: unknown;
    top_p?: unknown;
    top_k?: unknown;
    min_p?: unknown;
    repeat_penalty?: unknown;
}
export interface LlamaCppSseEvent {
    readonly done: boolean;
    readonly content: string;
    readonly finishReason?: string;
}
export interface LlamaCppCompletion {
    readonly content: string;
    readonly finishReason: string;
}
export interface LlamaCppSseParser {
    feed(chunk: unknown): LlamaCppSseEvent[];
    finish(chunk?: unknown): LlamaCppSseEvent[];
}
export interface LlamaCppProtocolModule {
    selectLlamaCppModel(models: unknown, cfg: unknown): LlamaCppModelSelection;
    readLlamaCppSlotCapacity(props: unknown): number;
    buildLlamaCppChatBody(sourceText: unknown, cfg: unknown, selection: unknown, stream: unknown, systemPrompt?: string): LlamaCppChatBody;
    extractLlamaCppCompletion(data: unknown): LlamaCppCompletion;
    sanitizeLlamaCppOutput(value: unknown): string;
    readonly createThinkBlockStripper: () => ThinkBlockStripper;
    createLlamaCppSseParser(): LlamaCppSseParser;
}
export function createLlamaCppProtocolModule(common: TranslationProviderCommonModule): LlamaCppProtocolModule {
    const { createThinkBlockStripper, DEFAULT_LOCAL_MAX_OUTPUT_TOKENS } = common as LlamaCppProtocolDependencies;
    function selectLlamaCppModel(models: unknown, cfg: unknown): LlamaCppModelSelection {
        const list: unknown[] = Array.isArray(models) ? models : [];
        const config = cfg as LlamaCppConfigCandidate;
        const configuredModel = typeof config.model === 'string' ? config.model.trim() : '';
        const candidates = list.filter((model) => {
            const candidate = model as FalsySensitiveValue;
            const record = model as LlamaCppModelCandidate;
            return candidate && typeof record.id === 'string' && record.id.trim();
        }) as LlamaCppModelCandidate[];
        let selected: LlamaCppModelCandidate | null = null;
        if (configuredModel.toLowerCase() === 'auto') {
            if (candidates.length !== 1) {
                const ids = candidates.map((model) => (model.id as string).trim()).join(', ') || 'none';
                throw new Error(`The llama.cpp model is "auto", but /v1/models returned ${candidates.length as unknown as string} model(s): ${ids}. ` +
                    'Expose exactly one model or configure its exact model id.');
            }
            selected = candidates[0] as LlamaCppModelCandidate;
        }
        else {
            selected = candidates.find((model) => (model.id as string).trim() === configuredModel) || null;
            if (!selected) {
                throw new Error(`Configured llama.cpp model "${configuredModel}" was not found in /v1/models.`);
            }
        }
        const id = (selected.id as string).trim();
        return {
            configuredModel,
            requestedModel: id,
            modelKey: id,
            modelAuthor: typeof selected.owned_by === 'string' ? selected.owned_by.trim() : '',
            modelName: id,
        };
    }
    function readLlamaCppSlotCapacity(props: unknown): number {
        const propsValue = props as FalsySensitiveValue;
        const candidate = props as LlamaCppSlotPropertiesCandidate;
        const capacity = propsValue && candidate.total_slots;
        if (typeof capacity !== 'number' || !Number.isSafeInteger(capacity) || capacity <= 0) {
            throw new Error('llama.cpp /props response missing positive integer "total_slots".');
        }
        return capacity;
    }
    function buildLlamaCppChatBody(sourceText: unknown, cfg: unknown, selection: unknown, stream: unknown, systemPrompt?: string): LlamaCppChatBody {
        const config = cfg as LlamaCppConfigCandidate;
        const selected = selection as LlamaCppSelectionCandidate;
        const messages: LlamaCppChatMessage[] = [];
        if (systemPrompt)
            messages.push({ role: 'system', content: systemPrompt });
        messages.push({ role: 'user', content: String(sourceText ?? '') });
        const body: LlamaCppChatBody = {
            model: selected.requestedModel,
            messages,
            stream: !!stream,
            chat_template_kwargs: { enable_thinking: false },
            thinking_budget_tokens: 0,
            max_tokens: Number.isFinite(config.max_output_tokens)
                ? config.max_output_tokens
                : DEFAULT_LOCAL_MAX_OUTPUT_TOKENS,
        };
        if (Number.isFinite(config.temperature))
            body.temperature = config.temperature;
        if (Number.isFinite(config.top_p))
            body.top_p = config.top_p;
        if (Number.isFinite(config.top_k))
            body.top_k = config.top_k;
        if (Number.isFinite(config.min_p))
            body.min_p = config.min_p;
        if (Number.isFinite(config.repeat_penalty))
            body.repeat_penalty = config.repeat_penalty;
        return body;
    }
    function readMessageContent(message: unknown): string {
        if (!message || typeof message !== 'object')
            return '';
        const candidate = message as MessageCandidate;
        if (typeof candidate.content === 'string')
            return candidate.content;
        if (!Array.isArray(candidate.content))
            return '';
        return candidate.content
            .map((part) => {
            if (!part || typeof part !== 'object')
                return '';
            const candidatePart = part as MessagePartCandidate;
            return typeof candidatePart.text === 'string' ? candidatePart.text : '';
        })
            .join('');
    }
    function extractLlamaCppCompletion(data: unknown): LlamaCppCompletion {
        const dataValue = data as FalsySensitiveValue;
        const candidate = data as ChoicesCandidate;
        const choice: unknown = dataValue && Array.isArray(candidate.choices) ? (candidate.choices as unknown[])[0] : null;
        const choiceValue = choice as FalsySensitiveValue;
        const choiceCandidate = choice as ChoiceCandidate;
        const content = readMessageContent(choiceValue && choiceCandidate.message);
        const finishReason = choiceValue ? choiceCandidate.finish_reason : '';
        return {
            content,
            finishReason: typeof finishReason === 'string' ? finishReason : '',
        };
    }
    function sanitizeLlamaCppOutput(value: unknown): string {
        if (typeof value !== 'string')
            return '';
        const thinkStripper = createThinkBlockStripper();
        let out = thinkStripper.feed(value);
        out += thinkStripper.finish();
        out = out.replace(/^```(?:(?:[\w-]+)?[^\S\r\n]*(?:\r\n|[\r\n]))?([\s\S]*?)\s*```$/u, '$1');
        return out.trim();
    }
    function createLlamaCppSseParser(): LlamaCppSseParser {
        let buffer = '';
        let terminal = false;
        function appendEvent(events: LlamaCppSseEvent[], raw: unknown): boolean {
            const rawValue = raw as FalsySensitiveValue;
            const data = String(rawValue || '')
                .split(/\r?\n/)
                .filter((line) => line.startsWith('data:'))
                .map((line) => line.slice(5).trimStart())
                .join('\n');
            if (!data)
                return false;
            if (data.trim() === '[DONE]') {
                events.push({ done: true, content: '' });
                terminal = true;
                return true;
            }
            let parsed: unknown;
            try {
                parsed = JSON.parse(data);
            }
            catch (error) {
                const candidateError = error as ErrorCandidate;
                throw new Error(`llama.cpp stream returned malformed JSON: ${(candidateError.message || error) as string}`);
            }
            const parsedValue = parsed as FalsySensitiveValue;
            const parsedCandidate = parsed as ChoicesCandidate;
            const choice: unknown = parsedValue && Array.isArray(parsedCandidate.choices)
                ? (parsedCandidate.choices as unknown[])[0]
                : null;
            events.push({
                done: false,
                content: readMessageContent((choice as FalsySensitiveValue) && (choice as ChoiceCandidate).delta),
                finishReason: (choice as FalsySensitiveValue) && (choice as ChoiceCandidate).finish_reason
                    ? String((choice as ChoiceCandidate).finish_reason)
                    : '',
            });
            return false;
        }
        function drain(final = false): LlamaCppSseEvent[] {
            const events: LlamaCppSseEvent[] = [];
            while (true) {
                const separator = buffer.match(/\r?\n\r?\n/);
                if (!separator)
                    break;
                const separatorIndex = separator.index as number;
                const frame = buffer.slice(0, separatorIndex);
                buffer = buffer.slice(separatorIndex + separator[0].length);
                if (appendEvent(events, frame)) {
                    buffer = '';
                    break;
                }
            }
            if (final && buffer) {
                const frame = buffer;
                buffer = '';
                const finished = appendEvent(events, frame);
                if (finished)
                    terminal = false;
            }
            return events;
        }
        return {
            feed(chunk: unknown) {
                if (terminal)
                    return [];
                const chunkValue = chunk as FalsySensitiveValue;
                buffer += String(chunkValue || '');
                return drain(false);
            },
            finish(chunk: unknown = '') {
                if (terminal)
                    return [];
                const chunkValue = chunk as FalsySensitiveValue;
                buffer += String(chunkValue || '');
                return drain(true);
            },
        };
    }
    return {
        selectLlamaCppModel,
        readLlamaCppSlotCapacity,
        buildLlamaCppChatBody,
        extractLlamaCppCompletion,
        sanitizeLlamaCppOutput,
        createThinkBlockStripper,
        createLlamaCppSseParser,
    };
}
