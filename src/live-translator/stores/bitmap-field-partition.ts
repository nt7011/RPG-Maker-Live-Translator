import { characters } from './styled-text.js';
import type { BitmapTextAlignment } from './bitmap-text-layout.js';
export interface BitmapFieldMember {
    readonly text: string;
    readonly alignment: BitmapTextAlignment;
    readonly units: readonly object[];
}
export interface BitmapFieldRange {
    readonly start: number;
    readonly end: number;
}
export function bitmapFieldDomains(members: readonly BitmapFieldMember[], refused?: (reason: string) => void): readonly BitmapFieldRange[] | null {
    const reject = (reason: string): null => {
        refused?.(reason);
        return null;
    };
    const domains: {
        start: number;
        end: number;
    }[] = [];
    const domainAt: number[] = [];
    for (const [index, member] of members.entries()) {
        if (index === 0 || member.alignment !== members[index - 1]?.alignment)
            domains.push({ start: index, end: index + 1 });
        const domain = domains.at(-1);
        if (domain === undefined)
            throw new Error('Missing alignment domain.');
        domain.end = index + 1;
        domainAt.push(domains.length - 1);
    }
    if (domains.length < 2)
        return null;
    const units = new Map<object, number>();
    for (const [index, member] of members.entries()) {
        const domain = domainAt[index];
        if (domain === undefined)
            throw new Error('Missing placement domain.');
        for (const unit of member.units) {
            const previous = units.get(unit);
            if (previous !== undefined && previous !== domain)
                return reject('partition-divides-physical-unit');
            units.set(unit, domain);
        }
    }
    const text = members.map((member) => member.text).join('');
    let offset = 0;
    const boundaries = new Set([0]);
    for (const character of characters(text))
        boundaries.add((offset += character.length));
    offset = 0;
    for (const [index, member] of members.entries()) {
        if (index > 0 && domainAt[index] !== domainAt[index - 1] && !boundaries.has(offset))
            return reject('partition-divides-grapheme');
        offset += member.text.length;
    }
    return domains;
}
export function acceptBitmapFieldCuts(domains: readonly BitmapFieldRange[] | null, commonSources: Iterable<Iterable<number>>, refused?: (reason: string) => void): readonly BitmapFieldRange[] | null {
    if (domains === null)
        return null;
    const domainAt: number[] = [];
    for (const [index, domain] of domains.entries())
        for (let member = domain.start; member < domain.end; member++)
            domainAt[member] = index;
    for (const members of commonSources) {
        let first: number | undefined;
        for (const member of members) {
            const domain = domainAt[member];
            if (domain === undefined)
                continue;
            if (first !== undefined && first !== domain) {
                refused?.('crossing-source-witness');
                return null;
            }
            first = domain;
        }
    }
    return domains;
}
