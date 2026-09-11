export interface LlamafileArtifact {
    readonly id: 'runtime' | 'target' | 'draft';
    readonly fileName: string;
    readonly url: string;
    readonly size: number;
    readonly sha256: string;
}
export const LLAMAFILE_RUNTIME = Object.freeze({
    id: 'runtime' as const,
    version: '0.10.5',
    fileName: 'llamafile-0.10.5.exe',
    url: 'https://huggingface.co/mozilla-ai/llamafile_0.10/resolve/11934da1d056dc039d38ba4c37b8fdb93d66b556/llamafile-0.10.5?download=true',
    size: 350768862,
    sha256: '417bcc3348cd5162c2751812fc0ea2f6e79e89e7be6f17e8401ed95de2ed4246',
});
export function selectLlamafileRuntime(platform: string, arch: string): LlamafileArtifact {
    if (!((platform === 'win32' && arch === 'x64') ||
        ((platform === 'darwin' || platform === 'linux') && (arch === 'x64' || arch === 'arm64')))) {
        const error = new Error(`Managed llamafile does not support ${platform}/${arch}. Use Windows x64, macOS x64/ARM64, or Linux x64/ARM64.`);
        throw Object.assign(error, { code: 'LLAMAFILE_UNSUPPORTED_PLATFORM' });
    }
    if (platform === 'darwin' || arch === 'arm64')
        return Object.freeze({
            id: 'runtime',
            fileName: 'llamafile-0.10.5-thin',
            url: 'https://huggingface.co/mozilla-ai/llamafile_0.10/resolve/11934da1d056dc039d38ba4c37b8fdb93d66b556/llamafile-0.10.5-thin?download=true',
            size: 42328074,
            sha256: '55c69c1be9d6ad2172e2d1c0acc677a60ea8ff60232009a8c8170f5bcb917611',
        });
    return LLAMAFILE_RUNTIME;
}
const MODEL_REVISION = '7b92b5b28818151e8669af2e45e88d6086f490dd';
const MODEL_ROOT = `https://huggingface.co/unsloth/gemma-4-26B-A4B-it-qat-GGUF/resolve/${MODEL_REVISION}`;
const A4B_MODELS: readonly LlamafileArtifact[] = Object.freeze([
    Object.freeze({
        id: 'target',
        fileName: 'gemma-4-26B-A4B-it-qat-UD-Q4_K_XL.gguf',
        url: `${MODEL_ROOT}/gemma-4-26B-A4B-it-qat-UD-Q4_K_XL.gguf?download=true`,
        size: 14249047104,
        sha256: 'a7c5bc715f5ff8e99a3e8901ce7d2b42b402c669bf24f7c5250747633d0f5891',
    }),
    Object.freeze({
        id: 'draft',
        fileName: 'mtp-gemma-4-26B-A4B-it-Q4_0.gguf',
        url: `${MODEL_ROOT}/MTP/mtp-gemma-4-26B-A4B-it-Q4_0.gguf?download=true`,
        size: 251939328,
        sha256: '7272d97595f0d4c74bd7b623492b7dbdaafd8b7c72f329a8270ba4eca68f768a',
    }),
]);
const E4B_ROOT = 'https://huggingface.co/huihui-ai/Huihui-gemma-4-E4B-it-qat-q4_0-unquantized-abliterated-GGUF/resolve/bc37dec4db35ea0fcad97be7a8c6b3f6a499616b';
const E4B_MODELS: readonly LlamafileArtifact[] = Object.freeze([
    Object.freeze({
        id: 'target',
        fileName: 'Huihui-gemma-4-E4B-it-qat-q4_0-unquantized-abliterated-Q4_K.gguf',
        url: `${E4B_ROOT}/Huihui-gemma-4-E4B-it-qat-q4_0-unquantized-abliterated-Q4_K.gguf?download=true`,
        size: 5302272352,
        sha256: '64434f2da081f912729e5c4732def7303eb5244d3fee493b9675bc4e9af52d4c',
    }),
    Object.freeze({
        id: 'draft',
        fileName: 'Huihui-gemma-4-E4B-it-qat-abliterated-mtp-bf16.gguf',
        url: `${E4B_ROOT}/mtp-ggml-model-bf16.gguf?download=true`,
        size: 171784672,
        sha256: 'f784491087cdcbfdd2307648ccfc5af1c06d9aa17759587cd87078eb1c453c59',
    }),
]);
const MODEL_12B_ROOT = 'https://huggingface.co/HauhauCS/Gemma4-12B-QAT-Uncensored-HauhauCS-Balanced/resolve/ae8045ac2bd216293ca49a3065da2c942dde4b68';
const MODELS_12B: readonly LlamafileArtifact[] = Object.freeze([
    Object.freeze({
        id: 'target',
        fileName: 'Gemma4-12B-QAT-Uncensored-HauhauCS-Balanced-Q4_K_M.gguf',
        url: `${MODEL_12B_ROOT}/Gemma4-12B-QAT-Uncensored-HauhauCS-Balanced-Q4_K_M.gguf?download=true`,
        size: 7381381760,
        sha256: '59656d7494d6376ca97e9e20b64ea2e16cd97f12ec6d47bfccba91cb785b5134',
    }),
    Object.freeze({
        id: 'draft',
        fileName: 'mtp-gemma-4-12B-it.gguf',
        url: `${MODEL_12B_ROOT}/mtp-gemma-4-12B-it.gguf?download=true`,
        size: 253707328,
        sha256: 'c50c91c35f04903815b2e8930cbb8c8c5bee0e1aa00748c30a7b8ff05d2310b4',
    }),
]);
export type LlamafileProfileId = 'gemma-4-26b-a4b' | 'gemma-4-e4b' | 'gemma-4-12b';
export interface LlamafileModelProfile {
    readonly id: LlamafileProfileId;
    readonly modelAlias: string;
    readonly models: readonly LlamafileArtifact[];
    readonly flashAttention: 'on' | 'off';
    readonly draftTokens: number;
}
export const LLAMAFILE_PROFILES = Object.freeze({
    'gemma-4-26b-a4b': Object.freeze({
        id: 'gemma-4-26b-a4b',
        modelAlias: 'gemma-4-26b-a4b',
        models: A4B_MODELS,
        flashAttention: 'on',
        draftTokens: 2,
    }),
    'gemma-4-e4b': Object.freeze({
        id: 'gemma-4-e4b',
        modelAlias: 'gemma-4-e4b',
        models: E4B_MODELS,
        flashAttention: 'off',
        draftTokens: 4,
    }),
    'gemma-4-12b': Object.freeze({
        id: 'gemma-4-12b',
        modelAlias: 'gemma-4-12b',
        models: MODELS_12B,
        flashAttention: 'on',
        draftTokens: 2,
    }),
} satisfies Record<LlamafileProfileId, LlamafileModelProfile>);
export function selectLlamafileProfile(value: unknown = 'gemma-4-26b-a4b'): LlamafileModelProfile {
    if (value === 'gemma-4-26b-a4b' || value === 'gemma-4-e4b' || value === 'gemma-4-12b')
        return LLAMAFILE_PROFILES[value];
    throw new Error('translator.jsonc has invalid "settings.llamafile.profile" (must be "gemma-4-e4b", "gemma-4-12b" or "gemma-4-26b-a4b").');
}
export const LLAMAFILE_SERVER_PROFILE = Object.freeze({
    temperature: 1,
    topP: 0.95,
    topK: 64,
    minP: 0,
    repeatPenalty: 1,
});
