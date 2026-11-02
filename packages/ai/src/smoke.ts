import { chat } from "./client";

async function main() {
  const buyer = await chat("buyer", [
    { role: "system", content: "You are a procurement buyer agent. Reply in one sentence." },
    { role: "user", content: "We need 50 ergonomic office chairs under $200 each. State your opening position." },
  ]);
  console.log(`buyer: ${buyer.content}\n`);

  const seller = await chat(
    "seller",
    [
      { role: "system", content: 'You are a furniture seller agent. Respond only with JSON: {"unitPrice": number, "leadTimeDays": number, "message": string}' },
      { role: "user", content: buyer.content },
    ],
    { json: true }
  );
  console.log(`seller: ${seller.content}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});