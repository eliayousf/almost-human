// Both attempts and durable typing publication share one claimed turn. Include
// the longest typing delay plus headroom before the watchdog releases the claim.
export const MUBIT_TIMEOUT_MS = 10_000;
export const BOT_RETRY_DELAY_MS = 2_000;
export const BOT_MIN_TYPING_MS = 2_000;
export const BOT_MAX_TYPING_MS = 12_000;
export const BOT_TURN_BUDGET_MS = 2 * MUBIT_TIMEOUT_MS + BOT_RETRY_DELAY_MS + 2_000;
export const BOT_WATCHDOG_MS = BOT_TURN_BUDGET_MS + BOT_MAX_TYPING_MS + 4_000;
