import { task, type TaskContext } from "@renderinc/sdk/workflows";
import { Rfq, negotiate, sellers } from "agents";

task({ name: "ping" }, function ping(_ctx: TaskContext): string {
  return "pong";
});

task(
  {
    name: "negotiate",
    retry: { maxRetries: 0 },
    timeoutSeconds: 600,
  },
  async function negotiateTask(_ctx: TaskContext, input: unknown) {
    const rfq = Rfq.parse(input);
    const result = await negotiate(rfq, sellers);

    // Return plain JSON; this task does not create an order or pay.
    return JSON.parse(JSON.stringify(result));
  },
);