const config = require('config');
const axios = require('axios');
const telegram = require('../telegram');

jest.mock('config');
jest.mock('axios');

describe('telegram', () => {
  let result;

  describe('sendMessage', () => {
    describe('when telegram is not enabled', () => {
      beforeEach(async () => {
        config.get = jest.fn(key => {
          switch (key) {
            case 'telegram.enabled':
              return false;
            default:
              return '';
          }
        });

        result = await telegram.sendMessage('my message');
      });

      it('returns expected value', () => {
        expect(result).toStrictEqual({});
      });
    });

    describe('when telegram is enabled', () => {
      beforeEach(async () => {
        config.get = jest.fn(key => {
          switch (key) {
            case 'telegram.enabled':
              return true;
            default:
              return `value-${key}`;
          }
        });

        axios.post = jest.fn().mockResolvedValue(true);

        result = await telegram.sendMessage('my message', {
          symbol: 'BTCUSDT',
          apiLimit: 10
        });
      });

      it('triggers axios.post', () => {
        expect(axios.post).toHaveBeenCalledWith(
          'https://api.telegram.org/botvalue-telegram.botToken/sendMessage',
          {
            chat_id: 'value-telegram.chatId',
            text: expect.stringContaining('my message')
          }
        );
      });

      it('returns expected value', () => {
        expect(result).toBeTruthy();
      });

      describe('with a fresh symbol', () => {
        beforeEach(async () => {
          axios.post = jest.fn().mockResolvedValue(true);

          result = await telegram.sendMessage('my message', {
            symbol: 'ETHUSDT',
            apiLimit: 10
          });
        });

        it('includes api limit in text when provided', () => {
          expect(axios.post).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({
              text: expect.stringContaining('Current API Usage: 10')
            })
          );
        });
      });

      describe('if duplicated', () => {
        beforeEach(async () => {
          axios.post.mockClear();
          result = await telegram.sendMessage('my message', {
            symbol: 'BTCUSDT',
            apiLimit: 10
          });
        });

        it('does not trigger axios.post', () => {
          expect(axios.post).not.toHaveBeenCalled();
        });
      });

      describe('when post throws an error', () => {
        beforeEach(async () => {
          axios.post.mockReset();

          axios.post = jest
            .fn()
            .mockRejectedValue(new Error('something happened'));

          result = await telegram.sendMessage(
            'my message - something happened',
            {
              symbol: 'BTCUSDT',
              apiLimit: 10
            }
          );
        });

        it('returns expected value', () => {
          expect(result).toStrictEqual({});
        });
      });
    });
  });
});
