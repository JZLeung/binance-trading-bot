const config = require('config');

const Binance = require('binance-api-node').default;

const binanceOptions = {};
const isLive = config.get('mode') === 'live';
const apiKey = config.get(
  isLive ? 'binance.live.apiKey' : 'binance.test.apiKey'
);
const apiSecret = config.get(
  isLive ? 'binance.live.secretKey' : 'binance.test.secretKey'
);
const userWebsocketApiBase = isLive
  ? 'wss://ws-api.binance.com:443/ws-api/v3'
  : 'wss://ws-api.testnet.binance.vision/ws-api/v3';

if (isLive) {
  binanceOptions.apiKey = apiKey;
  binanceOptions.apiSecret = apiSecret;
} else {
  binanceOptions.httpBase = 'https://testnet.binance.vision';
  binanceOptions.wsBase = 'wss://testnet.binance.vision/ws';
  binanceOptions.apiKey = apiKey;
  binanceOptions.apiSecret = apiSecret;
}

const client = Binance(binanceOptions);

module.exports = {
  apiKey,
  apiSecret,
  client,
  isLive,
  userWebsocketApiBase
};
