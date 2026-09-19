# Telegram Notification Channel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Telegram notification channel that forwards core trading events (buy, sell, stop-loss, grid-trade execution) to a Telegram chat via the Bot API, alongside the existing Slack notifications.

**Architecture:** Create a standalone `app/helpers/telegram.js` mirroring `app/helpers/slack.js`, expose it via `app/helpers/index.js`. Wire `telegram.sendMessage(...)` calls in the four core step files right next to the existing `slack.sendMessage(...)` calls. Telegram and Slack send independently; Telegram only handles the four core events.

**Tech Stack:** Node.js, Express codebase. Uses existing `axios`, `lodash`, `moment`, `config`, `jest`.

---

## File structure

- Create: `app/helpers/telegram.js` — Telegram message sender (mirrors slack.js)
- Modify: `app/helpers/index.js` — export `telegram`
- Modify: `config/default.json` — add `telegram` config block
- Modify: `config/custom-environment-variables.json` — add env var mappings
- Modify: `.env.dist` — document new env vars
- Modify (wire calls): `app/cronjob/trailingTrade/step/place-buy-order.js`, `app/cronjob/trailingTrade/step/place-sell-order.js`, `app/cronjob/trailingTrade/step/place-sell-stop-loss-order.js`, `app/cronjob/trailingTrade/step/ensure-grid-trade-order-executed.js`
- Create: `app/helpers/__tests__/telegram.test.js`
- Modify (tests): the four step `__tests__` files

---

### Task 1: Add Telegram config to JSON config files and `.env.dist`

**Files:**
- Modify: `config/default.json:34-39`
- Modify: `config/custom-environment-variables.json:57`
- Modify: `.env.dist:13`

- [ ] **Step 1: Add `telegram` block to `config/default.json`**

Insert the `telegram` block right after the `slack` block (after line 39). The file currently has:

```json
  "slack": {
    "enabled": false,
    "webhookUrl": "",
    "channel": "",
    "username": ""
  },
```

Change it to add a `telegram` block after it:

```json
  "slack": {
    "enabled": false,
    "webhookUrl": "",
    "channel": "",
    "username": ""
  },
  "telegram": {
    "enabled": false,
    "botToken": "",
    "chatId": ""
  },
```

- [ ] **Step 2: Add env var mappings to `config/custom-environment-variables.json`**

In `config/custom-environment-variables.json`, after the `slack` block (after line 57), add a `telegram` block:

```json
  "slack": {
    "enabled": {
      "__name": "BINANCE_SLACK_ENABLED",
      "__format": "boolean"
    },
    "webhookUrl": "BINANCE_SLACK_WEBHOOK_URL",
    "channel": "BINANCE_SLACK_CHANNEL",
    "username": "BINANCE_SLACK_USERNAME"
  },
  "telegram": {
    "enabled": {
      "__name": "BINANCE_TELEGRAM_ENABLED",
      "__format": "boolean"
    },
    "botToken": "BINANCE_TELEGRAM_BOT_TOKEN",
    "chatId": "BINANCE_TELEGRAM_CHAT_ID"
  },
```

- [ ] **Step 3: Document env vars in `.env.dist`**

In `.env.dist`, after the Slack section (after line 13), add:

```
## Telegram
BINANCE_TELEGRAM_ENABLED=false
BINANCE_TELEGRAM_BOT_TOKEN=
BINANCE_TELEGRAM_CHAT_ID=
```

- [ ] **Step 4: Commit**

```bash
git add config/default.json config/custom-environment-variables.json .env.dist
git commit -m "chore: add Telegram notification config"
```

---

### Task 2: Create Telegram helper and test it

**Files:**
- Create: `app/helpers/telegram.js`
- Create: `app/helpers/__tests__/telegram.test.js`

- [ ] **Step 1: Write the failing test**

Create `app/helpers/__tests__/telegram.test.js`:

```js
const config = require('config');
const axios = require('axios');
const telegram = require('../telegram');

jest.mock('config');
jest.mock('axios');

describe('telegram', () => {
  let result;

  describe('sendMessage', () => {
    describe('when telegram is not enabled', () => {
      beforeEach(async () => {
        config.get = jest.fn(key => {
          switch (key) {
            case 'telegram.enabled':
              return false;
            default:
              return '';
          }
        });

        result = await telegram.sendMessage('my message');
      });

      it('returns expected value', () => {
        expect(result).toStrictEqual({});
      });
    });

    describe('when telegram is enabled', () => {
      beforeEach(async () => {
        process.env.NODE_ENV = 'live';

        config.get = jest.fn(key => {
          switch (key) {
            case 'telegram.enabled':
              return true;
            default:
              return `value-${key}`;
          }
        });

        axios.post = jest.fn().mockResolvedValue(true);

        result = await telegram.sendMessage('my message', {
          symbol: 'BTCUSDT',
          apiLimit: 10
        });
      });

      it('triggers axios.post', () => {
        expect(axios.post).toHaveBeenCalledWith(
          'https://api.telegram.org/botvalue-telegram.botToken/sendMessage',
          {
            chat_id: 'value-telegram.chatId',
            text: expect.stringContaining('my message')
          }
        );
      });

      it('includes api limit in text when provided', () => {
        expect(axios.post).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            text: expect.stringContaining('Current API Usage: 10')
          })
        );
      });

      it('returns expected value', () => {
        expect(result).toBeTruthy();
      });

      describe('if duplicated', () => {
        beforeEach(async () => {
          axios.post.mockClear();
          result = await telegram.sendMessage('my message', {
            symbol: 'BTCUSDT',
            apiLimit: 10
          });
        });

        it('does not trigger axios.post', () => {
          expect(axios.post).not.toHaveBeenCalled();
        });
      });

      describe('when post throws an error', () => {
        beforeEach(async () => {
          axios.post.mockReset();

          axios.post = jest
            .fn()
            .mockRejectedValue(new Error('something happened'));

          result = await telegram.sendMessage('my message - something happened', {
            symbol: 'BTCUSDT',
            apiLimit: 10
          });
        });

        it('returns expected value', () => {
          expect(result).toStrictEqual({});
        });
      });
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `BINANCE_MODE=test npx jest app/helpers/__tests__/telegram.test.js --coverage=false`

Expected: FAIL with `Cannot find module '../telegram'` (file does not exist yet).

- [ ] **Step 3: Write the Telegram helper**

Create `app/helpers/telegram.js`:

```js
const _ = require('lodash');
const moment = require('moment');
const axios = require('axios');
const config = require('config');
const logger = require('./logger');

// This variable will store last message per symbol to avoid saving the duplicated message.
const lastMessages = {};

/**
 * Send telegram message
 *
 * @param {*} text
 */
const sendMessage = async (text, params = {}) => {
  if (_.get(params, 'symbol', '') !== '') {
    if (_.get(lastMessages, `${params.symbol}.message`, '') === text) {
      return {};
    }

    lastMessages[params.symbol] = { message: text };
  }

  let formattedText = `(${moment().format('HH:mm:ss.SSS')}) ${text}`;
  if (params.apiLimit) {
    formattedText += `\n- Current API Usage: ${params.apiLimit}`;
  }

  logger.info(
    { tag: 'telegram-send-message', formattedText },
    'Send telegram message'
  );

  if (config.get('telegram.enabled') !== true) {
    return {};
  }

  try {
    const response = await axios.post(
      `https://api.telegram.org/bot${config.get('telegram.botToken')}/sendMessage`,
      {
        chat_id: config.get('telegram.chatId'),
        text: formattedText
      }
    );

    return response;
  } catch (e) {
    logger.error(
      { tag: 'telegram-send-message', e },
      'Error occurred while sending telegram message.'
    );

    return {};
  }
};

module.exports = { sendMessage };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `BINANCE_MODE=test npx jest app/helpers/__tests__/telegram.test.js --coverage=false`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/helpers/telegram.js app/helpers/__tests__/telegram.test.js
git commit -m "feat: add Telegram notification helper"
```

---

### Task 3: Export `telegram` from helpers index

**Files:**
- Modify: `app/helpers/index.js:3,11`

- [ ] **Step 1: Add telegram require and export**

In `app/helpers/index.js`, add `const telegram = require('./telegram');` after the slack require (line 3), and add `telegram,` to the `module.exports` object (after `slack,` on line 11):

```js
const cache = require('./cache');
const logger = require('./logger');
const slack = require('./slack');
const telegram = require('./telegram');
const binance = require('./binance');
const mongo = require('./mongo');
const { PubSub } = require('./pubsub');

module.exports = {
  cache,
  logger,
  slack,
  telegram,
  binance,
  mongo,
  PubSub
};
```

- [ ] **Step 2: Verify helpers index test still passes**

Run: `BINANCE_MODE=test npx jest app/helpers/__tests__/index.test.js --coverage=false`

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/helpers/index.js
git commit -m "fix: export telegram helper"
```

---

### Task 4: Wire Telegram into buy order notification

**Files:**
- Modify: `app/cronjob/trailingTrade/step/place-buy-order.js:3`
- Modify: `app/cronjob/trailingTrade/step/place-buy-order.js:283,326`
- Test: `app/cronjob/trailingTrade/step/__tests__/place-buy-order.test.js`

- [ ] **Step 1: Add telegram to the require on line 3**

Change line 3 from:

```js
const { binance, slack } = require('../../../helpers');
```

to:

```js
const { binance, slack, telegram } = require('../../../helpers');
```

- [ ] **Step 2: Add telegram.sendMessage alongside the two slack calls**

In the first `slack.sendMessage(...)` block (line 282-288), the `if` guard calls `slack.sendMessage(...)`. Add a parallel `telegram.sendMessage(...)` immediately after it with identical arguments:

```js
  if (notifyDebug || notifyOrderConfirm)
    slack.sendMessage(
      `*${symbol}* Action - Buy Trade #${humanisedGridTradeIndex}: *STOP_LOSS_LIMIT*\n` +
        `- Order Params: \n` +
        `\`\`\`${JSON.stringify(notifyMessage, undefined, 2)}\`\`\``,
      { symbol, apiLimit: getAPILimit(logger) }
    );

  if (notifyDebug || notifyOrderConfirm)
    telegram.sendMessage(
      `*${symbol}* Action - Buy Trade #${humanisedGridTradeIndex}: *STOP_LOSS_LIMIT*\n` +
        `- Order Params: \n` +
        `\`\`\`${JSON.stringify(notifyMessage, undefined, 2)}\`\`\``,
      { symbol, apiLimit: getAPILimit(logger) }
    );
```

In the second `slack.sendMessage(...)` block (line 325-334), add a parallel `telegram.sendMessage(...)` right after it:

```js
  if (notifyDebug || notifyOrderConfirm)
    slack.sendMessage(
      `*${symbol}* Buy Action Grid Trade #${humanisedGridTradeIndex} Result: *STOP_LOSS_LIMIT*\n` +
        `- Order Result: \`\`\`${JSON.stringify(
          orderResult,
          undefined,
          2
        )}\`\`\``,
      { symbol, apiLimit: getAPILimit(logger) }
    );

  if (notifyDebug || notifyOrderConfirm)
    telegram.sendMessage(
      `*${symbol}* Buy Action Grid Trade #${humanisedGridTradeIndex} Result: *STOP_LOSS_LIMIT*\n` +
        `- Order Result: \`\`\`${JSON.stringify(
          orderResult,
          undefined,
          2
        )}\`\`\``,
      { symbol, apiLimit: getAPILimit(logger) }
    );
```

- [ ] **Step 3: Update the test to mock telegram and assert calls**

In `app/cronjob/trailingTrade/step/__tests__/place-buy-order.test.js`:

1. Add a `telegramMock` variable declaration near `slackMock` (around line 11).
2. In the `beforeEach` that requires helpers (line 36), add:
   ```js
   const { binance, slack, telegram, logger } = require('../../../../helpers');
   telegramMock = telegram;
   telegramMock.sendMessage = jest.fn().mockResolvedValue(true);
   ```

- [ ] **Step 4: Run test to verify it passes**

Run: `BINANCE_MODE=test npx jest app/cronjob/trailingTrade/step/__tests__/place-buy-order.test.js --coverage=false`

Expected: PASS (existing assertions pass; the slack assertions remain valid; the telegram mock returns a resolved value as expected by the flow).

- [ ] **Step 5: Commit**

```bash
git add app/cronjob/trailingTrade/step/place-buy-order.js app/cronjob/trailingTrade/step/__tests__/place-buy-order.test.js
git commit -m "feat: send buy order notifications to Telegram"
```

---

### Task 5: Wire Telegram into sell order notification

**Files:**
- Modify: `app/cronjob/trailingTrade/step/place-sell-order.js:3,168,206`
- Test: `app/cronjob/trailingTrade/step/__tests__/place-sell-order.test.js`

- [ ] **Step 1: Add telegram to the require on line 3**

```js
const { binance, slack, telegram } = require('../../../helpers');
```

- [ ] **Step 2: Add telegram.sendMessage after each slack call**

First block (line 168-176):

```js
  slack.sendMessage(
    `*${symbol}* Sell Action Grid Trade #${humanisedGridTradeIndex}: *STOP_LOSS_LIMIT*\n` +
      `- Order Params: \`\`\`${JSON.stringify(
        orderParams,
        undefined,
        2
      )}\`\`\``,
    { symbol, apiLimit: getAPILimit(logger) }
  );

  telegram.sendMessage(
    `*${symbol}* Sell Action Grid Trade #${humanisedGridTradeIndex}: *STOP_LOSS_LIMIT*\n` +
      `- Order Params: \`\`\`${JSON.stringify(
        orderParams,
        undefined,
        2
      )}\`\`\``,
    { symbol, apiLimit: getAPILimit(logger) }
  );
```

Second block (line 206-214):

```js
  slack.sendMessage(
    `*${symbol}* Sell Action Grid Trade #${humanisedGridTradeIndex} Result: *STOP_LOSS_LIMIT*\n` +
      `- Order Result: \`\`\`${JSON.stringify(
        orderResult,
        undefined,
        2
      )}\`\`\``,
    { symbol, apiLimit: getAPILimit(logger) }
  );

  telegram.sendMessage(
    `*${symbol}* Sell Action Grid Trade #${humanisedGridTradeIndex} Result: *STOP_LOSS_LIMIT*\n` +
      `- Order Result: \`\`\`${JSON.stringify(
        orderResult,
        undefined,
        2
      )}\`\`\``,
    { symbol, apiLimit: getAPILimit(logger) }
  );
```

- [ ] **Step 3: Update the test to mock telegram**

In `app/cronjob/trailingTrade/step/__tests__/place-sell-order.test.js`:

1. Add `let telegramMock;` near `slackMock` (line 8).
2. In the `beforeEach` requiring helpers (line 24), change to:
   ```js
   const { binance, slack, telegram, logger } = require('../../../../helpers');
   telegramMock = telegram;
   telegramMock.sendMessage = jest.fn().mockResolvedValue(true);
   ```

- [ ] **Step 4: Run test to verify it passes**

Run: `BINANCE_MODE=test npx jest app/cronjob/trailingTrade/step/__tests__/place-sell-order.test.js --coverage=false`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/cronjob/trailingTrade/step/place-sell-order.js app/cronjob/trailingTrade/step/__tests__/place-sell-order.test.js
git commit -m "feat: send sell order notifications to Telegram"
```

---

### Task 6: Wire Telegram into stop-loss notification

**Files:**
- Modify: `app/cronjob/trailingTrade/step/place-sell-stop-loss-order.js:3,143,197`
- Test: `app/cronjob/trailingTrade/step/__tests__/place-sell-stop-loss-order.test.js`

- [ ] **Step 1: Add telegram to the require**

```js
const { binance, slack, telegram } = require('../../../helpers');
```

- [ ] **Step 2: Add telegram.sendMessage after each slack call**

First block (line 143-151):

```js
  slack.sendMessage(
    `*${symbol}* Sell Stop-Loss Action: *MARKET*` +
      `- Order Params: \`\`\`${JSON.stringify(
        orderParams,
        undefined,
        2
      )}\`\`\``,
    { symbol, apiLimit: getAPILimit(logger) }
  );

  telegram.sendMessage(
    `*${symbol}* Sell Stop-Loss Action: *MARKET*` +
      `- Order Params: \`\`\`${JSON.stringify(
        orderParams,
        undefined,
        2
      )}\`\`\``,
    { symbol, apiLimit: getAPILimit(logger) }
  );
```

Second block (line 197-205):

```js
  slack.sendMessage(
    `*${symbol}* Sell Stop-Loss Action Result: *MARKET*\n` +
      `- Order Result: \`\`\`${JSON.stringify(
        orderResult,
        undefined,
        2
      )}\`\`\``,
    { symbol, apiLimit: getAPILimit(logger) }
  );

  telegram.sendMessage(
    `*${symbol}* Sell Stop-Loss Action Result: *MARKET*\n` +
      `- Order Result: \`\`\`${JSON.stringify(
        orderResult,
        undefined,
        2
      )}\`\`\``,
    { symbol, apiLimit: getAPILimit(logger) }
  );
```

- [ ] **Step 3: Update the test to mock telegram**

In `app/cronjob/trailingTrade/step/__tests__/place-sell-stop-loss-order.test.js`:

1. Add `let telegramMock;` near `slackMock` (line 8).
2. In the `beforeEach` requiring helpers (line 24), change to:
   ```js
   const { binance, slack, telegram, logger } = require('../../../../helpers');
   telegramMock = telegram;
   telegramMock.sendMessage = jest.fn().mockResolvedValue(true);
   ```

- [ ] **Step 4: Run test to verify it passes**

Run: `BINANCE_MODE=test npx jest app/cronjob/trailingTrade/step/__tests__/place-sell-stop-loss-order.test.js --coverage=false`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/cronjob/trailingTrade/step/place-sell-stop-loss-order.js app/cronjob/trailingTrade/step/__tests__/place-sell-stop-loss-order.test.js
git commit -m "feat: send stop-loss notifications to Telegram"
```

---

### Task 7: Wire Telegram into grid trade execution notification

**Files:**
- Modify: `app/cronjob/trailingTrade/step/ensure-grid-trade-order-executed.js:4,75,123`
- Test: `app/cronjob/trailingTrade/step/__tests__/ensure-grid-trade-order-executed.test.js`

- [ ] **Step 1: Add telegram to the require on line 4**

```js
const { slack, telegram, PubSub } = require('../../../helpers');
```

- [ ] **Step 2: Add telegram.sendMessage after each of the two slack calls guarded by `notifyOrderExecute`**

First block (in `notifyOrderExecute` guard, line 74-80):

```js
  if (notifyOrderExecute) {
    slack.sendMessage(
      `*${symbol}* ${side.toUpperCase()} Grid Trade #${humanisedGridTradeIndex} Order Filled: *${type}*\n` +
        `- Order Result: \`\`\`${JSON.stringify(order, undefined, 2)}\`\`\``,
      { symbol, apiLimit: getAPILimit(logger) }
    );
  }

  if (notifyOrderExecute) {
    telegram.sendMessage(
      `*${symbol}* ${side.toUpperCase()} Grid Trade #${humanisedGridTradeIndex} Order Filled: *${type}*\n` +
        `- Order Result: \`\`\`${JSON.stringify(order, undefined, 2)}\`\`\``,
      { symbol, apiLimit: getAPILimit(logger) }
    );
  }
```

Second block (in the `orderDeleted` helper's `notifyOrderExecute` guard, line 122-128):

```js
  if (notifyOrderExecute) {
    slack.sendMessage(
      `*${symbol}* ${side.toUpperCase()} Grid Trade #${humanisedGridTradeIndex} Order Removed: *${type}*\n` +
        `- Order Result: \`\`\`${JSON.stringify(order, undefined, 2)}\`\`\``,
      { symbol, apiLimit: getAPILimit(logger) }
    );
  }

  if (notifyOrderExecute) {
    telegram.sendMessage(
      `*${symbol}* ${side.toUpperCase()} Grid Trade #${humanisedGridTradeIndex} Order Removed: *${type}*\n` +
        `- Order Result: \`\`\`${JSON.stringify(order, undefined, 2)}\`\`\``,
      { symbol, apiLimit: getAPILimit(logger) }
    );
  }
```

Note: there is also a third `slack.sendMessage` on line 171 guarded by `notifyDebug` — do NOT add a telegram call there, per the spec (debug messages stay Slack-only).

- [ ] **Step 3: Update the test to mock telegram**

In `app/cronjob/trailingTrade/step/__tests__/ensure-grid-trade-order-executed.test.js`:

1. Add `let telegramMock;` near `slackMock` (line 8).
2. In the `beforeEach` requiring helpers (line 35), change to:
   ```js
   const { slack, telegram, logger, PubSub } = require('../../../../helpers');
   slackMock = slack;
   telegramMock = telegram;
   loggerMock = logger;
   PubSubMock = PubSub;
   ```
   Then after `slackMock.sendMessage = jest.fn().mockResolvedValue(true);` (line 43) add:
   ```js
   telegramMock.sendMessage = jest.fn().mockResolvedValue(true);
   ```

- [ ] **Step 4: Run test to verify it passes**

Run: `BINANCE_MODE=test npx jest app/cronjob/trailingTrade/step/__tests__/ensure-grid-trade-order-executed.test.js --coverage=false`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/cronjob/trailingTrade/step/ensure-grid-trade-order-executed.js app/cronjob/trailingTrade/step/__tests__/ensure-grid-trade-order-executed.test.js
git commit -m "feat: send grid trade execution notifications to Telegram"
```

---

### Task 8: Run full lint and test suite

**Files:**
- None (verification only)

- [ ] **Step 1: Run lint**

Run: `npm run lint`

Expected: No lint errors (eslint will auto-fix; run again until clean).

- [ ] **Step 2: Run full jest suite**

Run: `BINANCE_MODE=test npx jest --coverage=false --detectOpenHandles`

Expected: All tests pass, including the new `telegram.test.js` and the four modified step tests, with no regression in existing assertions.

- [ ] **Step 3: Confirm full coverage**

Run: `BINANCE_MODE=test npx jest`

Expected: 100% global coverage threshold passes (branches/functions/lines/statements). The new `telegram.js` and its branches must be fully covered by `telegram.test.js`.

---

## Self-review notes

- **Spec coverage:** config (Task 1), telegram helper (Task 2), index export (Task 3), buy (Task 4), sell (Task 5), stop-loss (Task 6), grid trade (Task 7), testing (Task 2 + 8). All spec sections covered.
- **Debug guard:** The `notifyDebug`-only grid-trade update message (line 171 in ensure-grid-trade-order-executed.js) is intentionally NOT wired to Telegram, matching the spec's "only core events" scope.
- **Type/signature consistency:** `sendMessage(text, params = {})` used consistently everywhere; `telegram` destructured from helpers in all four step files and mocked as `telegramMock` consistently.
