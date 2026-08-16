import { credentialValue, requestJson } from './service-utils.js';

function twilioHeaders(accountSid, authToken) {
  if (!accountSid) throw new Error('Twilio: accountSid is required');
  if (!authToken) throw new Error('Twilio: authToken is required');
  const encoded = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  return {
    Authorization: `Basic ${encoded}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  };
}

export async function twilioSms({ config, credential, signal }) {
  const accountSid = config.accountSid || credentialValue(credential, ['accountSid']);
  const authToken  = config.authToken  || credentialValue(credential, ['authToken', 'value']);
  const operation  = config.operation ?? 'send_sms';
  const headers    = twilioHeaders(accountSid, authToken);
  const base       = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}`;

  switch (operation) {
    case 'send_sms': {
      const { to, from, body } = config;
      if (!to)   throw new Error('Twilio: to is required');
      if (!from) throw new Error('Twilio: from is required');
      if (!body) throw new Error('Twilio: body is required');

      const params = new URLSearchParams({
        To:   String(to),
        From: String(from),
        Body: String(body),
      });

      return (await requestJson(`${base}/Messages.json`, {
        method: 'POST',
        headers,
        body: params.toString(),
        signal,
      })).body;
    }

    case 'get_message': {
      const { messageSid } = config;
      if (!messageSid) throw new Error('Twilio: messageSid is required');
      return (await requestJson(`${base}/Messages/${encodeURIComponent(messageSid)}.json`, {
        method: 'GET',
        headers,
        signal,
      })).body;
    }

    case 'list_messages': {
      const params = new URLSearchParams();
      if (config.to)       params.set('To', String(config.to));
      if (config.from)     params.set('From', String(config.from));
      if (config.pageSize) params.set('PageSize', String(config.pageSize));
      const qs = params.toString();
      return (await requestJson(`${base}/Messages.json${qs ? '?' + qs : ''}`, {
        method: 'GET',
        headers,
        signal,
      })).body;
    }

    default:
      throw new Error(`Twilio: unknown operation "${operation}"`);
  }
}
