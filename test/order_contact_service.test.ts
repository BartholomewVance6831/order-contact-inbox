import { describe, expect, it, vi } from "vitest";
import { routeOrderContact, type EmailGateway } from "../src/order_contact_service.js";

describe("routeOrderContact", () => {
  it("routes a checkout question to the team, then looks up the sent message", async () => {
    const email: EmailGateway = {
      send: vi.fn().mockResolvedValue({ message_id: "msg_42" }),
      get: vi.fn().mockResolvedValue({ status: "queued" }),
    };

    const result = await routeOrderContact({
      kind: "checkout_question",
      orderId: "ORD-42",
      customerEmail: "ada@example.com",
      customerName: "Ada",
      message: "Can I change the delivery address?",
    }, "orders@example.com", email);

    expect(email.send).toHaveBeenCalledWith(expect.objectContaining({
      to: "orders@example.com",
      subject: "Checkout question for order ORD-42",
    }), "order-ORD-42-checkout_question");
    expect(email.get).toHaveBeenCalledWith("msg_42");
    expect(result).toEqual({
      messageId: "msg_42",
      recipient: "team",
      delivery: { status: "queued" },
    });
  });

  it.each([
    [{ kind: "receipt" as const, amountCents: 1299 }, "Thanks, Ada. We received $12.99 for order ORD-42."],
    [{ kind: "fulfillment_update" as const, status: "shipped" as const }, "Ada, your order is now shipped."],
  ])("sends customer updates using the supported body field", async (event, body) => {
    const email: EmailGateway = {
      send: vi.fn().mockResolvedValue({ message_id: "msg_42" }),
      get: vi.fn().mockResolvedValue({ status: "queued" }),
    };

    await routeOrderContact({
      ...event,
      orderId: "ORD-42",
      customerEmail: "chenhua@changba.com",
      customerName: "Ada",
    }, "chenhua@changba.com", email);

    expect(email.send).toHaveBeenCalledWith(expect.objectContaining({
      to: "chenhua@changba.com",
      body,
    }), expect.any(String));
    expect(Object.keys(vi.mocked(email.send).mock.calls[0][0])).not.toContain("text");
  });
});
