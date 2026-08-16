import { credentialValue, parseJson, requestJson } from './service-utils.js';

const STRIPE_BASE = 'https://api.stripe.com';

function stripeHeaders(apiKey) {
  if (!apiKey) throw new Error('Stripe: API key is required');
  const encoded = Buffer.from(apiKey + ':').toString('base64');
  return {
    Authorization: `Basic ${encoded}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  };
}

function flattenMetadata(metadata) {
  const out = {};
  if (!metadata || typeof metadata !== 'object') return out;
  for (const [k, v] of Object.entries(metadata)) {
    out[`metadata[${k}]`] = String(v);
  }
  return out;
}

export async function stripeApi({ config, credential, signal }) {
  const apiKey = config.apiKey || credentialValue(credential, ['secretKey', 'apiKey', 'value']);
  const operation = config.operation ?? 'create_payment_intent';
  const headers = stripeHeaders(apiKey);

  switch (operation) {
    case 'create_payment_intent': {
      const { amount, currency = 'usd', metadataJson } = config;
      if (amount == null) throw new Error('Stripe: amount is required');
      const metadata = parseJson(metadataJson, null);
      const params = {
        amount: String(amount),
        currency: String(currency),
        ...flattenMetadata(metadata),
      };
      return (await requestJson(`${STRIPE_BASE}/v1/payment_intents`, {
        method: 'POST',
        headers,
        body: new URLSearchParams(params).toString(),
        signal,
      })).body;
    }

    case 'get_payment_intent': {
      const { paymentIntentId } = config;
      if (!paymentIntentId) throw new Error('Stripe: paymentIntentId is required');
      return (await requestJson(`${STRIPE_BASE}/v1/payment_intents/${encodeURIComponent(paymentIntentId)}`, {
        method: 'GET',
        headers,
        signal,
      })).body;
    }

    case 'list_customers': {
      const limit = config.limit ?? 10;
      const params = new URLSearchParams({ limit: String(limit) });
      return (await requestJson(`${STRIPE_BASE}/v1/customers?${params}`, {
        method: 'GET',
        headers,
        signal,
      })).body;
    }

    case 'create_customer': {
      const { email, name, metadataJson } = config;
      if (!email) throw new Error('Stripe: email is required');
      const metadata = parseJson(metadataJson, null);
      const params = {
        email: String(email),
        ...(name ? { name: String(name) } : {}),
        ...flattenMetadata(metadata),
      };
      return (await requestJson(`${STRIPE_BASE}/v1/customers`, {
        method: 'POST',
        headers,
        body: new URLSearchParams(params).toString(),
        signal,
      })).body;
    }

    case 'get_customer': {
      const { customerId } = config;
      if (!customerId) throw new Error('Stripe: customerId is required');
      return (await requestJson(`${STRIPE_BASE}/v1/customers/${encodeURIComponent(customerId)}`, {
        method: 'GET',
        headers,
        signal,
      })).body;
    }

    default:
      throw new Error(`Stripe: unknown operation "${operation}"`);
  }
}
