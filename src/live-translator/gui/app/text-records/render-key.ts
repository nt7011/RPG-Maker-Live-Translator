import { serializeGuiValueOutcome } from '../../projection.js';
export interface TextRecordRenderKey {
    readonly complete: boolean;
    readonly key: string;
}
const UNREADABLE_TEXT_RECORD_RENDER_KEY = '{"$rmltRenderKey":"unreadable"}';
const applyRenderKeyFunction = Reflect.apply;
export function createTextRecordStableRenderKey(value: unknown): TextRecordRenderKey {
    try {
        const outcome = serializeGuiValueOutcome(value);
        return { complete: outcome.complete, key: outcome.text };
    }
    catch {
        return { complete: false, key: UNREADABLE_TEXT_RECORD_RENDER_KEY };
    }
}
export function createTextRecordStableRenderKeyFrom(buildValue: () => unknown): TextRecordRenderKey {
    try {
        return createTextRecordStableRenderKey(applyRenderKeyFunction(buildValue, undefined, []));
    }
    catch {
        return { complete: false, key: UNREADABLE_TEXT_RECORD_RENDER_KEY };
    }
}
