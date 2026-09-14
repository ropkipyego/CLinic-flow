import { env } from "../../config/env.js";
import { prisma } from "../../lib/prisma.js";

export type EmailMessage = {
  tenantId?: string | null;
  to: string;
  subject: string;
  body: string;
  purpose: string;
};

export interface EmailProvider {
  name: string;
  send(message: EmailMessage): Promise<{ provider: string }>;
}

class DisabledEmailProvider implements EmailProvider {
  name = "disabled";
  async send(_message: EmailMessage) {
    return { provider: this.name };
  }
}

class LogEmailProvider implements EmailProvider {
  name = "log";
  async send(message: EmailMessage) {
    console.info("[email:log]", message.purpose, message.to, message.subject);
    return { provider: this.name };
  }
}

class SmtpEmailProvider implements EmailProvider {
  name = "smtp";
  async send(message: EmailMessage) {
    if (!env.email.host || !env.email.from) {
      throw new Error("SMTP email provider is not fully configured.");
    }
    const nodemailer = await import("nodemailer" as string).catch(() => null);
    if (!nodemailer) {
      throw new Error("SMTP adapter requires a mail transport. Configure EMAIL_PROVIDER=log until SMTP is installed.");
    }
    const transporter = nodemailer.createTransport({
      host: env.email.host,
      port: env.email.port,
      auth: env.email.username
        ? { user: env.email.username, pass: env.email.password }
        : undefined,
    });
    await transporter.sendMail({
      from: `${env.email.fromName} <${env.email.from}>`,
      to: message.to,
      subject: message.subject,
      text: message.body,
    });
    return { provider: this.name };
  }
}

function resolveProvider(): EmailProvider {
  if (!env.email.enabled) return new DisabledEmailProvider();
  if (env.email.provider === "smtp") return new SmtpEmailProvider();
  if (env.email.provider === "log") return new LogEmailProvider();
  return new LogEmailProvider();
}

export async function sendEmail(message: EmailMessage) {
  const provider = resolveProvider();
  const record = await prisma.emailRecord.create({
    data: {
      tenantId: message.tenantId ?? null,
      toEmail: message.to,
      subject: message.subject,
      body: message.body,
      purpose: message.purpose,
      status: env.email.enabled ? "QUEUED" : "DISABLED",
      provider: provider.name,
    },
  });

  if (!env.email.enabled) {
    return record;
  }

  try {
    await provider.send(message);
    return prisma.emailRecord.update({
      where: { id: record.id },
      data: { status: "SENT", sentAt: new Date(), provider: provider.name },
    });
  } catch (error) {
    const lastError = error instanceof Error ? error.message : "Email send failed";
    console.error("[email]", lastError);
    return prisma.emailRecord.update({
      where: { id: record.id },
      data: { status: "FAILED", lastError },
    });
  }
}

export function emailPublicConfig() {
  return {
    enabled: env.email.enabled,
    provider: env.email.provider || null,
  };
}
