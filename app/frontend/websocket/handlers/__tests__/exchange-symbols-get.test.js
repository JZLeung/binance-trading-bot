/* eslint-disable global-require */
describe('exchange-symbols-get.js', () => {
  let mockWebSocketServer;
  let mockWebSocketServerWebSocketSend;

  let loggerMock;
  let cacheMock;
  let mockCacheExchangeSymbols;

  beforeEach(() => {
    jest.clearAllMocks().resetModules();

    mockCacheExchangeSymbols = jest.fn().mockResolvedValue(true);

    jest.mock('../../../../cronjob/trailingTradeHelper/common', () => ({
      cacheExchangeSymbols: mockCacheExchangeSymbols
    }));

    mockWebSocketServerWebSocketSend = jest.fn().mockResolvedValue(true);

    mockWebSocketServer = {
      send: mockWebSocketServerWebSocketSend
    };

    const { cache, logger } = require('../../../../helpers');

    cacheMock = cache;
    loggerMock = logger;
  });

  describe('when got cache successfully', () => {
    beforeEach(async () => {
      cacheMock.hget = jest.fn().mockResolvedValue(
        JSON.stringify({
          some: 'data'
        })
      );

      const { handleExchangeSymbolsGet } = require('../exchange-symbols-get');
      await handleExchangeSymbolsGet(loggerMock, mockWebSocketServer, {});
    });

    it('triggers cache.hget', () => {
      expect(cacheMock.hget).toHaveBeenCalledWith(
        'trailing-trade-common',
        'exchange-symbols'
      );
    });

    it('does not trigger cacheExchangeSymbols', () => {
      expect(mockCacheExchangeSymbols).not.toHaveBeenCalled();
    });

    it('returns expected value', () => {
      expect(mockWebSocketServerWebSocketSend).toHaveBeenCalledWith(
        JSON.stringify({
          result: true,
          type: 'exchange-symbols-get-result',
          exchangeSymbols: {
            some: 'data'
          }
        })
      );
    });
  });

  describe('when failed to get cache', () => {
    beforeEach(async () => {
      cacheMock.hget = jest.fn().mockResolvedValue(null);

      const { handleExchangeSymbolsGet } = require('../exchange-symbols-get');
      await handleExchangeSymbolsGet(loggerMock, mockWebSocketServer, {});
    });

    it('triggers cache.hget', () => {
      expect(cacheMock.hget).toHaveBeenCalledWith(
        'trailing-trade-common',
        'exchange-symbols'
      );
    });

    it('triggers cacheExchangeSymbols', () => {
      expect(mockCacheExchangeSymbols).toHaveBeenCalledWith(loggerMock);
    });

    it('triggers cache.hget twice', () => {
      expect(cacheMock.hget).toHaveBeenCalledTimes(2);
    });

    it('returns expected value', () => {
      expect(mockWebSocketServerWebSocketSend).toHaveBeenCalledWith(
        JSON.stringify({
          result: true,
          type: 'exchange-symbols-get-result',
          exchangeSymbols: {}
        })
      );
    });
  });

  describe('when cache is refreshed successfully', () => {
    beforeEach(async () => {
      cacheMock.hget = jest
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(
          JSON.stringify({
            BTCUSDT: {
              symbol: 'BTCUSDT',
              status: 'TRADING',
              quoteAsset: 'USDT',
              minNotional: 10
            }
          })
        );

      const { handleExchangeSymbolsGet } = require('../exchange-symbols-get');
      await handleExchangeSymbolsGet(loggerMock, mockWebSocketServer, {});
    });

    it('triggers cacheExchangeSymbols', () => {
      expect(mockCacheExchangeSymbols).toHaveBeenCalledWith(loggerMock);
    });

    it('returns refreshed value', () => {
      expect(mockWebSocketServerWebSocketSend).toHaveBeenCalledWith(
        JSON.stringify({
          result: true,
          type: 'exchange-symbols-get-result',
          exchangeSymbols: {
            BTCUSDT: {
              symbol: 'BTCUSDT',
              status: 'TRADING',
              quoteAsset: 'USDT',
              minNotional: 10
            }
          }
        })
      );
    });
  });
});
