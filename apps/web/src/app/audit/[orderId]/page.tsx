import { Suspense } from "react";
import { fetchAudit } from "@/lib/audit";

export const instant = false;

export default function AuditPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-3xl px-6 py-12">
          <h1 className="text-3xl font-semibold">Order audit timeline</h1>
          <p className="mt-3 text-sm text-gray-500">Loading audit records…</p>
        </main>
      }
    >
      <AuditTimeline params={params} />
    </Suspense>
  );
}

async function AuditTimeline({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  const audit = await fetchAudit(orderId);

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-semibold">Order audit timeline</h1>
      <p className="mt-3 break-all text-sm text-gray-500">
        {audit.orderId}
      </p>
      <p className="mt-6 font-medium">
        {audit.valid === true
          ? "Stored hash chain verified"
          : audit.valid === false
            ? "Warning: audit chain verification failed"
            : "No audit records available"}
      </p>

      <ol className="mt-8 space-y-6 border-l border-gray-300 pl-6">
        {audit.records.map((record) => (
          <li key={record.sequence} className="rounded-xl border p-5">
            <h2 className="font-semibold">
              {record.sequence}. {record.event}
            </h2>
            <p className="mt-2 text-sm">Recorded actor: {record.actor}</p>
            <p className="mt-1 text-sm">
              {new Date(record.at).toLocaleString("en-IN", {
                timeZone: "Asia/Kolkata",
              })} IST
            </p>
            {record.from && record.to && (
              <p className="mt-2 text-sm">
                Changed from {record.from} to {record.to}.
              </p>
            )}
            {record.note && <p className="mt-2 text-sm">{record.note}</p>}
          </li>
        ))}
      </ol>
      <p className="mt-8 text-sm text-gray-500">
        Verification checks stored hash links, not whether an action was
        authorized. Complete rewrites or removal of final records require
        an external checkpoint to detect.
      </p>
    </main>
  );
}
