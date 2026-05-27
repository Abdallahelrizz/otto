import { credentialValue, requestJson } from './service-utils.js';

const SENDGRID_BASE = 'https://api.sendgrid.com';

function sendgridHeaders(apiKey) {
  if (!apiKey) throw new Error('SendGrid: API key is required');
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
}

export async function sendgridEmail({ config, credential }) {
  const apiKey = config.apiKey || credentialValue(credential, ['apiKey', 'value', 'token']);
  const operation = config.operation ?? 'send_email';
  const headers = sendgridHeaders(apiKey);

  switch (operation) {
    case 'send_email': {
      const { to, from, subject, text, html } = config;
      if (!to) throw new Error('SendGrid: to is required');
      if (!from) throw new Error('SendGrid: from is required');
      if (!subject) throw new Error('SendGrid: subject is required');

      const content = [];
      if (text) content.push({ type: 'text/plain', value: String(text) });
      if (html) content.push({ type: 'text/html', value: String(html) });
      if (content.length === 0) throw new Error('SendGrid: text or html content is required');

      const body = {
        personalizations: [{ to: [{ email: String(to) }] }],
        from: { email: String(from) },
        subject: String(subject),
        content,
      };

      const result = await requestJson(`${SENDGRID_BASE}/v3/mail/send`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      // SendGrid returns 202 with an empty body on success
      return { success: true, statusCode: result.statusCode };
    }

    case 'add_contact': {
      const { email, firstName, lastName } = config;
      if (!email) throw new Error('SendGrid: email is required');

      const contact = { email: String(email) };
      if (firstName) contact.first_name = String(firstName);
      if (lastName) contact.last_name = String(lastName);

      const body = { contacts: [contact] };

      return (await requestJson(`${SENDGRID_BASE}/v3/marketing/contacts`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(body),
      })).body;
    }

    default:
      throw new Error(`SendGrid: unknown operation "${operation}"`);
  }
}
