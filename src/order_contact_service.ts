import { z } from "zod";
import type { EmailRecord, SentEmail } from "./infrai_email.js";

const baseFields = {
  orderId: z.string().trim().min(1).max(80),
  customerEmail: z.string().email(),
  customerName: z.string().trim().min(1).max(100),
};

export const orderContactSchema = z.discriminatedUnion("kind", [
  z.object({
    ...baseFields,
    kind: z.literal("checkout_question"),
    message: z.string().trim().min(10).max(2_000),
  }),
  z.object({
    ...baseFields,
    kind: z.literal("receipt"),
    amountCents: z.number().int().positive(),
  }),
  z.object({
    ...baseFields,
    kind: z.literal("fulfillment_update"),
    status: z.enum(["packing", "shipped", "delivered"]),
  }),
]);

export type OrderContact = z.infer<typeof orderContactSchema>;

export type EmailGateway = {
  send(
    body: { to: string; subject: string; html?: string; body?: string },
    idempotencyKey: string,
  ): Promise<SentEmail>;
  get(messageId: string): Promise<EmailRecord>;
};

export type RoutedOrderContact = {
  messageId: string;
  recipient: "team" | "customer";
  delivery: EmailRecord;
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;",
  })[character] ?? character);
}

export async function routeOrderContact(
  input: OrderContact,
  teamInbox: string,
  email: EmailGateway,
): Promise<RoutedOrderContact> {
  const idempotencyKey = `order-${input.orderId}-${input.kind}`;
  let recipient: "team" | "customer";
  let sent: SentEmail;

  if (input.kind === "checkout_question") {
    recipient = "team";
    sent = await email.send({
      to: teamInbox,
      subject: `Checkout question for order ${input.orderId}`,
      html: `<p><strong>${escapeHtml(input.customerName)}</strong> (${escapeHtml(input.customerEmail)}) asked:</p><p>${escapeHtml(input.message)}</p>`,
    }, idempotencyKey);
  } else if (input.kind === "receipt") {
    recipient = "customer";
    sent = await email.send({
      to: input.customerEmail,
      subject: `Receipt for order ${input.orderId}`,
      body: `Thanks, ${input.customerName}. We received $${(input.amountCents / 100).toFixed(2)} for order ${input.orderId}.`,
    }, idempotencyKey);
  } else {
    recipient = "customer";
    sent = await email.send({
      to: input.customerEmail,
      subject: `Order ${input.orderId}: ${input.status}`,
      body: `${input.customerName}, your order is now ${input.status}.`,
    }, idempotencyKey);
  }

  const delivery = await email.get(sent.message_id);
  return { messageId: sent.message_id, recipient, delivery };
}
