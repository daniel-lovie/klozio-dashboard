# Personalizer Agent — Spec

## Problem
A personalized order arrives with buyer free-text (`fulfillment_orders.personalization`). Today a human
must (1) figure out what the buyer actually wants printed, (2) catch garbage input, (3) regenerate the
print file with the buyer's text while preserving the existing design. This must run unattended on
Railway using Claude Opus 5 agentically, reusing the project's design know-how.

## Goals
1. **Interpret** buyer text → the exact string to print. "can we write alan?" → `Alan`. Handle
   meta-requests, quotes, casing, "name: X" patterns, Turkish/English mix.
2. **Gate** nonsense: `.`/`1111`/emoji-only/empty/ambiguous/multi-option requests never reach
   production. They surface to a human with a ready-to-send buyer reply draft.
3. **Preserve-and-swap**: generate the order's print PNG by sending the product's EXISTING print file
   to Higgsfield (nano_banana_pro) with a text-swap prompt that keeps composition, palette, lettering
   style; only the personalization token changes. Result is chroma-processed to a transparent
   DTF-ready PNG (v2 keyer: flood fill + erosion + speck sweep + verify) and stored on the order.
4. Run **on Railway** as a separate worker service (`agent`) from the same repo/image; the web
   dashboard remains the human review surface.

## Non-goals
- No auto-send to producer. Terminal agent state is `qa` — a human approves in /orders.
- No Etsy messaging automation (API has none): buyer replies are drafted, sent manually.
- No new design generation; a swap that can't preserve the design fails to `problem`.

## Order state machine
`fulfillment_orders.status` (existing) stays the operator view; new `agent_state` tracks the agent:

```
status=new, personalization!=null, agent_state=null
  └─ claim (FOR UPDATE SKIP LOCKED) → agent_state=interpreting, status=generating
       ├─ decision=reject|clarify → status=problem, note=reason + draft reply, agent_state=needs_human
       └─ decision=print(text)
            → interpreted_text=text, agent_state=rendering
            → HF: upload base print → generate swap → poll → download
            → python chroma-process + verify (semi=0, tiny=0)
            → vision QA (Opus): text correct? design preserved? → retry ≤2 with feedback
            ├─ pass → order_print_file=PNG, status=qa, agent_state=done
            └─ fail/exhausted/HF error → status=problem, note=diagnosis, agent_state=error
```
Non-personalized orders are untouched (stock print file already on the product).

## Components
| Piece | Where | Notes |
|---|---|---|
| Worker loop | `scripts/personalizer.mts` (`loop`/`once`/`interpret-test`) | poll 60s, sequential |
| LLM calls | `worker/anthropic.ts` | Messages API, model `claude-opus-5`, tool-forced JSON |
| Policy/prompts | `worker/policy.ts` | interpretation rules, swap-prompt builder (ai-design recipe), vision QA |
| Higgsfield | `worker/hf.ts` | MCP Streamable-HTTP client (initialize → tools/call), tools: media_upload→PUT→media_confirm, generate_image, job_status. OAuth tokens in `hf_tokens` table, self-refresh via mcp.higgsfield.ai token endpoint (rotates like Etsy) |
| Print processing | `scripts/process_order_print.py` | v2 keyer port; container gets python3+numpy+scipy+pillow |
| Placeholder registry | `products.personalization_placeholder` | seeded for W1 personalized products; when null, Opus vision reads the base print and identifies the swappable token first |
| Review surface | `/orders` + `GET /api/orders/{id}/print` | preview generated PNG, interpreted text in note |

## Interpretation contract (LLM output schema)
```json
{ "decision": "print" | "clarify" | "reject",
  "text_to_print": "string, exact glyphs to render (empty unless print)",
  "reason": "one sentence",
  "buyer_reply": "ready-to-send English message (empty unless clarify/reject)" }
```
Policy highlights: strip meta-language ("can we write X", "please put X"); preserve buyer's intended
casing but match the design's lettering convention (all-caps designs render all-caps); `clarify` when
multiple candidate texts or when text exceeds design's visual budget (>24 chars for name tokens);
`reject` for punctuation-only/repeated-digit/emoji-only/hate content.

## Failure & retry
- Every stage exception → `agent_attempts+1`, error to `agent_log`; ≥3 → `problem`/`error`.
- HF 401 → one token refresh; still failing → `problem` note "Higgsfield re-auth needed" (does NOT
  consume retry budget of the order).
- Worker crash-safe: claimed rows older than 15 min with non-terminal agent_state are reclaimed.

## Acceptance criteria
1. `interpret-test` harness: "can we write alan?"→print/Alan · "."→reject · "1111"→reject ·
   "Mrs. Rodriguez room 12"→print · "either Emma or Emily idk"→clarify · ""/null→skip. 6/6 must pass.
2. End-to-end on a fake order against a live personalized product: order reaches `qa` with a
   `order_print_file` whose vision QA passed, design visually preserved; then fake order deleted.
3. Nonsense fake order reaches `problem` with a sensible buyer_reply draft.
4. Railway `agent` service runs the loop with clean logs; web service untouched.
