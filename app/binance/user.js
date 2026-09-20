const crypto = require('crypto');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const _ = require('lodash');
const { binance } = require('../helpers');
const queue = require('../cronjob/trailingTradeHelper/queue');
const { executeTrailingTrade } = require('../cronjob/index');

const {
  updateAccountInfo,
  getAccountInfoFromAPI
} = require('../cronjob/trailingTradeHelper/common');

const {
  getGridTradeLastOrder,
  updateGridTradeLastOrder,
  getManualOrder,
  saveManualOrder
} = require('../cronjob/trailingTradeHelper/order');

let userClean;

const createSignature = params =>
  crypto
    .createHmac('sha256', binance.apiSecret)
    .update(
      Object.keys(params)
        .sort()
        .map(key => `${key}=${params[key]}`)
        .join('&')
    )
    .digest('hex');

const mapUserEvent = payload => {
  if (_.isEmpty(payload)) {
    return null;
  }

  if (payload.eventType) {
    return payload;
  }

  const { e: eventType } = payload;

  if (!eventType) {
    return null;
  }

  if (eventType === 'balanceUpdate') {
    return {
      eventType
    };
  }

  if (eventType === 'accountUpdate') {
    return {
      eventType: 'account',
      balances: payload.B
    };
  }

  if (eventType === 'outboundAccountPosition') {
    return {
      eventType,
      balances: (payload.B || []).map(balance => ({
        asset: balance.a,
        free: balance.f,
        locked: balance.l
      })),
      lastAccountUpdate: payload.u
    };
  }

  if (eventType === 'executionReport') {
    return {
      eventType,
      eventTime: payload.E,
      symbol: payload.s,
      side: payload.S,
      orderStatus: payload.X,
      orderType: payload.o,
      stopPrice: payload.P,
      price: payload.p,
      orderId: payload.i,
      quantity: payload.q,
      isOrderWorking: payload.w,
      totalQuoteTradeQuantity: payload.Z,
      totalTradeQuantity: payload.z,
      orderTime: payload.T
    };
  }

  return {
    eventType
  };
};

const buildSubscribeRequest = () => {
  const params = {
    apiKey: binance.apiKey,
    timestamp: Date.now()
  };

  return {
    id: uuidv4(),
    method: 'userDataStream.subscribe.signature',
    params: {
      ...params,
      signature: createSignature(params)
    }
  };
};

const createUserWebsocketConnection = logger =>
  new Promise((resolve, reject) => {
    const ws = new WebSocket(binance.userWebsocketApiBase);
    let subscriptionId;
    let settled = false;
    let isClosedManually = false;
    let reconnectTimeout;

    const clearReconnectTimeout = () => {
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
      }
    };

    const clean = () => {
      isClosedManually = true;
      clearReconnectTimeout();

      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    };

    const settle = callback => value => {
      if (settled) {
        return;
      }

      settled = true;
      callback(value);
    };

    const resolveOnce = settle(resolve);
    const rejectOnce = settle(reject);

    const scheduleReconnect = () => {
      if (isClosedManually) {
        return;
      }

      clearReconnectTimeout();
      reconnectTimeout = setTimeout(() => {
        setupUserWebsocket(logger).catch(err => {
          logger.error({ err }, 'Failed to reconnect user websocket');
        });
      }, 5000);
    };

    ws.on('open', () => {
      logger.info(
        { url: binance.userWebsocketApiBase },
        'Connected to Binance user websocket API'
      );
      ws.send(JSON.stringify(buildSubscribeRequest()));
    });

    ws.on('message', rawMessage => {
      let message;

      try {
        message = JSON.parse(rawMessage);
      } catch (err) {
        logger.error({ err, rawMessage }, 'Failed to parse Binance user websocket message');
        return;
      }

      if (message.status && message.status >= 400) {
        const err = new Error(
          `Binance user websocket subscription failed with status ${message.status}`
        );
        logger.error({ err, message }, 'Binance user websocket returned an error');
        clean();
        rejectOnce(err);
        return;
      }

      if (message.result && typeof message.result.subscriptionId !== 'undefined') {
        subscriptionId = message.result.subscriptionId;
        logger.info(
          { subscriptionId },
          'Subscribed to Binance user websocket stream'
        );
        resolveOnce(clean);
        return;
      }

      const mappedEvent = mapUserEvent(message.event || message);

      if (!mappedEvent) {
        logger.debug({ message }, 'Ignoring unsupported Binance user websocket message');
        return;
      }

      handleUserStreamEvent(logger, mappedEvent);
    });

    ws.on('error', err => {
      logger.error({ err }, 'Binance user websocket error');
      rejectOnce(err);
    });

    ws.on('close', (code, reason) => {
      logger.warn(
        {
          code,
          reason: reason ? reason.toString() : '',
          subscriptionId
        },
        'Binance user websocket closed'
      );

      if (!settled) {
        rejectOnce(new Error(`Binance user websocket closed before subscribing: ${code}`));
        return;
      }

      scheduleReconnect();
    });
  });

const handleUserStreamEvent = (logger, evt) => {
  const { eventType } = evt;

  logger.info({ evt }, 'Received new user activity');

  if (['balanceUpdate', 'account'].includes(eventType)) {
    getAccountInfoFromAPI(logger);
  }

  if (eventType === 'outboundAccountPosition') {
    const { balances, lastAccountUpdate } = evt;
    updateAccountInfo(logger, balances, lastAccountUpdate);
  }

  if (eventType === 'executionReport') {
    const {
      eventTime,
      symbol,
      side,
      orderStatus,
      orderType,
      stopPrice,
      price,
      orderId,
      quantity,
      isOrderWorking,
      totalQuoteTradeQuantity,
      totalTradeQuantity,
      orderTime: transactTime
    } = evt;

    const correlationId = uuidv4();
    const symbolLogger = logger.child({
      correlationId,
      symbol
    });

    symbolLogger.info(
      { evt, saveLog: true },
      `There is a new update in order. ${orderId} - ${side} - ${orderStatus}`
    );

    const checkLastOrder = async () => {
      const lastOrder = await getGridTradeLastOrder(
        symbolLogger,
        symbol,
        side.toLowerCase()
      );

      if (_.isEmpty(lastOrder) === false) {
        if (
          orderId !== lastOrder.orderId ||
          transactTime < lastOrder.transactTime
        ) {
          symbolLogger.info(
            { lastOrder, evt, saveLog: true },
            'This order update is an old order. Do not update last grid trade order.'
          );
          return false;
        }

        const updatedOrder = {
          ...lastOrder,
          status: orderStatus,
          type: orderType,
          side,
          stopPrice,
          price,
          origQty: quantity,
          cummulativeQuoteQty: totalQuoteTradeQuantity,
          executedQty: totalTradeQuantity,
          isWorking: isOrderWorking,
          updateTime: eventTime,
          transactTime
        };

        await updateGridTradeLastOrder(
          symbolLogger,
          symbol,
          side.toLowerCase(),
          updatedOrder
        );
        symbolLogger.info(
          { lastOrder, updatedOrder, saveLog: true },
          `The last order has been updated. ${orderId} - ${side} - ${orderStatus}`
        );

        return true;
      }

      return false;
    };

    queue.execute(symbolLogger, symbol, {
      correlationId,
      preprocessFn: checkLastOrder,
      processFn: executeTrailingTrade
    });

    const checkManualOrder = async () => {
      const manualOrder = await getManualOrder(symbolLogger, symbol, orderId);

      if (_.isEmpty(manualOrder) === false) {
        await saveManualOrder(symbolLogger, symbol, orderId, {
          ...manualOrder,
          status: orderStatus,
          type: orderType,
          side,
          stopPrice,
          price,
          origQty: quantity,
          cummulativeQuoteQty: totalQuoteTradeQuantity,
          executedQty: totalTradeQuantity,
          isWorking: isOrderWorking,
          updateTime: eventTime
        });

        symbolLogger.info(
          { symbol, manualOrder, saveLog: true },
          'The manual order has been updated.'
        );

        return true;
      }

      return false;
    };

    queue.execute(symbolLogger, symbol, {
      correlationId,
      preprocessFn: checkManualOrder,
      processFn: executeTrailingTrade
    });
  }
};

const setupUserWebsocket = async logger => {
  if (userClean) {
    logger.info('Existing opened socket for user found, clean first');
    userClean();
  }

  userClean = await createUserWebsocketConnection(logger);
};

module.exports = {
  createSignature,
  mapUserEvent,
  setupUserWebsocket
};
