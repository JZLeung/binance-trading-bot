const { v4: uuidv4 } = require('uuid');
const config = require('config');

const {
  verifyAuthenticated
} = require('../../cronjob/trailingTradeHelper/common');
const { createHTTPTransport } = require('../transport');
const {
  handleLatest,
  handleSettingUpdate,
  handleSymbolUpdateLastBuyPrice,
  handleSymbolSettingUpdate,
  handleSymbolSettingDelete,
  handleSymbolGridTradeDelete,
  handleSymbolEnableAction,
  handleSymbolTriggerBuy,
  handleSymbolTriggerSell,
  handleManualTrade,
  handleManualTradeAllSymbols,
  handleCancelOrder,
  handleDustTransferGet,
  handleDustTransferExecute,
  handleExchangeSymbolsGet
} = require('../websocket/handlers');

const commandMaps = {
  latest: handleLatest,
  'setting-update': handleSettingUpdate,
  'symbol-update-last-buy-price': handleSymbolUpdateLastBuyPrice,
  'symbol-setting-update': handleSymbolSettingUpdate,
  'symbol-setting-delete': handleSymbolSettingDelete,
  'symbol-grid-trade-delete': handleSymbolGridTradeDelete,
  'symbol-enable-action': handleSymbolEnableAction,
  'symbol-trigger-buy': handleSymbolTriggerBuy,
  'symbol-trigger-sell': handleSymbolTriggerSell,
  'manual-trade': handleManualTrade,
  'manual-trade-all-symbols': handleManualTradeAllSymbols,
  'cancel-order': handleCancelOrder,
  'dust-transfer-get': handleDustTransferGet,
  'dust-transfer-execute': handleDustTransferExecute,
  'exchange-symbols-get': handleExchangeSymbolsGet
};

const buildWarningPayload = message => ({
  result: false,
  type: 'notification',
  message: {
    type: 'warning',
    title: message
  }
});

const configureAPICommand = async (app, funcLogger, { loginLimiter }) => {
  const logger = funcLogger.child({ server: 'api-command' });

  app.post('/api/command', async (req, res) => {
    // eslint-disable-next-line no-underscore-dangle
    const clientIp = req.ip || req.connection.remoteAddress;
    const rateLimiterLogin = (await loginLimiter.get(clientIp)) || {
      remainingPoints: 1,
      msBeforeNext: 0
    };
    const transport = createHTTPTransport(res);

    if (
      config.get('authentication.enabled') &&
      rateLimiterLogin.remainingPoints <= 0
    ) {
      transport.send(
        buildWarningPayload(
          `You are blocked until ${new Date(
            Date.now() + rateLimiterLogin.msBeforeNext
          )}.`
        )
      );
      return;
    }

    const payload = req.body;

    if (payload === null || payload.command === undefined) {
      transport.send(buildWarningPayload('Command is not provided.'));
      return;
    }

    if (commandMaps[payload.command] === undefined) {
      transport.send(buildWarningPayload('Command is not recognised.'));
      return;
    }

    const commandLogger = logger.child({ payload, correlationId: uuidv4() });

    const isAuthenticated = await verifyAuthenticated(
      commandLogger,
      payload.authToken
    );

    if (payload.command === 'latest') {
      payload.isAuthenticated = isAuthenticated;
    } else if (isAuthenticated === false) {
      transport.send(buildWarningPayload('You must be authenticated.'));
      return;
    }

    await commandMaps[payload.command](commandLogger, transport, payload);
  });
};

module.exports = { configureAPICommand };
