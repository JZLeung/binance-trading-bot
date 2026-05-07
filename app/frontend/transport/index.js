const createTransport = sendFn => ({
  __frontendTransport: true,
  send(payload) {
    return sendFn(payload);
  }
});

const createWebSocketTransport = ws =>
  createTransport(payload => ws.send(JSON.stringify(payload)));

const createHTTPTransport = res => createTransport(payload => res.send(payload));

const sendResponse = (target, payload) => {
  if (target && target.__frontendTransport) {
    return target.send(payload);
  }

  return target.send(JSON.stringify(payload));
};

module.exports = {
  createHTTPTransport,
  createTransport,
  createWebSocketTransport,
  sendResponse
};
