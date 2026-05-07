/* eslint-disable no-unused-vars */
/* eslint-disable no-restricted-globals */

const config = {
  eventStreamUrl:
    location.protocol === 'https:'
      ? `https://${location.hostname}${
          location.port !== 80 ? ':' + location.port : ''
        }/api/events`
      : `http://${location.hostname}${
          location.port !== 80 ? ':' + location.port : ''
        }/api/events`,
  apiCommandUrl:
    location.protocol === 'https:'
      ? `https://${location.hostname}${
          location.port !== 80 ? ':' + location.port : ''
        }/api/command`
      : `http://${location.hostname}${
          location.port !== 80 ? ':' + location.port : ''
        }/api/command`
};
