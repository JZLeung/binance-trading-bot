const { cache } = require('../../../helpers');
const {
  cacheExchangeSymbols
} = require('../../../cronjob/trailingTradeHelper/common');
const { sendResponse } = require('../../transport');

const getExchangeSymbols = async () =>
  JSON.parse(await cache.hget('trailing-trade-common', 'exchange-symbols')) ||
  {};

const handleExchangeSymbolsGet = async (logger, ws, _payload) => {
  // Get cached exchange symbols
  let exchangeSymbols = await getExchangeSymbols();

  if (Object.keys(exchangeSymbols).length === 0) {
    await cacheExchangeSymbols(logger);
    exchangeSymbols = await getExchangeSymbols();
  }

  sendResponse(ws, {
    result: true,
    type: 'exchange-symbols-get-result',
    exchangeSymbols
  });
};

module.exports = { handleExchangeSymbolsGet };
