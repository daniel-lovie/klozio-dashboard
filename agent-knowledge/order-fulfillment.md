<!-- URETILMIS DOSYA — ELLE DUZENLEME. Kaynak: .claude/skills/order-fulfillment/SKILL.md
     Guncellemek icin: python3 scripts/sync_agent_knowledge.py -->

---
name: order-fulfillment
description: Per-order manual fulfillment loop for the Klozio Etsy shop — processing a new Etsy order, assembling the producer handoff packet (print-ready PNG, product details, Etsy shipping label), buying the label in the Etsy UI, sending it to the producer, receiving tracking back, and submitting tracking to Etsy. Use whenever an order comes in, when a shipment needs tracking added, when batching a day's orders, or when handling a defect, reprint, lost package, or address problem.
---

# Order fulfillment (manual producer)

The operational loop that runs after a sale. `pod-fulfillment` owns the producer *relationship*; this
skill owns each *order*.

```
Etsy order → identify design → pull print file → buy Etsy label → assemble packet
          → send to producer → producer prints/packs/ships → tracking back
          → submit tracking to Etsy → done
```

## The automation constraint — read first

**The Etsy Open API v3 has no endpoint to purchase shipping labels.** Labels must be bought and printed
in the Etsy UI, by hand.

| Step | Automatable? |
|---|---|
| Read new orders / receipts | ✅ API (`klozio-etsy-api`) |
| **Buy + print the shipping label** | ❌ **Manual, Etsy UI only** |
| Assemble & send the handoff packet | ⚠️ Partly — scriptable except the label PDF |
| **Submit tracking to Etsy** | ✅ API — `createReceiptShipment` (`tracking_number`, `carrier_name`, `notification_sent`); also emails the buyer and posts the final transaction total |

Do not design or promise a fully automated loop. It isn't available. The realistic target is a tight
**semi-manual routine with a batched label step.**

## Per-order runbook

### 1. Receive & verify the order
- Pull the receipt (API or Shop Manager). Record: receipt_id, buyer name, **shipping address**, size,
  colorway, quantity, personalization text if any.
- **Verify the colorway name matches the producer's exact naming** (`cost-model.md`). A listing that says
  "Moss" and a producer who calls it something else is how wrong items ship.
- Check the address looks deliverable. Query the buyer *before* printing if it's ambiguous — a reprint
  costs more than a message.
- If personalized: **confirm the personalization text verbatim** and treat the design as one-off.

### 2. Locate the print file
- Pull the approved print-ready PNG from `pipeline/<niche-slug>/designs/`
- Confirm it's the **approved** file, not a draft or pre-upscale version
- Confirm it matches the recorded print area from `pod-fulfillment/references/cost-model.md`
- Never send a file that hasn't passed the S2 gate in
  `tshirt-visuals/references/print-file-spec.md`

### 3. Buy the shipping label (manual)
- Shop Manager → Orders → the order → Purchase shipping label
- Ships-from should already be the producer's address (set once during S0); **verify it on the label**
- Download the label PDF
- Etsy auto-attaches tracking when the label is bought through Etsy — which is what protects the Star
  Seller on-time-with-tracking metric

### 4. Assemble the handoff packet
Use `templates/handoff-packet.md`. Non-negotiable contents:

1. **Print-ready PNG** (approved file, named unambiguously)
2. **Product details** — blank, size, colorway (producer's exact name), print placement + size, quantity
3. **Etsy shipping label PDF**
4. **Order reference** (receipt_id) so their confirmation is matchable
5. Personalization text, if any, spelled exactly

Naming convention — makes wrong-file errors visible:
```
<receipt_id>_<size>_<colorway>_<design-slug>.png
<receipt_id>_label.pdf
```

### 5. Send & confirm receipt
- Send via the agreed channel (`producer-brief.md`)
- **Wait for explicit confirmation of receipt.** A packet assumed received is the most common silent
  failure in this model
- Log the send time — processing-time SLA runs from the order, not the send

### 6. Receive tracking & close out
- Get shipment confirmation + tracking number from the producer
- Submit to Etsy via `createReceiptShipment` (carrier + tracking, notification on) — or the UI if the
  label already carries it
- Verify the order shows as shipped
- Update the order log

## Batching

Per-order handoffs don't scale past roughly a handful a day. Once volume grows:

- **Fixed daily cutoff** (e.g. 14:00). Orders after it go to the next batch — and the shipping profile
  must already account for that latency.
- One batch message with all packets, clearly separated per receipt_id
- Buy all labels in one Shop Manager session
- Ask the producer whether they prefer per-order or a daily batch (`producer-brief.md`)
- **Never batch so aggressively that processing time slips.** Star Seller needs 95%+ on-time; one slipped
  batch at low order volume is a large percentage.

## Exceptions

| Situation | Action |
|---|---|
| **Print defect** (misplaced, cracked, wrong color) | Reprint per the agreed defect policy. Apologize to buyer proactively, before they review. Log it — a pattern means a producer conversation, not a one-off |
| **Wrong size/colorway shipped** | Reprint at once. Check whether the handoff packet was ambiguous — if so, fix the template, not just the order |
| **Blank out of stock** | Per the agreed policy: substitute only with buyer consent, or hold + notify. Never silently substitute a colorway |
| **Package lost in transit** | Etsy holds us responsible regardless of who shipped. Reship or refund, then file the carrier claim. Don't make the buyer wait on the claim |
| **Address undeliverable / returned** | Contact buyer for a correction, reship. Track whether it was a buyer error or our transcription error |
| **Producer misses turnaround** | Notify the buyer *before* the ship-by date passes. A proactive message preserves the review; silence loses it |
| **Buyer wants to change size/color after ordering** | Possible only if the packet hasn't been printed. Check with the producer first, then confirm to the buyer |
| **Personalization typo (ours)** | Reprint at our cost, immediately |
| **Personalization typo (buyer's)** | Show them their submitted text; offer a discounted reprint |

**Rule across all of them: message the buyer before they message you.** Under this model we control none
of the physical steps, so communication is the only lever that protects the review.

## Star Seller protection

All four required, rolling 3 months: 95%+ first-message replies within 24h · 95%+ on-time shipping with
tracking · 4.8+ review average · 5+ orders.

This model's specific risks:
- **On-time shipping** depends on a third party. Pad the shipping profile and keep handoff latency short.
- **Tracking** is satisfied automatically by buying labels through Etsy — don't buy labels elsewhere.
- **Reply time** — set an auto-reply; auto-replies count.
- At low order counts every metric is fragile: one late ship out of five orders is 20%, an instant fail.

## Logging

Append every order to `templates/order-log.csv`. It's the only place the following become visible:

- Actual turnaround vs promised (is the shipping profile honest?)
- Defect rate by producer, design, and colorway
- Which designs sell in which colorway and size (feeds blank/colorway decisions)
- Handoff latency trend (are we the bottleneck, or the producer?)

Review monthly alongside `metrics/snapshots/`. A defect or lateness pattern belongs in
`pipeline/LEARNINGS.md`.

## Templates

| File | Use |
|---|---|
| `templates/handoff-packet.md` | The per-order message/packet sent to the producer |
| `templates/order-log.csv` | Running order + fulfillment record |
