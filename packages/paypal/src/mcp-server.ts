/**
 * PayPal MCP server (stdio) for Cursor / Claude Desktop.
 *
 * Run:
 *   pnpm --filter paypal mcp
 *
 * Requires PAYPAL_CLIENT_ID + PAYPAL_CLIENT_SECRET (sandbox).
 */
import { PayPalAgentToolkit } from "@paypal/agent-toolkit/mcp";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { getAccessToken } from "./client";

async function main() {
  if ((process.env.PAYPAL_ENV ?? "sandbox").toLowerCase() === "live") {
    throw new Error("MCP server refuses live PayPal env");
  }

  const accessToken = await getAccessToken();
  const server = new PayPalAgentToolkit({
    accessToken,
    configuration: {
      actions: {
        invoices: {
          create: true,
          list: true,
          get: true,
          send: true,
          sendReminder: true,
          search: true,
          generateInvoiceNumber: true,
        },
        orders: { create: true, get: true },
        disputes: { list: true, get: true, create: true },
        shipment: { create: true, show: true },
        transactions: { list: true },
        insights: { get: true },
        products: { create: true, list: true, show: true },
      },
      context: { sandbox: true },
    },
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[paypal-mcp] PayPal Agent Toolkit MCP server running on stdio (sandbox)");
}

main().catch((err) => {
  console.error("[paypal-mcp] fatal", err);
  process.exit(1);
});
