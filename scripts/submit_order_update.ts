const response = await fetch("http://localhost:3000/order-contact", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    kind: "fulfillment_update",
    orderId: "ORD-1042",
    customerEmail: "chenhua@changba.com",
    customerName: "Sam",
    status: "shipped",
  }),
});

console.log(await response.json());
