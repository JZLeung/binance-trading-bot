/* eslint-disable global-require */

describe('user.js', () => {
  let binanceMock;
  let loggerMock;
  let mockExecute;
  let mockGetAccountInfoFromAPI;
  let mockUpdateAccountInfo;
  let mockGridTradeLastOrder;
  let mockUpdateGridTradeLastOrder;
  let mockGetManualOrder;
  let mockSaveManualOrder;
  let MockWebSocket;
  let mockSocket;

  beforeEach(() => {
    jest.clearAllMocks().resetModules();

    mockSocket = {
      handlers: {},
      close: jest.fn(),
      on: jest.fn((event, handler) => {
        mockSocket.handlers[event] = handler;
      }),
      readyState: 1,
      send: jest.fn()
    };

    MockWebSocket = jest.fn(() => mockSocket);
    MockWebSocket.OPEN = 1;
    MockWebSocket.CONNECTING = 0;

    jest.mock('ws', () => MockWebSocket);
    jest.mock('../../cronjob');

    const { binance, logger } = require('../../helpers');
    binanceMock = binance;
    loggerMock = logger;
    loggerMock.child = jest.fn().mockImplementation(() => loggerMock);
    loggerMock.info = jest.fn();
    loggerMock.warn = jest.fn();
    loggerMock.error = jest.fn();
    loggerMock.debug = jest.fn();

    mockExecute = jest.fn((funcLogger, symbol, jobPayload) => {
      if (!funcLogger || !symbol || !jobPayload) return false;
      return jobPayload.preprocessFn();
    });

    mockGetAccountInfoFromAPI = jest.fn().mockResolvedValue({
      account: 'info'
    });
    mockUpdateAccountInfo = jest.fn().mockResolvedValue({
      account: 'updated'
    });
    mockGridTradeLastOrder = jest.fn().mockResolvedValue(null);
    mockUpdateGridTradeLastOrder = jest.fn().mockResolvedValue(null);
    mockGetManualOrder = jest.fn().mockResolvedValue(null);
    mockSaveManualOrder = jest.fn().mockResolvedValue(null);

    jest.mock('../../cronjob/trailingTradeHelper/queue', () => ({
      execute: mockExecute
    }));

    jest.mock('../../cronjob/trailingTradeHelper/common', () => ({
      getAccountInfoFromAPI: mockGetAccountInfoFromAPI,
      updateAccountInfo: mockUpdateAccountInfo
    }));

    jest.mock('../../cronjob/trailingTradeHelper/order', () => ({
      getGridTradeLastOrder: mockGridTradeLastOrder,
      updateGridTradeLastOrder: mockUpdateGridTradeLastOrder,
      getManualOrder: mockGetManualOrder,
      saveManualOrder: mockSaveManualOrder
    }));
  });

  const subscribe = async () => {
    const { setupUserWebsocket } = require('../user');
    const setupPromise = setupUserWebsocket(loggerMock);

    mockSocket.handlers.open();

    const subscriptionMessage = JSON.parse(mockSocket.send.mock.calls[0][0]);
    mockSocket.handlers.message(
      JSON.stringify({
        id: subscriptionMessage.id,
        status: 200,
        result: {
          subscriptionId: 1
        }
      })
    );

    await setupPromise;

    return subscriptionMessage;
  };

  describe('mapUserEvent', () => {
    it('maps websocket api execution report payload to legacy shape', () => {
      const { mapUserEvent } = require('../user');

      expect(
        mapUserEvent({
          e: 'executionReport',
          E: 1642713283562,
          s: 'ETHUSDT',
          S: 'BUY',
          X: 'NEW',
          o: 'STOP_LOSS_LIMIT',
          P: '3245.19000000',
          p: '3248.37000000',
          i: 7479643460,
          q: '0.00920000',
          w: false,
          Z: '0.00000000',
          z: '0.00000000',
          T: 1642713283561
        })
      ).toStrictEqual({
        eventType: 'executionReport',
        eventTime: 1642713283562,
        isOrderWorking: false,
        orderId: 7479643460,
        orderStatus: 'NEW',
        orderTime: 1642713283561,
        orderType: 'STOP_LOSS_LIMIT',
        price: '3248.37000000',
        quantity: '0.00920000',
        side: 'BUY',
        stopPrice: '3245.19000000',
        symbol: 'ETHUSDT',
        totalQuoteTradeQuantity: '0.00000000',
        totalTradeQuantity: '0.00000000'
      });
    });
  });

  describe('setupUserWebsocket', () => {
    it('opens websocket api connection and sends signed subscription request', async () => {
      await subscribe();

      expect(MockWebSocket).toHaveBeenCalledWith(
        binanceMock.userWebsocketApiBase
      );
      expect(mockSocket.send).toHaveBeenCalledTimes(1);

      const payload = JSON.parse(mockSocket.send.mock.calls[0][0]);
      expect(payload.method).toBe('userDataStream.subscribe.signature');
      expect(payload.params.apiKey).toBe(binanceMock.apiKey);
      expect(payload.params.timestamp).toEqual(expect.any(Number));
      expect(payload.params.signature).toEqual(expect.any(String));
    });

    it('triggers getAccountInfoFromAPI for balanceUpdate events', async () => {
      await subscribe();

      mockSocket.handlers.message(
        JSON.stringify({
          event: {
            e: 'balanceUpdate'
          }
        })
      );

      expect(mockGetAccountInfoFromAPI).toHaveBeenCalledWith(loggerMock);
    });

    it('triggers updateAccountInfo for outboundAccountPosition events', async () => {
      await subscribe();

      mockSocket.handlers.message(
        JSON.stringify({
          event: {
            e: 'outboundAccountPosition',
            B: [{ a: 'ADA', f: '0.00000000', l: '13.82000000' }],
            u: 1625585531721
          }
        })
      );

      expect(mockUpdateAccountInfo).toHaveBeenCalledWith(
        loggerMock,
        [{ asset: 'ADA', free: '0.00000000', locked: '13.82000000' }],
        1625585531721
      );
    });

    it('updates last order when executionReport matches latest order', async () => {
      mockGridTradeLastOrder.mockResolvedValue({
        orderId: 7479643460,
        transactTime: 1642713282000
      });

      await subscribe();

      mockSocket.handlers.message(
        JSON.stringify({
          event: {
            e: 'executionReport',
            E: 1642713283562,
            s: 'ETHUSDT',
            S: 'BUY',
            X: 'NEW',
            o: 'STOP_LOSS_LIMIT',
            P: '3245.19000000',
            p: '3248.37000000',
            i: 7479643460,
            q: '0.00920000',
            w: false,
            Z: '0.00000000',
            z: '0.00000000',
            T: 1642713283561
          }
        })
      );

      await Promise.resolve();

      expect(mockUpdateGridTradeLastOrder).toHaveBeenCalledWith(
        loggerMock,
        'ETHUSDT',
        'buy',
        {
          cummulativeQuoteQty: '0.00000000',
          executedQty: '0.00000000',
          isWorking: false,
          orderId: 7479643460,
          origQty: '0.00920000',
          price: '3248.37000000',
          side: 'BUY',
          status: 'NEW',
          stopPrice: '3245.19000000',
          transactTime: 1642713283561,
          type: 'STOP_LOSS_LIMIT',
          updateTime: 1642713283562
        }
      );
      expect(mockExecute).toHaveBeenCalledTimes(2);
    });

    it('updates manual order when executionReport matches saved manual order', async () => {
      mockGetManualOrder.mockResolvedValue({
        orderId: 7479643460
      });

      await subscribe();

      mockSocket.handlers.message(
        JSON.stringify({
          event: {
            e: 'executionReport',
            E: 1642713283562,
            s: 'ETHUSDT',
            S: 'BUY',
            X: 'NEW',
            o: 'STOP_LOSS_LIMIT',
            P: '3245.19000000',
            p: '3248.37000000',
            i: 7479643460,
            q: '0.00920000',
            w: false,
            Z: '0.00000000',
            z: '0.00000000',
            T: 1642713283561
          }
        })
      );

      await Promise.resolve();

      expect(mockSaveManualOrder).toHaveBeenCalledWith(
        loggerMock,
        'ETHUSDT',
        7479643460,
        {
          cummulativeQuoteQty: '0.00000000',
          executedQty: '0.00000000',
          isWorking: false,
          orderId: 7479643460,
          origQty: '0.00920000',
          price: '3248.37000000',
          side: 'BUY',
          status: 'NEW',
          stopPrice: '3245.19000000',
          type: 'STOP_LOSS_LIMIT',
          updateTime: 1642713283562
        }
      );
    });

    it('cleans previous socket before opening a new one', async () => {
      await subscribe();

      const firstSocket = mockSocket;
      const nextSocket = {
        handlers: {},
        close: jest.fn(),
        on: jest.fn((event, handler) => {
          nextSocket.handlers[event] = handler;
        }),
        readyState: 1,
        send: jest.fn()
      };

      MockWebSocket.mockImplementationOnce(() => nextSocket);
      mockSocket = nextSocket;

      const { setupUserWebsocket } = require('../user');
      const setupPromise = setupUserWebsocket(loggerMock);

      expect(firstSocket.close).toHaveBeenCalled();

      nextSocket.handlers.open();
      const subscriptionMessage = JSON.parse(nextSocket.send.mock.calls[0][0]);
      nextSocket.handlers.message(
        JSON.stringify({
          id: subscriptionMessage.id,
          status: 200,
          result: {
            subscriptionId: 2
          }
        })
      );

      await setupPromise;
    });
  });
});
