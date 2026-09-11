export interface OwnDataField {
    readonly present: boolean;
    readonly value: unknown;
}
const getOwnPropertyDescriptorIntrinsic = Object.getOwnPropertyDescriptor;
function isObjectReference(value: unknown): value is object {
    return (typeof value === 'object' && value !== null) || typeof value === 'function';
}
export function readOwnData(value: unknown, key: PropertyKey): OwnDataField {
    if (!isObjectReference(value))
        return { present: false, value: undefined };
    const descriptor = getOwnPropertyDescriptorIntrinsic(value, key);
    return descriptor && 'value' in descriptor
        ? { present: true, value: descriptor.value as unknown }
        : { present: false, value: undefined };
}
