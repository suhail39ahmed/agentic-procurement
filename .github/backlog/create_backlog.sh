#!/usr/bin/env bash
# Run after: gh auth login && gh repo create suhail39ahmed/agentic-procurement --public --source=. --push
set -e; R=suhail39ahmed/agentic-procurement; cd "$(dirname "$0")"
for l in enhancement feature bug docs infra paypal-api ai-agent frontend dashboard devops hackathon good-first-issue; do gh label create "$l" -R $R -f >/dev/null; done
for m in "M1 Foundations & PayPal sandbox|2026-11-02" "M2 Buyer & seller agents + negotiation|2026-11-05" "M3 Payments: authorize/capture, approvals, webhooks, disputes|2026-11-08" "M4 Dashboard + AP automation + polish|2026-11-10" "M5 Deploy, video, submission|2026-11-12"; do
 gh api repos/$R/milestones -f title="${m%%|*}" -f due_on="${m##*|}T18:29:00Z" >/dev/null; done
python3 - <<'PY'
import json,subprocess
for i in json.load(open('issues.json')):
    subprocess.run(['gh','issue','create','-R','suhail39ahmed/agentic-procurement','-t',i['title'],'-b',i['body'],'-m',i['milestone'],'-l',','.join(i['labels'])],check=True)
PY
