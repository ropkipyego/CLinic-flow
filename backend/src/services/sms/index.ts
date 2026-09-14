import { env } from "../../config/env.js";

export type SmsPayload = {
  to: string;
  body: string;
  senderId?: string | null;
};

export type SmsSendResult = {
  provider: string;
  ok: boolean;
  response?: string;
  error?: string;
  retryable?: boolean;
};

export interface SmsProvider {
  name: string;
  send(payload: SmsPayload): Promise<SmsSendResult>;
}

class DisabledSmsProvider implements SmsProvider {
  name = "disabled";
  async send(): Promise<SmsSendResult> {
    return { provider: this.name, ok: false, error: "SMS is disabled", retryable: false };
  }
}

class LogSmsProvider implements SmsProvider {
  name = "log";
  async send(payload: SmsPayload): Promise<SmsSendResult> {
    console.info("[sms:log]", payload.to, payload.body);
    return { provider: this.name, ok: true, response: "logged" };
  }
}

class HttpSmsProvider implements SmsProvider {
  name = "http";
  async send(payload: SmsPayload): Promise<SmsSendResult> {
    if (!env.sms.apiUrl) {
      return { provider: this.name, ok: false, error: "SMS_API_URL is not configured", retryable: false };
    }
    try {
      const response = await fetch(env.sms.apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(env.sms.apiKey ? { Authorization: `Bearer ${env.sms.apiKey}` } : {}),
        },
        body: JSON.stringify({
          to: payload.to,
          message: payload.body,
          senderId: payload.senderId || env.sms.senderId,
          username: env.sms.username || undefined,
        }),
      });
      const text = await response.text();
      if (!response.ok) {
        return {
          provider: this.name,
          ok: false,
          response: text,
          error: `Provider returned ${response.status}`,
          retryable: response.status >= 500 || response.status === 429,
        };
      }
      return { provider: this.name, ok: true, response: text };
    } catch (error) {
      return {
        provider: this.name,
        ok: false,
        error: error instanceof Error ? error.message : "Network error",
        retryable: true,
      };
    }
  }
}

export function getSmsProvider(): SmsProvider {
  if (!env.sms.enabled) return new DisabledSmsProvider();
  if (env.sms.provider === "http") return new HttpSmsProvider();
  if (env.sms.provider === "log") return new LogSmsProvider();
  return new LogSmsProvider();
}

export function smsPublicConfig() {
  return {
    enabled: env.sms.enabled,
    provider: env.sms.provider || null,
  };
}
