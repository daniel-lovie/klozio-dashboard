#!/usr/bin/env python3
"""Build the offer structure the store needs before it can carry paid traffic.

Why this exists, in numbers. At the shop's median $21.99 list price, with the producer at $9.50 and a
$5.50 label, a single-tee order contributes $6.05 after Shopify fees. US cold-traffic CAC for apparel
is realistically $25-45. $6.05 cannot pay that, and no amount of creative work changes the arithmetic —
the offer has to change.

    basket            revenue   cost    fee    contribution   AOV
    1 tee (today)      21.99   15.00   0.94        6.05      21.99
    2 tees -15%        37.38   24.50   1.38       11.50      37.38
    3 tees -25%        49.48   34.00   1.73       13.74      49.48

Two things fall out of that table:

  THE LABEL IS PER ORDER, not per shirt. A second tee in the same parcel adds $9.50 of cost and $21.99
  of revenue, so the bundle is structurally better before a single point of discount is given away.
  15% at two units keeps more contribution than 20% ($11.50 vs $9.36) and still lifts AOV by 70%, which
  is why the tier is set where it is rather than at the rounder number.

  ONE AUTOMATIC DISCOUNT APPLIES PER ORDER. Shopify does not stack order-level automatic discounts, so
  a 2-tier ladder written as two automatic discounts would silently apply only one of them. Tiering
  properly needs a Shopify Function; until there is evidence the ladder is worth that, this ships the
  single tier that does most of the work.

The welcome code is the email-capture side of the same problem: the store has 0 customers, so there is
no list and no retargeting pool, and a first-order incentive is the cheapest way to start one.

    python3 scripts/shopify_offer.py            # dry run
    python3 scripts/shopify_offer.py --apply
"""
from __future__ import annotations

import argparse
import os
import sys

import requests

SHOP = os.environ["SHOPIFY_STORE_DOMAIN"]
API = f"https://{SHOP}/admin/api/2026-07/graphql.json"

BUNDLE_TITLE = "Buy 2 or more — 15% off"
BUNDLE_PCT = 0.15
BUNDLE_MIN_QTY = 2

WELCOME_CODE = "WELCOME10"
WELCOME_TITLE = "Welcome — 10% off first order"
WELCOME_PCT = 0.10


def token() -> str:
    r = requests.post(
        f"https://{SHOP}/admin/oauth/access_token",
        data={
            "grant_type": "client_credentials",
            "client_id": os.environ["SHOPIFY_CLIENT_ID"],
            "client_secret": os.environ["SHOPIFY_CLIENT_SECRET"],
        },
        timeout=30,
    )
    r.raise_for_status()
    return r.json()["access_token"]


def gq(tok: str, query: str, variables: dict | None = None) -> dict:
    r = requests.post(API, json={"query": query, "variables": variables or {}},
                      headers={"X-Shopify-Access-Token": tok}, timeout=40)
    r.raise_for_status()
    body = r.json()
    if body.get("errors"):
        raise RuntimeError(body["errors"])
    return body["data"]


EXISTING = """
{
  automaticDiscountNodes(first: 50) {
    nodes { id automaticDiscount { __typename ... on DiscountAutomaticBasic { title } } }
  }
  codeDiscountNodes(first: 50) {
    nodes { id codeDiscount { __typename ... on DiscountCodeBasic { title codes(first:1){nodes{code}} } } }
  }
}
"""

CREATE_AUTOMATIC = """
mutation($d: DiscountAutomaticBasicInput!) {
  discountAutomaticBasicCreate(automaticBasicDiscount: $d) {
    automaticDiscountNode { id }
    userErrors { field message }
  }
}
"""

CREATE_CODE = """
mutation($d: DiscountCodeBasicInput!) {
  discountCodeBasicCreate(basicCodeDiscount: $d) {
    codeDiscountNode { id }
    userErrors { field message }
  }
}
"""

# Far enough back that the discount is live the moment it is created, with no end date: this is the
# shop's standing offer structure, not a campaign.
STARTS = "2026-08-01T00:00:00Z"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args()

    tok = token()
    cur = gq(tok, EXISTING)
    auto_titles = {n["automaticDiscount"].get("title") for n in cur["automaticDiscountNodes"]["nodes"]}
    codes = {c["code"] for n in cur["codeDiscountNodes"]["nodes"]
             for c in n["codeDiscount"].get("codes", {}).get("nodes", [])}

    plan = []
    if BUNDLE_TITLE in auto_titles:
        print(f"zaten var: {BUNDLE_TITLE}")
    else:
        plan.append(("bundle", BUNDLE_TITLE))
    if WELCOME_CODE in codes:
        print(f"zaten var: {WELCOME_CODE}")
    else:
        plan.append(("welcome", WELCOME_CODE))

    if not plan:
        print("yapilacak bir sey yok.")
        return 0
    for kind, name in plan:
        print(f"kurulacak: {kind:8} {name}")
    if not a.apply:
        print("\nDRY RUN. Uygulamak icin --apply")
        return 0

    for kind, name in plan:
        if kind == "bundle":
            d = {
                "title": BUNDLE_TITLE,
                "startsAt": STARTS,
                "combinesWith": {"orderDiscounts": False, "productDiscounts": False,
                                 "shippingDiscounts": True},
                "minimumRequirement": {"quantity": {"greaterThanOrEqualToQuantity": str(BUNDLE_MIN_QTY)}},
                "customerGets": {
                    "value": {"percentage": BUNDLE_PCT},
                    "items": {"all": True},
                },
            }
            out = gq(tok, CREATE_AUTOMATIC, {"d": d})["discountAutomaticBasicCreate"]
        else:
            d = {
                "title": WELCOME_TITLE,
                "code": WELCOME_CODE,
                "startsAt": STARTS,
                "combinesWith": {"orderDiscounts": False, "productDiscounts": False,
                                 "shippingDiscounts": True},
                # One per customer, so the list-building incentive cannot become a standing price cut.
                "appliesOncePerCustomer": True,
                "customerSelection": {"all": True},
                "customerGets": {
                    "value": {"percentage": WELCOME_PCT},
                    "items": {"all": True},
                },
            }
            out = gq(tok, CREATE_CODE, {"d": d})["discountCodeBasicCreate"]

        errs = out.get("userErrors") or []
        if errs:
            print(f"  HATA {name}: {errs}", file=sys.stderr)
            return 1
        print(f"  {name} olusturuldu")

    # Read back. A 200 with no userErrors is not proof the object is live and discoverable.
    after = gq(tok, EXISTING)
    print("\nmagazada duran:")
    for n in after["automaticDiscountNodes"]["nodes"]:
        print(f"   otomatik: {n['automaticDiscount'].get('title')}")
    for n in after["codeDiscountNodes"]["nodes"]:
        cs = [c["code"] for c in n["codeDiscount"].get("codes", {}).get("nodes", [])]
        print(f"   kod:      {n['codeDiscount'].get('title')} {cs}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
