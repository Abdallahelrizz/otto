import nodemailer from 'nodemailer';
import { assertSafeConnectionTarget } from '../utils/safe-fetch.js';

export async function sendEmail({ config, credential }) {
  const { to, subject, body, html } = config;
  if (!to) throw new Error('Send Email: to is required');
  if (!subject) throw new Error('Send Email: subject is required');

  if (!credential?.data) throw new Error('Send Email: credential is required (SMTP or Resend)');

  const { provider, host, port, user, pass, apiKey } = credential.data;

  let transporter;
  if (provider === 'resend' || apiKey) {
    // Resend SMTP gateway
    transporter = nodemailer.createTransport({
      host: 'smtp.resend.com',
      port: 465,
      secure: true,
      auth: { user: 'resend', pass: apiKey },
    });
  } else {
    const smtpHost = host ?? 'localhost';
    const smtpPort = Number(port ?? 587);
    if (!Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535) {
      throw new Error('Send Email: SMTP port must be an integer between 1 and 65535');
    }
    if (host) {
      // SECURITY: a workspace-controlled SMTP credential could otherwise scan internal TCP services.
      await assertSafeConnectionTarget(`smtp://${smtpHost}:${smtpPort}`);
    }
    transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: user ? { user, pass } : undefined,
    });
  }

  const info = await transporter.sendMail({
    from: user ?? 'otto@otto.dev',
    to: String(to),
    subject: String(subject),
    ...(html ? { html: String(html) } : { text: String(body ?? '') }),
  });

  return { messageId: info.messageId, accepted: info.accepted };
}
