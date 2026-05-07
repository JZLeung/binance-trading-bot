/* eslint-disable global-require */
describe('binance', () => {
  let Binance;
  let binance;
  let config;

  beforeEach(() => {
    jest.clearAllMocks().resetModules();

    jest.mock('binance-api-node', () => ({
      default: jest.fn().mockImplementation(() => ({ some: 'method' }))
    }));
    jest.mock('config');
    config = require('config');
    Binance = require('binance-api-node').default;
  });

  describe('when mode is live', () => {
    beforeEach(() => {
      config.get = jest.fn(key => {
        switch (key) {
          case 'mode':
            return 'test';
          default:
            return `value-${key}`;
        }
      });
      binance = require('../binance');
    });

    it('initialises with expected options', () => {
      expect(Binance).toHaveBeenCalledWith({
        apiKey: 'value-binance.test.apiKey',
        apiSecret: 'value-binance.test.secretKey',
        httpBase: 'https://testnet.binance.vision',
        wsBase: 'wss://testnet.binance.vision/ws'
      });
    });

    it('returns client', () => {
      expect(binance).toStrictEqual({
        apiKey: 'value-binance.test.apiKey',
        apiSecret: 'value-binance.test.secretKey',
        client: { some: 'method' },
        isLive: false,
        userWebsocketApiBase: 'wss://ws-api.testnet.binance.vision/ws-api/v3'
      });
    });
  });

  describe('when mode is test', () => {
    beforeEach(() => {
      config.get = jest.fn(key => {
        switch (key) {
          case 'mode':
            return 'live';
          default:
            return `value-${key}`;
        }
      });
      binance = require('../binance');
    });

    it('initialises with expected options', () => {
      expect(Binance).toHaveBeenCalledWith({
        apiKey: 'value-binance.live.apiKey',
        apiSecret: 'value-binance.live.secretKey'
      });
    });

    it('returns client', () => {
      expect(binance).toStrictEqual({
        apiKey: 'value-binance.live.apiKey',
        apiSecret: 'value-binance.live.secretKey',
        client: { some: 'method' },
        isLive: true,
        userWebsocketApiBase: 'wss://ws-api.binance.com:443/ws-api/v3'
      });
    });
  });
});
