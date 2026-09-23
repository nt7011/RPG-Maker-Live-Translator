export type ForesightAction = 'advance' | 'message' | 'choice' | 'condition' | 'call' | 'route' | 'route-continuation' | 'battle' | 'marker' | 'barrier';
interface Policy {
    readonly action: ForesightAction;
    readonly uncertainty: 'none' | 'state' | 'external';
}
const policies = new Map<number, Policy>();
function define(action: ForesightAction, uncertainty: Policy['uncertainty'], codes: readonly number[]): void {
    const policy = Object.freeze({ action, uncertainty });
    for (const code of codes)
        policies.set(code, policy);
}
define('advance', 'none', [
    0, 105, 108, 118, 204, 211, 212, 213, 216, 217, 221, 222, 223, 224, 225, 230, 231, 232, 233, 234, 235, 236, 241,
    242, 243, 244, 245, 246, 247, 248, 249, 250, 251, 261, 351, 352, 405, 408,
]);
define('message', 'none', [101]);
define('choice', 'none', [102]);
define('advance', 'state', [
    103, 104, 121, 122, 123, 124, 125, 126, 127, 128, 129, 132, 133, 134, 135, 136, 137, 138, 139, 140, 202, 203,
    206, 214, 281, 282, 283, 284, 285, 302, 303, 311, 312, 313, 314, 315, 316, 317, 318, 319, 320, 321, 322, 323,
    324, 325, 326, 331, 332, 333, 334, 335, 336, 337, 339, 342, 605,
]);
define('condition', 'none', [111]);
define('call', 'none', [117]);
define('barrier', 'state', [201]);
define('route', 'state', [205]);
define('battle', 'none', [301]);
define('advance', 'external', [355, 356, 357, 655, 657]);
define('marker', 'none', [402, 403, 404, 411, 412, 601, 602, 603, 604]);
define('route-continuation', 'state', [505]);
const barrier: Policy = Object.freeze({ action: 'barrier', uncertainty: 'none' });
export function foresightPolicy(code: number): Policy {
    return policies.get(code) ?? barrier;
}
