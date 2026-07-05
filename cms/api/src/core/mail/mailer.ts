import nodemailer from 'nodemailer';
import { config } from '../config/index.js';
import { logger } from '../logger.js';

const transporter = config.SMTP_HOST
  ? nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_PORT === 465,
      auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASS } : undefined,
    })
  : null;

/** Send mail; logs instead of sending when SMTP is not configured (dev). */
export async function sendMail(to: string, subject: string, html: string): Promise<void> {
  if (!transporter) {
    logger.info({ to, subject }, '[mail:dev] SMTP not configured — mail logged only');
    logger.debug({ html }, '[mail:dev] body');
    return;
  }
  await transporter.sendMail({ from: config.MAIL_FROM, to, subject, html });
}
