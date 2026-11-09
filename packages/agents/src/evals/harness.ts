/**
 * Headless eval harness v0: 50 synthetic RFQ/offer scenarios.
 * Measures savings vs list price and policy outcomes without calling LLMs.
 *
 * Run: pnpm --filter agents eval
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sellers } from "../negotiation/seller";
import { scoreOffers, batna, normalizeWeights, type Weights } from "../negotiation/scoring";
import { evaluatePolicy, type PolicyConfig } from "../governance/policy-engine";
import type { OfferMessage, RfqMessage } from "../negotiation/protocol";

const POLICY: PolicyConfig = {
  maxOrderTotal: 50_000,
  approvalThreshold: 2_500,
  maxPerSupplierTotal: {},
  blockedSuppliers: [],
};

const PRIORITIES: Array<{ name: string; weights: Weights }> = [
  { name: "price", weights: normalizeWeights({ price: 0.85, speed: 0.15 }) },
  { name: "speed", weights: normalizeWeights({ price: 0.15, speed: 0.85 }) },
  { name: "balanced", weights: normalizeWeights({ price: 0.7, speed: 0.3 }) },
];

type ScenarioResult = {
  id: number;
  priority: string;
  quantity: number;
  maxUnitPrice: number;
  neededByDays: number;
  winner?: string;
  unitPrice?: number;
  listPrice?: number;
  savingsVsList?: number;
  savingsPct?: number;
  policy: string;
  policyReasons: string[];
  eligibleCount: number;
  judgeScore?: number;
  judgeNotes?: string;
};

/** Deterministic LLM-as-judge stand-in (prompt version JUDGE_V0) for headless CI. */
const JUDGE_PROMPT_VERSION = "JUDGE_V0_heuristic";

function judgeRationale(row: ScenarioResult): { score: number; notes: string } {
  if (!row.winner) return { score: 0.2, notes: "No eligible winner; fairness low by definition." };
  let score = 0.55;
  if (row.policy === "ALLOW") score += 0.2;
  if (row.policy === "REQUIRE_APPROVAL") score += 0.1;
  if ((row.savingsPct ?? 0) > 10) score += 0.1;
  if ((row.savingsPct ?? 0) > 20) score += 0.05;
  if (row.eligibleCount >= 2) score += 0.05;
  score = Math.min(1, Math.round(score * 100) / 100);
  return {
    score,
    notes: `${JUDGE_PROMPT_VERSION}: winner=${row.winner} policy=${row.policy} savingsPct=${row.savingsPct ?? 0}`,
  };
}

function syntheticOffers(seed: number, rfq: RfqMessage): OfferMessage[] {
  return sellers.map((seller, index) => {
    const jitter = ((seed * 17 + index * 13) % 21) - 10; // -10..+10
    const unitPrice = Math.round((seller.floorPrice + (seller.listPrice - seller.floorPrice) * (0.35 + (seed % 7) * 0.05) + jitter) * 100) / 100;
    const leadJitter = (seed + index) % 5;
    const leadTimeDays = Math.max(1, seller.leadTimeDays + leadJitter - 2);
    return {
      type: "OFFER" as const,
      rfqId: rfq.rfqId,
      from: seller.id,
      to: "buyer",
      round: 1,
      sentAt: new Date().toISOString(),
      unitPrice: Math.max(seller.floorPrice, unitPrice),
      currency: "USD" as const,
      leadTimeDays,
      validForHours: 48,
      message: `Synthetic offer ${seed}-${seller.id}`,
    };
  });
}

function buildScenario(index: number): ScenarioResult {
  const priority = PRIORITIES[index % PRIORITIES.length]!;
  const quantity = 5 + (index % 20) * 3;
  const budgetTier = 150 + (index % 10) * 15;
  const neededByDays = 7 + (index % 12) * 3;
  const rfq: RfqMessage = {
    type: "RFQ",
    rfqId: `eval-${index + 1}`,
    from: "buyer",
    to: "*",
    round: 0,
    sentAt: new Date().toISOString(),
    items: [{ sku: "ITEM-001", description: `Eval scenario ${index + 1}`, quantity }],
    maxUnitPrice: budgetTier,
    currency: "USD",
    neededByDays,
    brief: `Eval scenario ${index + 1} (${priority.name})`,
  };

  const offers = syntheticOffers(index + 1, rfq);
  const ranking = scoreOffers(rfq, offers, priority.weights);
  const winner = batna(ranking);
  const eligibleCount = ranking.filter((row) => row.withinBudget && row.meetsDeadline).length;

  if (!winner) {
    const empty: ScenarioResult = {
      id: index + 1,
      priority: priority.name,
      quantity,
      maxUnitPrice: budgetTier,
      neededByDays,
      policy: "NO_ELIGIBLE",
      policyReasons: ["No offer met budget and deadline"],
      eligibleCount,
    };
    const judged = judgeRationale(empty);
    return { ...empty, judgeScore: judged.score, judgeNotes: judged.notes };
  }

  const seller = sellers.find((item) => item.id === winner.offer.from)!;
  const savingsVsList = Math.round((seller.listPrice - winner.offer.unitPrice) * quantity * 100) / 100;
  const savingsPct = Math.round(((seller.listPrice - winner.offer.unitPrice) / seller.listPrice) * 1000) / 10;
  const decision = evaluatePolicy(rfq, winner, POLICY);
  const base: ScenarioResult = {
    id: index + 1,
    priority: priority.name,
    quantity,
    maxUnitPrice: budgetTier,
    neededByDays,
    winner: winner.offer.from,
    unitPrice: winner.offer.unitPrice,
    listPrice: seller.listPrice,
    savingsVsList,
    savingsPct,
    policy: decision.outcome,
    policyReasons: decision.reasons,
    eligibleCount,
  };
  const judged = judgeRationale(base);
  return { ...base, judgeScore: judged.score, judgeNotes: judged.notes };
}

function main() {
  const results: ScenarioResult[] = [];
  for (let i = 0; i < 50; i += 1) results.push(buildScenario(i));

  const withWinner = results.filter((row) => row.winner);
  const avgSavings =
    withWinner.length === 0
      ? 0
      : Math.round((withWinner.reduce((sum, row) => sum + (row.savingsVsList ?? 0), 0) / withWinner.length) * 100) / 100;
  const avgSavingsPct =
    withWinner.length === 0
      ? 0
      : Math.round((withWinner.reduce((sum, row) => sum + (row.savingsPct ?? 0), 0) / withWinner.length) * 10) / 10;

  const policyCounts = results.reduce(
    (acc, row) => {
      acc[row.policy] = (acc[row.policy] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const violations = results.filter((row) => row.policy === "DENY" || row.policy === "NO_ELIGIBLE");
  const avgJudge =
    results.length === 0
      ? 0
      : Math.round((results.reduce((sum, row) => sum + (row.judgeScore ?? 0), 0) / results.length) * 1000) / 1000;

  const report = {
    generatedAt: new Date().toISOString(),
    scenarioCount: results.length,
    withWinner: withWinner.length,
    avgSavingsVsListUsd: avgSavings,
    avgSavingsPct,
    avgJudgeScore: avgJudge,
    judgePromptVersion: JUDGE_PROMPT_VERSION,
    policyCounts,
    policyViolationCount: violations.length,
    policy: POLICY,
    scenarios: results,
  };

  const here = dirname(fileURLToPath(import.meta.url));
  const outDir = join(here, "../../../..", "docs");
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "EVAL_REPORT.json");
  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  const md = [
    "# Eval report v0",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    `- Scenarios: **${report.scenarioCount}** (headless, synthetic offers — no live LLM calls)`,
    `- Winners found: **${report.withWinner}**`,
    `- Avg savings vs list: **$${report.avgSavingsVsListUsd}** (${report.avgSavingsPct}%)`,
    `- Avg judge score: **${report.avgJudgeScore}** (\`${JUDGE_PROMPT_VERSION}\`)`,
    `- Policy outcomes: ${Object.entries(policyCounts).map(([k, v]) => `${k}=${v}`).join(", ")}`,
    `- Policy / eligibility issues: **${report.policyViolationCount}**`,
    "",
    "## Chart (for video / Devpost)",
    "",
    "```mermaid",
    "pie title Policy outcomes (50 scenarios)",
    ...Object.entries(policyCounts).map(([k, v]) => `  \"${k}\" : ${v}`),
    "```",
    "",
    "```mermaid",
    "xychart-beta",
    "  title Avg metrics",
    "  x-axis [SavingsPct, JudgeScorex100]",
    `  bar [${report.avgSavingsPct}, ${Math.round(report.avgJudgeScore * 100)}]`,
    "```",
    "",
    "Policy used for this run:",
    "",
    "```json",
    JSON.stringify(POLICY, null, 2),
    "```",
    "",
    "Full machine-readable results: `docs/EVAL_REPORT.json`.",
    "",
  ].join("\n");
  writeFileSync(join(outDir, "EVAL_REPORT.md"), md, "utf8");

  console.log(`Eval complete: ${report.scenarioCount} scenarios`);
  console.log(`Avg savings vs list: $${report.avgSavingsVsListUsd} (${report.avgSavingsPct}%)`);
  console.log(`Avg judge score: ${report.avgJudgeScore} (${JUDGE_PROMPT_VERSION})`);
  console.log(`Policy counts: ${JSON.stringify(policyCounts)}`);
  console.log(`Wrote ${outPath}`);
}

main();
