<!-- URETILMIS DOSYA — ELLE DUZENLEME. Kaynak: .claude/skills/pod-fulfillment/references/provider-setup.md
     Guncellemek icin: python3 scripts/sync_agent_knowledge.py -->

# Etsy-side setup — partner, ships-from, shipping profile

The Etsy configuration required before the first listing can go live. All of it is one-time.

Most of this is **Shop Manager UI only** — the API cannot do it. Deliver copy-paste content plus manual
instructions, and get user approval before any shop-level write.

## 1. Register the producer as a production partner

**Mandatory.** Non-disclosure sits in the same violation tier as selling prohibited items: first offense
typically a warning with a ~48-hour fix window, repeats mean permanent closure.

1. Shop Manager → Settings → **Production partners** → Add a production partner
2. Enter the producer's **real business name and location** — not a generic placeholder
3. Describe the relationship honestly. Klozio's approved framing
   (`klozio-etsy-api/references/profile-content.md`):
   - **About:** A US print-on-demand partner that prints and ships each Klozio design after it is ordered.
   - **Role:** I design every graphic; my partner prints, packs, and ships.
4. The partner must **not** be listed as the item's creator — we are the designer
5. On **every** listing: check "I work with a production partner" and select them

The API has a read-only production-partner endpoint; registration itself is UI-only. Verify after saving.

## 2. Set ships-from to the producer's address

**Decision made: the label ships from the producer's address.** Correct, because they physically ship and
Etsy computes delivery estimates from ships-from.

1. Shop Manager → Settings → Shipping settings → set the origin/ships-from to the producer's address
2. Confirm the ZIP is right — transit estimates and label rates both key off it
3. Re-verify if the producer moves or you add a second producer

Etsy requires an accurate ships-from address and holds **us** responsible for delivery regardless of who
ships. Etsy has an official flow for this: *"How to Use a Third-Party Provider to Ship Your Order."*

Note: since June 2026 Etsy prints the **shop name on every label** generated through Etsy Shipping.
Labels will read Klozio even though the producer ships — good for branding. The ships-from *address* is
the part that must be the producer's.

## 3. Create the shipping profile

```
Processing time = our handoff latency + producer turnaround + 1–2 day buffer
Delivery time   = carrier transit from the PRODUCER's location
```

Don't forget handoff latency — the clock starts when the order lands, not when the producer gets the file.
Batched daily handoffs add up to a day before printing even starts.

1. Shop Manager → Settings → Shipping settings → Add a shipping profile
   (or `POST /shops/67236031/shipping-profiles` via `klozio-etsy-api` — none created yet)
2. Origin: producer's location
3. Processing time: per formula, padded
4. **US shipping cost: under $6, ideally $0** — bake into item price
5. Shop-level free-shipping guarantee for US orders $35+
6. Attach the profile to every listing

Honest times aren't optional: on-time shipping with tracking (95%+, rolling 3 months) is a Star Seller
requirement and a ranking factor. Under-promising is free; over-promising costs the badge.

### Also create a processing profile (readiness state)

Etsy has moved processing times from shipping profiles to **processing profiles** at the product level.
**`readiness_state_id` is now required for physical listings**, and once a listing is linked to a
processing profile it **cannot be switched back** to shipping-profile processing times.

Klozio has zero listings and no shipping profile, so **build on processing profiles from the start** —
there's nothing to migrate, and adopting the old model now just means migrating later.

```
createShopReadinessStateDefinition
  readiness_state      = made_to_order
  min_processing_time  = <our handoff latency + producer turnaround>
  max_processing_time  = <that + 1–2 day buffer>
  processing_time_unit = days
```

Fetch existing ones with `getShopReadinessStateDefinitions`. Details in
`klozio-etsy-api/references/endpoints.md`.

## 4. Shipping label capability — know the constraint

**The Etsy Open API v3 has no endpoint to purchase shipping labels.** Labels must be bought and printed
through the Etsy UI.

What *is* automatable: submitting tracking after the fact via `createReceiptShipment`
(`tracking_number`, `carrier_name`, `notification_sent`) — which also triggers the buyer notification
email and posts the final transaction total.

Consequence for the workflow: **label purchase is a manual step, tracking submission can be scripted.**
`order-fulfillment` is built around that split. Don't design a fully-automated fulfillment loop; it isn't
available.

## 5. Blank swatches & sample

1. Get official swatch images from the **blank manufacturer** (not a POD platform — there isn't one).
   Store in `assets/swatches/`
2. Confirm with the producer that every listed colorway is actually sourceable
3. Order **one physical sample** before the first launch, and one per new blank or colorway thereafter

The sample verifies real fabric color against swatch and mockup, confirms print placement and size
against the artwork, and supplies real photos for carousel slots 9–10 that AI mockups cannot. It also
validates the producer's actual print quality before a paying customer does.

## Switching or adding a producer later

1. Do **not** switch mid-season
2. Complete a fresh `producer-brief.md` — print method and blank names will differ
3. Order a sample first
4. **Register the new producer as a production partner before the first order routes to them**
5. Update the **ships-from address** and re-check the shipping profile if turnaround or location changed
6. Recompute `cost-model.md`; confirm prices still clear the 55% margin floor
7. Re-verify colorway names and rebuild any mockup whose garment color no longer matches
