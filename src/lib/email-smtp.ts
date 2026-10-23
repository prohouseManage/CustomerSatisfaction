import nodemailer from 'nodemailer';
import { z } from 'zod';
export type OutgoingEmail = {
  deliveryId: string;
  messageId?: string;
  to: string;
  subject: string;
  text: string;
  html: string;
};
export class EmailSendError extends Error {
  constructor(public uncertain: boolean) {
    super(uncertain ? 'Envoi SMTP non confirmé.' : 'Échec SMTP avant envoi.');
  }
}
export function smtpConfiguration() {
  const host = process.env.SMTP_HOST || '';
  const port = Number(process.env.SMTP_PORT || '587');
  const user = process.env.SMTP_USER || '';
  const pass = process.env.SMTP_PASSWORD || '';
  const from = process.env.EMAIL_FROM || '';
  if (
    !['smtp.mailgun.org', 'smtp.eu.mailgun.org'].includes(host) ||
    ![465, 587].includes(port) ||
    !user ||
    !pass ||
    !z.string().email().safeParse(from).success
  )
    return null;
  return { host, port, user, pass, from };
}
export async function sendSmtpEmail(message: OutgoingEmail) {
  const config = smtpConfiguration();
  if (!config) throw new EmailSendError(false);
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    requireTLS: true,
    auth: { user: config.user, pass: config.pass },
    tls: { minVersion: 'TLSv1.2' },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
  });
  try {
    const result = await transport.sendMail({
      from: { name: 'House of Training', address: config.from },
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
      messageId: `<${message.messageId || smtpMessageId(message.deliveryId)}>`,
      disableFileAccess: true,
      disableUrlAccess: true,
    });
    if (!result.accepted?.length) throw new EmailSendError(false);
  } catch (error) {
    if (error instanceof EmailSendError) throw error;
    const command =
      error && typeof error === 'object' && 'command' in error ? String(error.command) : '';
    // Failures before DATA cannot have delivered the message. After DATA a lost
    // acknowledgement is ambiguous: do not retry automatically.
    throw new EmailSendError(
      ![
        'CONN',
        'EHLO',
        'HELO',
        'STARTTLS',
        'AUTH',
        'AUTH PLAIN',
        'AUTH LOGIN',
        'MAIL FROM',
        'RCPT TO',
      ].includes(command),
    );
  } finally {
    transport.close();
  }
}
export function smtpMessageId(deliveryId: string) {
  const config = smtpConfiguration();
  if (!config) throw new EmailSendError(false);
  return `${deliveryId}@${config.from.split('@')[1]}`;
}
