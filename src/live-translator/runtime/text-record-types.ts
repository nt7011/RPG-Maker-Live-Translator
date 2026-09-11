export interface SemanticTranslationFailure {
    readonly stage: 'admission' | 'provider' | 'encoding' | 'decoding';
    readonly reason: string;
    readonly code: string | null;
    readonly message: string | null;
    readonly truncated: boolean;
    readonly recovery: 'new-appearance' | 'input-change';
}
export interface TextRecordRequest {
    readonly priority: number;
    readonly stream: boolean;
}
export interface SemanticTextRecordSnapshot {
    readonly translator: TranslatorExchange | null;
    readonly textId: number;
    readonly semanticRevision: number;
    readonly attempt: number | null;
    readonly sourceText: string;
    readonly state: 'observed' | 'translating' | 'available' | 'no-translation' | 'failed';
    readonly translation: string | null;
    readonly reason: string | null;
    readonly failure: SemanticTranslationFailure | null;
    readonly request: TextRecordRequest | null;
}
export interface RuntimeTextRecordSnapshot extends SemanticTextRecordSnapshot {
    readonly onScreenGameMessage: boolean;
}
export interface TextRecordsSnapshot {
    readonly generation: number;
    readonly sequence: number;
    readonly active: boolean;
    readonly records: readonly RuntimeTextRecordSnapshot[];
}
export interface TranslatorExchange {
    readonly input: string;
    readonly output: string | null;
    readonly markerMismatch: boolean;
}
