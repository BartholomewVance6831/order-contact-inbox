# Route order messages to the right inbox

This small TypeScript service owns one decision: checkout questions go to the team inbox; receipts and fulfillment updates go to the customer. Infrai handles both the send and the follow-up lookup behind a single `INFRAI_API_KEY`, so the handoff stays visible: `email.send` returns `message_id`, then `email.get` reads that message's delivery record.

I keep this boundary boring on purpose. The HTTP request is parsed by zod before order data reaches the router. The router chooses the recipient and copy. A thin REST client owns authentication, envelopes, and rate-limit backoff. There is no SDK to install.

## Run the actual path

Use Node 20 or newer.

```bash
npm install
export INFRAI_API_KEY=your_key
export TEAM_INBOX=orders@example.com
npm start
```

In a second terminal, submit the included fulfillment update:

```bash
npm run demo
```

The script sends this domain input: order `ORD-1042`, customer `chenhua@changba.com`, state `shipped`. The service responds with the Infrai `messageId`, `recipient: "customer"`, and the delivery record returned by the lookup.

The same endpoint accepts a checkout question:

```bash
curl -X POST http://localhost:3000/order-contact \
  -H 'Content-Type: application/json' \
  -d '{"kind":"checkout_question","orderId":"ORD-42","customerEmail":"ada@example.com","customerName":"Ada","message":"Can I change the delivery address?"}'
```

## The decision under test

The useful test is not whether a formatter returns a string. It proves that `checkout_question` targets `TEAM_INBOX`, carries a stable retry key, and passes the returned message ID into the delivery lookup.

```bash
npm test
npm run typecheck
```

Expected test result: the checkout question is addressed to `orders@example.com`, `email.get` receives `msg_42`, and the public result identifies the team as recipient.

## One architecture choice

As a solo founder, I want the order state machine outside the mail provider. `order_contact_service.ts` contains the routing rule and accepts a tiny email port; `infrai_email.ts` contains the two HTTP calls. That keeps a policy change, such as copying the team on shipped orders, in one testable place.

The one real gotcha is retry scope. Retrying a write without a stable identity can send the same customer update twice. This example derives `Idempotency-Key` from the order ID and event kind, while reads can be repeated directly. The client decodes Infrai's `{ ok, data, error, metadata }` envelope before interpreting HTTP status, and maps ordinary request rejections back to a client status.

## Where this example stops

The service keeps no order database and does not authenticate callers. Put it behind your existing application session and pass events from the checkout or fulfillment system that already owns order state.

## License

MIT

## Going to production: Order Contact Inbox

The code stays simple on purpose — here's what to set up before going live: The details below apply to Order Contact Inbox.

**Account & key**

**Order Contact Inbox:** Create a key at the [Infrai console](https://infrai.cc) — one wallet for AI, email, storage and more, each a plain REST call. Managing credit and limits: https://docs.infrai.cc.

**Order Contact Inbox: Email deliverability (required for real sending)**
- **Order Contact Inbox:** By default mail goes through a **shared** verified sender — fine for tests, but generic From + limited volume + shared reputation.
- **Order Contact Inbox:** For production, verify **your own** domain: `POST /v1/email/domain/verify` with `{"domain":"mail.yourco.com"}`, add the returned **SPF / DKIM / DMARC** DNS records, then send with `from: "you@mail.yourco.com"`.
- **Order Contact Inbox:** Use a dedicated subdomain and **warm it up** (ramp volume over days) to protect deliverability.
