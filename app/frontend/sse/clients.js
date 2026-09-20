const clients = new Set();

const addClient = client => {
  clients.add(client);
};

const removeClient = client => {
  clients.delete(client);
};

const broadcast = payload => {
  const serialized = `data: ${JSON.stringify(payload)}\n\n`;

  clients.forEach(client => {
    client.write(serialized);
  });
};

const getClientsCount = () => clients.size;

module.exports = {
  addClient,
  broadcast,
  getClientsCount,
  removeClient
};
