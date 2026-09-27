import { createServer } from "node:http";
import { ZodError } from "zod";
import { emailGateway, InfraiError } from "./infrai_email.js";
import { orderContactSchema, routeOrderContact } from "./order_contact_service.js";

const port = Number(process.env.PORT ?? 3000);
const teamInbox = process.env.TEAM_INBOX;
if (!teamInbox) throw new Error("TEAM_INBOX is required");

const server = createServer(async (request, response) => {
  response.setHeader("Content-Type", "application/json");
  if (request.method !== "POST" || request.url !== "/order-contact") {
    response.writeHead(404).end(JSON.stringify({ error: "not_found" }));
    return;
  }

  try {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const input = orderContactSchema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    const result = await routeOrderContact(input, teamInbox, emailGateway);
    response.writeHead(202).end(JSON.stringify(result));
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      response.writeHead(400).end(JSON.stringify({ error: "invalid_request" }));
      return;
    }
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      response.writeHead(status).end(JSON.stringify({
        error: error.detail.code ?? "delivery_rejected",
        message: error.message,
      }));
      return;
    }
    console.error(error);
    response.writeHead(500).end(JSON.stringify({ error: "internal_error" }));
  }
});

server.listen(port, () => console.log(`Order contact service listening on http://localhost:${port}`));
