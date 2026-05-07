const { cache } = require('../../../helpers');
const { sendResponse } = require('../../transport');

const handleExchangeSymbolsGet = async (_logger, ws, _payload) => {
  // Get cached exchange symbols
  const exchangeSymbols =
    JSON.parse(await cache.hget('trailing-trade-common', 'exchange-symbols')) ||
    {};

  sendResponse(ws, {
    result: true,
    type: 'exchange-symbols-get-result',
    exchangeSymbols
  });
};

module.exports = { handleExchangeSymbolsGet };
