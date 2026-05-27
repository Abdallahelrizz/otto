import { bearerHeaders, credentialValue, parseJson, requestJson } from './service-utils.js';

export async function slackSendMessage({ config, credential }) {
  const token = config.token || credentialValue(credential, ['botToken', 'token', 'value', 'apiKey']);
  const operation = config.operation ?? 'send_message';

  switch (operation) {
    case 'send_message': {
      const { channel, text = '' } = config;
      if (!channel) throw new Error('Slack: channel is required');

      const body = {
        channel,
        text: String(text),
      };
      const blocks = parseJson(config.blocksJson, null);
      if (blocks) body.blocks = blocks;

      const result = await requestJson('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: bearerHeaders(token),
        body: JSON.stringify(body),
      });

      if (result.body && result.body.ok === false) {
        throw new Error(`Slack: ${result.body.error ?? 'request failed'}`);
      }

      return result.body;
    }

    case 'list_channels': {
      const params = new URLSearchParams({ exclude_archived: 'true', limit: String(config.limit ?? 200) });
      const result = await requestJson(`https://slack.com/api/conversations.list?${params}`, {
        method: 'GET',
        headers: bearerHeaders(token),
      });
      if (result.body && result.body.ok === false) {
        throw new Error(`Slack: ${result.body.error ?? 'list_channels failed'}`);
      }
      return result.body;
    }

    case 'get_channel': {
      const { channelId } = config;
      if (!channelId) throw new Error('Slack: channelId is required');
      const params = new URLSearchParams({ channel: channelId });
      const result = await requestJson(`https://slack.com/api/conversations.info?${params}`, {
        method: 'GET',
        headers: bearerHeaders(token),
      });
      if (result.body && result.body.ok === false) {
        throw new Error(`Slack: ${result.body.error ?? 'get_channel failed'}`);
      }
      return result.body;
    }

    case 'list_users': {
      const params = new URLSearchParams({ limit: String(config.limit ?? 200) });
      const result = await requestJson(`https://slack.com/api/users.list?${params}`, {
        method: 'GET',
        headers: bearerHeaders(token),
      });
      if (result.body && result.body.ok === false) {
        throw new Error(`Slack: ${result.body.error ?? 'list_users failed'}`);
      }
      return result.body;
    }

    case 'delete_message': {
      const { channelId, ts } = config;
      if (!channelId) throw new Error('Slack: channelId is required');
      if (!ts) throw new Error('Slack: ts (message timestamp) is required');
      const result = await requestJson('https://slack.com/api/chat.delete', {
        method: 'POST',
        headers: bearerHeaders(token),
        body: JSON.stringify({ channel: channelId, ts }),
      });
      if (result.body && result.body.ok === false) {
        throw new Error(`Slack: ${result.body.error ?? 'delete_message failed'}`);
      }
      return result.body;
    }

    default:
      throw new Error(`Slack: unknown operation "${operation}"`);
  }
}
