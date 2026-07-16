// Builds and sends notification emails via Cloudflare's Email Routing
// `send_email` binding. Because orders are not persisted anywhere durable
// (see README "known limitations"), the order-pending email IS the order
// record — it's the only place the customer's photos and order details live
// once the browser tab is closed.

import { createMimeMessage } from "mimetext";
import { EmailMessage } from "cloudflare:email";

function dataUrlToBase64(dataUrl) {
  const commaIndex = dataUrl.indexOf(",");
  return commaIndex === -1 ? dataUrl : dataUrl.slice(commaIndex + 1);
}

async function send(env, { subject, text, attachments = [] }) {
  const msg = createMimeMessage();
  msg.setSender({ name: "CustomVibe", addr: env.FROM_EMAIL });
  msg.setRecipient(env.EMAIL_TO || "timmymorton1@gmail.com");
  msg.setSubject(subject);
  msg.addMessage({ contentType: "text/plain", data: text });

  attachments.forEach((att) => {
    msg.addAttachment({
      filename: att.filename,
      contentType: att.contentType,
      data: dataUrlToBase64(att.dataUrl),
    });
  });

  const message = new EmailMessage(env.FROM_EMAIL, env.EMAIL_TO || "timmymorton1@gmail.com", msg.asRaw());
  await env.EMAIL.send(message);
}

export async function sendOrderPendingEmail(env, { orderRef, customer, pudo, cart, pricing }) {
  const lines = [
    `New order received — pending payment confirmation.`,
    ``,
    `Order reference: ${orderRef}`,
    `Quantity: ${pricing.qty} (${pricing.tierLabel})`,
    `Total: R${pricing.total.toFixed(2)}${pricing.hasSavings ? ` (saved R${pricing.savings.toFixed(2)})` : ""}`,
    ``,
    `Customer:`,
    `  Name: ${customer.fullName}`,
    `  Email: ${customer.email}`,
    `  Phone: ${customer.phone}`,
    ``,
    `Delivery (PUDO pickup):`,
    `  Pickup point: ${pudo.pudoPoint}`,
    `  Suburb/city: ${pudo.suburb}`,
    `  Province: ${pudo.province}`,
    pudo.notes ? `  Notes: ${pudo.notes}` : null,
    ``,
    `Photos are attached (${cart.items.length} file${cart.items.length === 1 ? "" : "s"}).`,
    ``,
    `This email is the order record — a "Payment confirmed" email will follow once PayFast verifies the transaction.`,
  ].filter(Boolean);

  const attachments = cart.items.map((item, i) => ({
    filename: `magnet-${i + 1}.jpg`,
    contentType: "image/jpeg",
    dataUrl: item.dataUrl,
  }));

  await send(env, {
    subject: `New order ${orderRef} — pending payment (${pricing.qty}x magnets)`,
    text: lines.join("\n"),
    attachments,
  });
}

export async function sendPaymentConfirmedEmail(env, { orderRef, customerEmail, amountGross, qty }) {
  const lines = [
    `Payment confirmed by PayFast for order ${orderRef}.`,
    ``,
    `Quantity: ${qty}`,
    `Amount received: R${Number(amountGross).toFixed(2)}`,
    `Customer email: ${customerEmail || "n/a"}`,
    ``,
    `Cross-reference this with the earlier "New order ${orderRef} — pending payment" email for full order details and photos.`,
  ];

  await send(env, {
    subject: `Payment confirmed — order ${orderRef}`,
    text: lines.join("\n"),
  });
}

export async function sendContactEmail(env, { name, email, message }) {
  const lines = [`New contact form submission.`, ``, `Name: ${name}`, `Email: ${email}`, ``, message];

  await send(env, {
    subject: `New contact form message from ${name}`,
    text: lines.join("\n"),
  });
}
