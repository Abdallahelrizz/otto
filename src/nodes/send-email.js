import nodemailer from 'nodemailer';

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
    transporter = nodemailer.createTransport({
      host: host ?? 'localhost',
      port: Number(port ?? 587),
      secure: Number(port) === 465,
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
