import { credentialValue, requestJson } from './service-utils.js';

function _apiUrl(botToken, method) {
  return `https://api.telegram.org/bot${botToken}/${method}`;
}

function _checkResponse(result) {
  if (result.body?.ok === false) {
    throw new Error(`Telegram: ${result.body.description ?? 'request failed'}`);
  }
  return result.body;
}

export async function telegramSendMessage({ config, credential, signal }) {
  const operation = config.operation || 'send_message';

  const botToken = config.botToken || credentialValue(credential, ['botToken', 'token', 'value', 'apiKey']);
  if (!botToken) throw new Error('Telegram: bot token is required');

  switch (operation) {
    case 'send_message':
      return _sendMessage({ config, botToken, signal });

    case 'send_photo':
      return _sendPhoto({ config, botToken, signal });

    case 'get_updates':
      return _getUpdates({ config, botToken, signal });

    case 'get_chat':
      return _getChat({ config, botToken, signal });

    default:
      throw new Error(`Telegram: unknown operation "${operation}"`);
  }
}

// ── send_message ──────────────────────────────────────────────────────────────
// Sends a text message to a chat.
// config: chatId, text, parseMode (optional)
async function _sendMessage({ config, botToken, signal }) {
  const { chatId, text = '', parseMode = '' } = config;
  if (!chatId) throw new Error('Telegram send_message: chatId is required');

  const body = {
    chat_id: chatId,
    text: String(text),
  };
  if (parseMode) body.parse_mode = parseMode;

  const result = await requestJson(_apiUrl(botToken, 'sendMessage'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  return _checkResponse(result);
}

// ── send_photo ────────────────────────────────────────────────────────────────
// Sends a photo (file_id or public URL) to a chat.
// config: chatId, photo, caption (optional), parseMode (optional)
async function _sendPhoto({ config, botToken, signal }) {
  const { chatId, photo, caption = '', parseMode = '' } = config;
  if (!chatId) throw new Error('Telegram send_photo: chatId is required');
  if (!photo)  throw new Error('Telegram send_photo: photo (file_id or URL) is required');

  const body = {
    chat_id: chatId,
    photo: String(photo),
  };
  if (caption)   body.caption    = String(caption);
  if (parseMode) body.parse_mode = parseMode;

  const result = await requestJson(_apiUrl(botToken, 'sendPhoto'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  return _checkResponse(result);
}

// ── get_updates ───────────────────────────────────────────────────────────────
// Fetches pending updates (long-poll, offset-based).
// config: offset (optional), limit (default 100)
async function _getUpdates({ config, botToken, signal }) {
  const body = {
    limit: Number(config.limit ?? 100),
  };
  if (config.offset != null) body.offset = Number(config.offset);

  const result = await requestJson(_apiUrl(botToken, 'getUpdates'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  return _checkResponse(result);
}

// ── get_chat ──────────────────────────────────────────────────────────────────
// Returns info about a chat / channel / group.
// config: chatId
async function _getChat({ config, botToken, signal }) {
  const { chatId } = config;
  if (!chatId) throw new Error('Telegram get_chat: chatId is required');

  const result = await requestJson(_apiUrl(botToken, 'getChat'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId }),
    signal,
  });

  return _checkResponse(result);
}
