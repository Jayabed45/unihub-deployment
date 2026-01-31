import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

// Make sure .env is loaded before we read any SMTP_* variables
dotenv.config();

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER;
const SMTP_SECURE = process.env.SMTP_SECURE === 'true' || SMTP_PORT === 465;

let transporter: nodemailer.Transporter | null = null;

if (SMTP_HOST && SMTP_FROM) {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: SMTP_USER && SMTP_PASS ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
  });

  transporter
    .verify()
    .then(() => {
      console.log(
        `Mailer: SMTP transporter is ready (host=${SMTP_HOST}, user=${SMTP_USER ?? 'no-auth'})`,
      );
    })
    .catch((error) => {
      console.error('Mailer: Failed to verify SMTP transporter', error);
    });
} else {
  console.warn('Mailer: SMTP is not fully configured. Emails will not be sent.');
}

export const sendMail = async (options: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}) => {
  if (!transporter) {
    // Mail transport not configured; fail silently so app still works without SMTP
    console.warn('sendMail called but SMTP is not configured. Skipping email send.');
    return;
  }

  try {
    await transporter.sendMail({
      from: SMTP_FROM,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
    });
  } catch (error) {
    console.error('Failed to send email', error);
  }
};
