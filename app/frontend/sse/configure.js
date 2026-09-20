const { v4: uuidv4 } = require('uuid');
const { PubSub } = require('../../helpers');
const { addClient, broadcast, removeClient } = require('./clients');

let notificationToken;

const configureSSE = async (app, funcLogger) => {
  const logger = funcLogger.child({ server: 'sse' });

  if (!notificationToken) {
    notificationToken = PubSub.subscribe(
      'frontend-notification',
      async (message, data) => {
        logger.info(
          { tag: 'frontend-notification' },
          `Message: ${message}, Data: ${data}`
        );

        broadcast({
          result: true,
          type: 'notification',
          message: data
        });
      }
    );
  }

  app.get('/api/events', (req, res) => {
    const correlationId = uuidv4();
    const connectionLogger = logger.child({ correlationId });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    if (typeof res.flushHeaders === 'function') {
      res.flushHeaders();
    }

    addClient(res);

    res.write(
      `data: ${JSON.stringify({
        result: true,
        type: 'connection_success',
        message: 'You are successfully connected to SSE.'
      })}\n\n`
    );

    const keepAliveInterval = setInterval(() => {
      res.write(': keep-alive\n\n');
    }, 15000);

    connectionLogger.info('SSE client connected');

    req.on('close', () => {
      clearInterval(keepAliveInterval);
      removeClient(res);
      connectionLogger.info('SSE client disconnected');
    });
  });
};

module.exports = { configureSSE };
