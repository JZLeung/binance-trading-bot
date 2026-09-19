# Telegram Notification Channel Design

Date: 2026-09-19

## Overview

Add a Telegram notification channel to the Binance Trading Bot. Only core trading events are forwarded to Telegram; Slack keeps sending all existing notifications. Telegram and Slack are toggled independently via config flags.

## Scope

Telegram notifications are sent for exactly these events (each file already calls `slack.sendMessage` for the same event):

1. **Buy orders** — `app/cronjob/trailingTrade/step/place-buy-order.js` (buy action and result)
2. **Sell orders** — `app/cronjob/trailingTrade/step/place-sell-order.js` (sell action and result)
3. **Stop-loss orders** — `app/cronjob/trailingTrade/step/place-sell-stop-loss-order.js` (stop-loss action and result)
4. **Grid trade execution** — `app/cronjob/trailingTrade/step/ensure-grid-trade-order-executed.js` (filled / partially filled / cancelled)

All other notifications (errors, dust transfer, manual orders, alive heartbeat, debug, etc.) continue to go to Slack only and are NOT sent to Telegram.

## Architecture

### New module: `app/helpers/telegram.js`

Mirrors the existing `app/helpers/slack.js` pattern and exposes a single function:

- `sendMessage(text, params = {})`
  - Formats text with a timestamp prefix:`(HH:mm:ss.SSS) <text>` — same format as Slack
  - Deduplicates consecutive messages per symbol using an in-memory `lastMessages` map (same logic as Slack) to avoid duplicate floods
  - Logs the outgoing message via `logger.info` (tag: `telegram-send-message`)
  - Logs errors via `logger.error` (tag: `telegram-send-message`) and returns `{}` on failure — never throws, does not affect main flow
  - Skips sending when `config.get('telegram.enabled') !== true`

### Telegram Bot API call

```
POST https://api.telegram.org/bot<token>/sendMessage
Content-Type: application/json
{ "chat_id": "<chatId>", "text": "<formattedText>" }
```

Uses the existing `axios` dependency. Messages are sent as-is; Telegram's length cap is accepted since only core trading notifications are routed through Telegram.
## Configuration

Updates to:

- `config/default.json` — add `telegram` block:
  - `telegram.enabled` (boolean, default `false`)
  - `telegram.botToken` (string, default `''`)
  - `telegram.chatId` (string, default `''`)
- `config/custom-environment-variables.json` — map env vars:
  - `telegram.enabled` ← `BINANCE_TELEGRAM_ENABLED`
  - `telegram.botToken` ← `BINANCE_TELEGRAM_BOT_TOKEN`
  - `telegram.chatId` ← `BINANCE_TELEGRAM_CHAT_ID`
- `.env.dist` — document theree new variables (defaults `false` / empty)

## Code changes

### 1. `app/helpers/telegram.js` (new)

Standalone module, no dependencies on `slack.js`.

### 2. Wire into 4 step files

In each of the four files above, require `../helpers/telegram`and call `telegram.sendMessage(...)` right alongside the existing `slack.sendMessage(...)` calls. The call site argument lists are re-used as-is (same text, same params) so message content matches Slack exactly.



## Testing

- New `app/helpers/__tests__/telegram.test.js` (mirrors `slack.test.js` style) covering:
  - Sends message when enabled
  - Skips when disabled
  - Skips a duplicate message when the same text is sent for the same symbol
  - New non-duplicate symbol message goes through
  - Handles API error (logs, returns `{}`, does not throw)
  - Includes API-limit suffix param when provided
- Update the four step test files (`place-buy-order.test.js`, `place-sell-order.test.js`, `place-sell-stop-loss-order.test.js`, `ensure-grid-trade-order-executed.test.js`)to mock the `telegram` module and assert calls alongside existing slack assertions.
 Existing Slack expectations remain unchanged. jest coverage threshold is 100% (global branches/functions/lines/statements); all new code must be covered.

## Out of scope

- No unified notification dispatcher/abstraction; call sites call Slack and Telegram separately.
- No Telegram interactive commands / inline keyboards
- No queueing or retry mechanism
- No changes to existing Slack behavior or existing tests for Slack