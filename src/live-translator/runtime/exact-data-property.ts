import { commitDescriptorTransaction, compensateDescriptorTransaction, createDataDescriptorUpdate, descriptorTransactionMatches, type DescriptorTransactionUpdate, } from './descriptor-transaction.js';
type PropertyBag = Record<PropertyKey, unknown>;
type CurrentPredicate = () => boolean;
export interface ExactDataPropertyAuthority {
    readonly identity: object;
    readonly generation: number;
    readonly isCurrent: CurrentPredicate;
}
export type ExactDataPropertyStatus = 'committed' | 'rejected' | 'superseded';
export interface ExactDataPropertyOperation {
    readonly authority: ExactDataPropertyAuthority;
    readonly key: PropertyKey;
    readonly target: PropertyBag;
    readonly commit: () => ExactDataPropertyStatus;
    readonly matches: () => boolean;
    readonly restore: () => ExactDataPropertyStatus;
}
export interface ExactDataPropertyStore {
    readonly createRecord: <RecordValue extends object>(fields: RecordValue) => RecordValue;
    readonly isRecord: (value: unknown) => value is PropertyBag;
    readonly issueAuthority: (identity: object, generation: number, isCurrent: CurrentPredicate) => ExactDataPropertyAuthority;
    readonly isAuthority: (value: unknown) => value is ExactDataPropertyAuthority;
    readonly sealReceipt: <Receipt extends object>(authority: ExactDataPropertyAuthority, receipt: Receipt) => Readonly<Receipt>;
    readonly verifiesReceipt: (authority: ExactDataPropertyAuthority, receipt: unknown) => boolean;
    readonly prepare: (authority: ExactDataPropertyAuthority, target: unknown, key: PropertyKey, value: unknown) => ExactDataPropertyOperation;
}
type OperationPhase = 'prepared' | 'committed' | 'restored' | 'rejected' | 'superseded';
interface ReceiptBinding {
    readonly authority: ExactDataPropertyAuthority;
    readonly phase: 'sealing' | 'sealed';
}
const IntrinsicWeakMap = WeakMap;
const IntrinsicWeakSet = WeakSet;
const IntrinsicRangeError = RangeError;
const IntrinsicTypeError = TypeError;
const apply = Reflect.apply;
const defineProperty = Reflect.defineProperty;
const getOwnPropertyDescriptor = Reflect.getOwnPropertyDescriptor;
const getPrototypeOf = Reflect.getPrototypeOf;
const ownKeys = Reflect.ownKeys;
const freeze = Object.freeze;
const isFrozen = Object.isFrozen;
const isSafeInteger = Number.isSafeInteger;
const objectIs = Object.is;
const objectPrototype = Object.prototype;
const hasOwnProperty = Object.prototype.hasOwnProperty;
const weakMapDelete = WeakMap.prototype.delete;
const weakMapGet = WeakMap.prototype.get;
const weakMapSet = WeakMap.prototype.set;
const weakSetAdd = WeakSet.prototype.add;
const weakSetHas = WeakSet.prototype.has;
function isObjectReference(value: unknown): value is object {
    return (typeof value === 'object' && value !== null) || typeof value === 'function';
}
function exactCurrent(authority: ExactDataPropertyAuthority): boolean | null {
    try {
        return objectIs(apply(authority.isCurrent, authority, []), true);
    }
    catch {
        return null;
    }
}
export function createExactDataPropertyStore(): ExactDataPropertyStore {
    const records = new IntrinsicWeakSet<object>();
    const authorities = new IntrinsicWeakSet<object>();
    const receiptBindings = new IntrinsicWeakMap<object, ReceiptBinding>();
    function isRecord(value: unknown): value is PropertyBag {
        return isObjectReference(value) && apply(weakSetHas, records, [value]);
    }
    function createRecord<RecordValue extends object>(fields: RecordValue): RecordValue {
        if (!isObjectReference(fields)) {
            throw new IntrinsicTypeError('Exact data-property record fields must be an object.');
        }
        const record: PropertyBag = {};
        const keys = ownKeys(fields);
        for (let index = 0; index < keys.length; index += 1) {
            const key = keys[index];
            if (key === undefined)
                throw new IntrinsicTypeError('Exact data-property record key is missing.');
            const descriptor = getOwnPropertyDescriptor(fields, key);
            if (!descriptor || !apply(hasOwnProperty, descriptor, ['value'])) {
                throw new IntrinsicTypeError('Exact data-property record fields must be own data properties.');
            }
            if (!defineProperty(record, key, descriptor)) {
                throw new IntrinsicTypeError('Exact data-property record field could not be authored.');
            }
        }
        apply(weakSetAdd, records, [record]);
        return record as RecordValue;
    }
    function isAuthority(value: unknown): value is ExactDataPropertyAuthority {
        return isObjectReference(value) && apply(weakSetHas, authorities, [value]);
    }
    function issueAuthority(identity: object, generation: number, isCurrent: CurrentPredicate): ExactDataPropertyAuthority {
        if (!isObjectReference(identity) || typeof isCurrent !== 'function') {
            throw new IntrinsicTypeError('Exact data-property authority requires private identity and a current predicate.');
        }
        if (!isSafeInteger(generation) || generation < 0) {
            throw new IntrinsicRangeError('Exact data-property authority generation must be a non-negative safe integer.');
        }
        const authority: ExactDataPropertyAuthority = freeze({ generation, identity, isCurrent });
        apply(weakSetAdd, authorities, [authority]);
        return authority;
    }
    function sealReceipt<Receipt extends object>(authority: ExactDataPropertyAuthority, receipt: Receipt): Readonly<Receipt> {
        if (!isAuthority(authority) || !isObjectReference(receipt)) {
            throw new IntrinsicTypeError('Exact data-property receipt requires issued authority and object evidence.');
        }
        const existing = apply(weakMapGet, receiptBindings, [receipt]) as ReceiptBinding | undefined;
        if (existing) {
            if (existing.authority === authority && existing.phase === 'sealed')
                return receipt;
            throw new IntrinsicTypeError('Exact data-property receipt is already bound or is still sealing.');
        }
        const sealing: ReceiptBinding = freeze({ authority, phase: 'sealing' });
        apply(weakMapSet, receiptBindings, [receipt, sealing]);
        try {
            const sealed = freeze(receipt);
            if (sealed !== receipt || !isFrozen(receipt) || apply(weakMapGet, receiptBindings, [receipt]) !== sealing) {
                throw new IntrinsicTypeError('Exact data-property receipt could not be sealed exactly.');
            }
            apply(weakMapSet, receiptBindings, [receipt, freeze({ authority, phase: 'sealed' })]);
            return receipt;
        }
        catch (error) {
            if (apply(weakMapGet, receiptBindings, [receipt]) === sealing) {
                apply(weakMapDelete, receiptBindings, [receipt]);
            }
            throw error;
        }
    }
    function verifiesReceipt(authority: ExactDataPropertyAuthority, receipt: unknown): boolean {
        if (!isAuthority(authority) || !isObjectReference(receipt))
            return false;
        const binding = apply(weakMapGet, receiptBindings, [receipt]) as ReceiptBinding | undefined;
        return binding?.authority === authority && binding.phase === 'sealed';
    }
    function prepare(authority: ExactDataPropertyAuthority, targetValue: unknown, key: PropertyKey, value: unknown): ExactDataPropertyOperation {
        if (!isAuthority(authority)) {
            throw new IntrinsicTypeError('Exact data-property publication requires an issued authority.');
        }
        if (!isRecord(targetValue)) {
            throw new IntrinsicTypeError('Exact data-property publication requires an admitted runtime record.');
        }
        const targetPrototype = getPrototypeOf(targetValue);
        if (targetPrototype !== objectPrototype && targetPrototype !== null) {
            throw new IntrinsicTypeError('Exact data-property runtime record prototype has changed.');
        }
        if (typeof key !== 'string' && typeof key !== 'symbol') {
            throw new IntrinsicTypeError('Exact data-property publication requires an exact property key.');
        }
        const target = targetValue;
        const admittedPrototype = targetPrototype;
        const candidate = createDataDescriptorUpdate(target, key, value);
        if (!candidate) {
            throw new IntrinsicTypeError('Exact data-property publication requires a mutable own data slot.');
        }
        const update: DescriptorTransactionUpdate = candidate;
        let phase: OperationPhase = 'prepared';
        function targetStillAdmitted(): boolean {
            return getPrototypeOf(target) === admittedPrototype;
        }
        function matches(): boolean {
            if (phase !== 'committed')
                return false;
            if (!targetStillAdmitted()) {
                phase = 'rejected';
                return false;
            }
            if (descriptorTransactionMatches([update], 'prepared'))
                return true;
            phase = 'rejected';
            return false;
        }
        function restore(): ExactDataPropertyStatus {
            if (phase === 'restored')
                return 'committed';
            if (phase === 'superseded')
                return 'superseded';
            if (phase === 'rejected')
                return 'rejected';
            if (phase === 'prepared') {
                phase = 'restored';
                return 'committed';
            }
            if (!targetStillAdmitted()) {
                phase = 'rejected';
                return phase;
            }
            const compensated = compensateDescriptorTransaction([update]);
            if (compensated.compensated) {
                phase = 'restored';
                return 'committed';
            }
            phase = exactCurrent(authority) === false ? 'superseded' : 'rejected';
            return phase;
        }
        function commit(): ExactDataPropertyStatus {
            if (phase === 'committed') {
                if (matches())
                    return 'committed';
                phase = 'rejected';
                return phase;
            }
            if (phase === 'restored' || phase === 'superseded')
                return 'superseded';
            if (phase === 'rejected')
                return 'rejected';
            if (!targetStillAdmitted()) {
                phase = 'rejected';
                return phase;
            }
            const before = exactCurrent(authority);
            if (before === false) {
                phase = 'superseded';
                return phase;
            }
            if (before === null) {
                phase = 'rejected';
                return phase;
            }
            const result = commitDescriptorTransaction([update]);
            if (!result.committed) {
                phase = 'rejected';
                return phase;
            }
            phase = 'committed';
            const after = exactCurrent(authority);
            if (after === true && matches())
                return 'committed';
            const compensated = compensateDescriptorTransaction([update]);
            if (!compensated.compensated) {
                phase = 'rejected';
                return phase;
            }
            phase = after === false ? 'superseded' : 'rejected';
            return phase;
        }
        return freeze({ authority, commit, key, matches, restore, target });
    }
    return freeze({ createRecord, isAuthority, isRecord, issueAuthority, prepare, sealReceipt, verifiesReceipt });
}
export const exactDataProperties = createExactDataPropertyStore();
export function createExactDataPropertyAuthority(identity: object, generation: number, isCurrent: CurrentPredicate): ExactDataPropertyAuthority {
    return exactDataProperties.issueAuthority(identity, generation, isCurrent);
}
export function createExactDataPropertyRecord<RecordValue extends object>(fields: RecordValue): RecordValue {
    return exactDataProperties.createRecord(fields);
}
export function createExactDataPropertyReceipt<Receipt extends object>(authority: ExactDataPropertyAuthority, receipt: Receipt): Readonly<Receipt> {
    return exactDataProperties.sealReceipt(authority, receipt);
}
