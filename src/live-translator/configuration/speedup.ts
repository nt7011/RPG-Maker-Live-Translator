export const DEFAULT_SPEEDUP_MULTIPLIER = 2;
export const MAX_SPEEDUP_MULTIPLIER = 16;
export function resolveSpeedupMultiplier(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) && value >= 1 && value <= MAX_SPEEDUP_MULTIPLIER
        ? value
        : DEFAULT_SPEEDUP_MULTIPLIER;
}
