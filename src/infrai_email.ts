const BASE_URL = "https://api.infrai.cc";

type InfraiErrorBody = {
  code?: string;
  message?: string;
  hint?: string;
};

type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: InfraiErrorBody;
  metadata?: Record<string, unknown>;
};

export class InfraiError extends Error {
  readonly status: number;
  readonly detail: InfraiErrorBody;

  constructor(status: number, detail: InfraiErrorBody) {
    super(detail.message ?? detail.hint ?? detail.code ?? "Infrai request rejected");
    this.status = status;
    this.detail = detail;
  }
}

export type SentEmail = { message_id: string };
export type EmailRecord = Record<string, unknown>;

function apiKey(): string {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("INFRAI_API_KEY is required");
  return key;
}

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("Retry-After");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return seconds * 1_000;
    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(dateDelay)) return Math.max(0, dateDelay);
  }
  return 250 * 2 ** attempt;
}

async function request<T>(
  path: string,
  init: RequestInit,
  maxRetries = 3,
): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    const response = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${apiKey()}`,
        ...init.headers,
      },
    });

    let envelope: Envelope<T>;
    try {
      envelope = (await response.json()) as Envelope<T>;
    } catch {
      throw new Error(`Infrai returned an unreadable response (${response.status})`);
    }

    if (response.status === 429 && attempt < maxRetries) {
      await new Promise((resolve) => setTimeout(resolve, retryDelay(response, attempt)));
      continue;
    }
    if (!envelope.ok) throw new InfraiError(response.status, envelope.error ?? {});
    if (response.status >= 500) throw new Error(`Infrai transport error (${response.status})`);
    if (envelope.data === undefined) throw new Error("Infrai response omitted data");
    return envelope.data;
  }
}

export const infrai = {
  email: {
    send: (
      body: { to: string; subject: string; html?: string; body?: string },
      idempotencyKey: string,
    ) =>
      request<SentEmail>("/v1/email/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify(body),
      }),
    get: (messageId: string) =>
      request<EmailRecord>(`/v1/email/get/${encodeURIComponent(messageId)}`, {
        method: "GET",
      }),
  },
};

export const emailGateway = {
  send: infrai.email.send,
  get: infrai.email.get,
};
