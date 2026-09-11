const SHA256_BLOCK_BYTES = 64;
const SHA256_LENGTH_BYTES = 8;
const SHA256_WORDS = 64;
const HEX_DIGITS = '0123456789abcdef';
const arrayIsArray = Array.isArray;
const reflectApply = Reflect.apply;
const textEncoder = new TextEncoder();
const textEncode = TextEncoder.prototype.encode;
const Uint8ArrayConstructor = Uint8Array;
const Uint32ArrayConstructor = Uint32Array;
const IdentityTypeError = TypeError;
const IdentityRangeError = RangeError;
const IdentityError = Error;
const SHA256_INITIAL_STATE = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
] as const;
const SHA256_ROUND_CONSTANTS = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98,
    0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
    0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8,
    0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819,
    0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
    0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
    0xc67178f2,
] as const;
export interface IdentityCodecModule {
    readonly version: 'v1';
    encode(domain: string, components: readonly string[]): string;
}
export function encodeStableIdentity(domain: string, components: readonly string[]): string {
    if (typeof domain !== 'string' || !domain) {
        throw new IdentityTypeError('Identity domain must be a non-empty string.');
    }
    if (!arrayIsArray(components)) {
        throw new IdentityTypeError('Identity components must be an array of strings.');
    }
    const hasher = new Sha256Accumulator();
    writeFramedUtf8(hasher, 'rmlt-identity');
    writeFramedUtf8(hasher, 'v1');
    writeFramedUtf8(hasher, domain);
    hasher.writeAsciiInteger(components.length);
    hasher.writeByte(0x3a);
    for (let index = 0; index < components.length; index += 1) {
        const component: unknown = components[index] as unknown;
        if (typeof component !== 'string') {
            throw new IdentityTypeError('Every identity component must be a string.');
        }
        writeFramedUtf8(hasher, component);
    }
    return `v1:${hasher.digestHex()}`;
}
export function createIdentityCodecModule(): IdentityCodecModule {
    return {
        version: 'v1',
        encode: encodeStableIdentity,
    };
}
class Sha256Accumulator {
    private readonly state = copyInitialState();
    private readonly block = new Uint8ArrayConstructor(SHA256_BLOCK_BYTES);
    private readonly schedule = new Uint32ArrayConstructor(SHA256_WORDS);
    private blockLength = 0;
    private totalBytes = 0;
    private finalized = false;
    writeByte(value: number): void {
        if (this.finalized)
            throw new IdentityError('SHA-256 accumulator is already finalized.');
        this.block[this.blockLength] = value & 0xff;
        this.blockLength += 1;
        this.totalBytes += 1;
        if (this.blockLength === SHA256_BLOCK_BYTES) {
            this.compressBlock();
            this.blockLength = 0;
        }
    }
    writeBytes(bytes: Uint8Array): void {
        for (const byte of bytes)
            this.writeByte(byte);
    }
    writeAsciiInteger(value: number): void {
        if (value < 0 || value % 1 !== 0) {
            throw new IdentityRangeError('Identity framing requires a nonnegative integer.');
        }
        if (value === 0) {
            this.writeByte(0x30);
            return;
        }
        let divisor = 1;
        while (value >= divisor * 10)
            divisor *= 10;
        let remainder = value;
        while (divisor >= 1) {
            const tail = remainder % divisor;
            this.writeByte(0x30 + (remainder - tail) / divisor);
            remainder = tail;
            divisor /= 10;
        }
    }
    digestHex(): string {
        if (this.finalized)
            throw new IdentityError('SHA-256 accumulator is already finalized.');
        const messageBytes = this.totalBytes;
        this.writeByte(0x80);
        while (this.blockLength !== SHA256_BLOCK_BYTES - SHA256_LENGTH_BYTES)
            this.writeByte(0);
        const bitLength = messageBytes * 8;
        const highBits = (bitLength - (bitLength % 0x100000000)) / 0x100000000;
        const lowBits = bitLength >>> 0;
        writeUint32BigEndian(this, highBits);
        writeUint32BigEndian(this, lowBits);
        this.finalized = true;
        let digest = '';
        for (let index = 0; index < this.state.length; index += 1) {
            const word = this.state[index]!;
            for (let shift = 28; shift >= 0; shift -= 4) {
                const digit = HEX_DIGITS[(word >>> shift) & 0x0f];
                if (!digit)
                    throw new IdentityError('SHA-256 digest encoding failed.');
                digest += digit;
            }
        }
        return digest;
    }
    private compressBlock(): void {
        const words = this.schedule;
        for (let index = 0; index < 16; index += 1) {
            const offset = index * 4;
            words[index] =
                (this.block[offset]! << 24) |
                    (this.block[offset + 1]! << 16) |
                    (this.block[offset + 2]! << 8) |
                    this.block[offset + 3]!;
        }
        for (let index = 16; index < SHA256_WORDS; index += 1) {
            const previous15 = words[index - 15]!;
            const previous2 = words[index - 2]!;
            const sigma0 = rotateRight(previous15, 7) ^ rotateRight(previous15, 18) ^ (previous15 >>> 3);
            const sigma1 = rotateRight(previous2, 17) ^ rotateRight(previous2, 19) ^ (previous2 >>> 10);
            words[index] = (words[index - 16]! + sigma0 + words[index - 7]! + sigma1) >>> 0;
        }
        let a = this.state[0]!;
        let b = this.state[1]!;
        let c = this.state[2]!;
        let d = this.state[3]!;
        let e = this.state[4]!;
        let f = this.state[5]!;
        let g = this.state[6]!;
        let h = this.state[7]!;
        for (let index = 0; index < SHA256_WORDS; index += 1) {
            const sigma1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
            const choose = (e & f) ^ (~e & g);
            const first = (h + sigma1 + choose + SHA256_ROUND_CONSTANTS[index]! + words[index]!) >>> 0;
            const sigma0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
            const majority = (a & b) ^ (a & c) ^ (b & c);
            const second = (sigma0 + majority) >>> 0;
            h = g;
            g = f;
            f = e;
            e = (d + first) >>> 0;
            d = c;
            c = b;
            b = a;
            a = (first + second) >>> 0;
        }
        this.state[0] = (this.state[0]! + a) >>> 0;
        this.state[1] = (this.state[1]! + b) >>> 0;
        this.state[2] = (this.state[2]! + c) >>> 0;
        this.state[3] = (this.state[3]! + d) >>> 0;
        this.state[4] = (this.state[4]! + e) >>> 0;
        this.state[5] = (this.state[5]! + f) >>> 0;
        this.state[6] = (this.state[6]! + g) >>> 0;
        this.state[7] = (this.state[7]! + h) >>> 0;
    }
}
function rotateRight(value: number, amount: number): number {
    return (value >>> amount) | (value << (32 - amount));
}
function copyInitialState(): Uint32Array {
    const state = new Uint32ArrayConstructor(SHA256_INITIAL_STATE.length);
    for (let index = 0; index < SHA256_INITIAL_STATE.length; index += 1) {
        state[index] = SHA256_INITIAL_STATE[index]!;
    }
    return state;
}
function writeUint32BigEndian(hasher: Sha256Accumulator, value: number): void {
    hasher.writeByte(value >>> 24);
    hasher.writeByte(value >>> 16);
    hasher.writeByte(value >>> 8);
    hasher.writeByte(value);
}
function writeFramedUtf8(hasher: Sha256Accumulator, value: string): void {
    const bytes = reflectApply(textEncode, textEncoder, [value]) as Uint8Array;
    hasher.writeAsciiInteger(bytes.byteLength);
    hasher.writeByte(0x3a);
    hasher.writeBytes(bytes);
}
