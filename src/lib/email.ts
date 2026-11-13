import 'server-only';
import nodemailer from 'nodemailer';
import { db } from './supabase/admin';

// Transactional email (login details, new temporary password, invites, reminders, status changes). Every send is logged.
export async function sendEmail(template: string, to: string, subject: string, text: string) {
  let status = 'sent';
  let error: string | null = null;
  try {
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: false,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined
    });
    await transport.sendMail({ from: process.env.SMTP_FROM, to, subject, text });
  } catch (e) {
    status = 'failed';
    error = (e as Error).message;
  }
  await db().from('email_log').insert({ template, to_address: to, subject, status, error });
  return status === 'sent';
}

export function loginDetailsEmail(name: string, email: string, tempPassword: string) {
  return `Hello ${name},

An account has been created for you in AT VMS (Arkhya Tech Vendor Management System).

Username: ${email}
Password: ${tempPassword}

Sign in at ${process.env.APP_BASE_URL}/login. You will be asked to choose your own password at your first sign-in.

Arkhya Tech`;
}

export function newPasswordEmail(name: string, email: string, tempPassword: string) {
  return `Hello ${name},

A new password has been set for your AT VMS account.

Username: ${email}
Password: ${tempPassword}

Sign in at ${process.env.APP_BASE_URL}/login. You will be asked to choose your own password.

Arkhya Tech`;
}
