import { credentialValue, parseJson, requestJson } from './service-utils.js';

const DISCORD_API = 'https://discord.com/api/v10';

export async function discordSendMessage({ config, credential }) {
  const operation = config.operation || 'send_message';

  switch (operation) {
    case 'send_message':
      return _sendMessage({ config, credential });

    case 'send_embed':
      return _sendEmbed({ config, credential });

    case 'get_guild_channels':
      return _getGuildChannels({ config, credential });

    case 'get_messages':
      return _getMessages({ config, credential });

    default:
      throw new Error(`Discord: unknown operation "${operation}"`);
  }
}

// ── send_message ──────────────────────────────────────────────────────────────
// POST to a webhook URL with content, optional embeds, and optional username.
async function _sendMessage({ config, credential }) {
  const webhookUrl = config.webhookUrl || credentialValue(credential, ['webhookUrl', 'url', 'value']);
  if (!webhookUrl) throw new Error('Discord send_message: webhookUrl is required');

  const body = {
    content: config.content ?? config.text ?? '',
  };
  if (config.username) body.username = config.username;
  const embeds = parseJson(config.embedsJson, null);
  if (embeds) body.embeds = Array.isArray(embeds) ? embeds : [embeds];

  const result = await requestJson(String(webhookUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  return { ok: true, statusCode: result.statusCode, body: result.body };
}

// ── send_embed ────────────────────────────────────────────────────────────────
// POST a single rich embed to a webhook.
// config: webhookUrl, title, description, color (decimal int), fields (JSON array)
async function _sendEmbed({ config, credential }) {
  const webhookUrl = config.webhookUrl || credentialValue(credential, ['webhookUrl', 'url', 'value']);
  if (!webhookUrl) throw new Error('Discord send_embed: webhookUrl is required');

  const embed = {};
  if (config.title)       embed.title       = String(config.title);
  if (config.description) embed.description = String(config.description);
  if (config.color != null) embed.color     = Number(config.color);
  if (config.url)         embed.url         = String(config.url);

  const fields = parseJson(config.fields ?? config.fieldsJson, null);
  if (fields) embed.fields = Array.isArray(fields) ? fields : [fields];

  const result = await requestJson(String(webhookUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ embeds: [embed] }),
  });

  return { ok: true, statusCode: result.statusCode, body: result.body };
}

// ── get_guild_channels ────────────────────────────────────────────────────────
// GET /guilds/:guildId/channels  — requires a bot token.
// config: guildId
async function _getGuildChannels({ config, credential }) {
  const token = config.botToken || credentialValue(credential, ['botToken', 'token', 'value']);
  if (!token)           throw new Error('Discord get_guild_channels: botToken is required');
  const { guildId } = config;
  if (!guildId)         throw new Error('Discord get_guild_channels: guildId is required');

  const result = await requestJson(`${DISCORD_API}/guilds/${guildId}/channels`, {
    method: 'GET',
    headers: {
      Authorization: `Bot ${token}`,
      'Content-Type': 'application/json',
    },
  });

  return { ok: true, channels: result.body };
}

// ── get_messages ──────────────────────────────────────────────────────────────
// GET /channels/:channelId/messages?limit=50  — requires a bot token.
// config: channelId, limit (default 50)
async function _getMessages({ config, credential }) {
  const token = config.botToken || credentialValue(credential, ['botToken', 'token', 'value']);
  if (!token)             throw new Error('Discord get_messages: botToken is required');
  const { channelId } = config;
  if (!channelId)         throw new Error('Discord get_messages: channelId is required');

  const limit = Math.min(Number(config.limit ?? 50), 100);
  const url = `${DISCORD_API}/channels/${channelId}/messages?limit=${limit}`;

  const result = await requestJson(url, {
    method: 'GET',
    headers: {
      Authorization: `Bot ${token}`,
      'Content-Type': 'application/json',
    },
  });

  return { ok: true, messages: result.body };
}
