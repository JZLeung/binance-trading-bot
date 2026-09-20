const _ = require('lodash');
const moment = require('moment');
const axios = require('axios');
const config = require('config');
const logger = require('./logger');

// This variable will store last message per symbol to avoid saving the duplicated message.

const lastMessages = {};

/**
 * Send telegram message
 *
 * @param {*} text
 */
const sendMessage = async (text, params = {}) => {
  if (_.get(params, 'symbol', '') !== '') {
    if (_.get(lastMessages, `${params.symbol}.message`, '') === text) {
      return {};
    }

    lastMessages[params.symbol] = { message: text };
  }

  let formattedText = `(${moment().format('HH:mm:ss.SSS')}) ${text}`;
  if (params.apiLimit) {
    formattedText += `\n- Current API Usage: ${params.apiLimit}`;
  }

  logger.info(
    { tag: 'telegram-send-message', formattedText },
    'Send telegram message'
  );

  if (config.get('telegram.enabled') !== true) {
    return {};
  }

  try {
    const response = await axios.post(
      `https://api.telegram.org/bot${config.get(
        'telegram.botToken'
      )}/sendMessage`,
      {
        chat_id: config.get('telegram.chatId'),
        text: formattedText
      }
    );

    return response;
  } catch (e) {
    logger.error(
      { tag: 'telegram-send-message', e },
      'Error occurred while sending telegram message.'
    );

    return {};
  }
};

module.exports = { sendMessage };
