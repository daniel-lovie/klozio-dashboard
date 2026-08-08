#!/usr/bin/env python3
"""Point Shopify's orders/create webhook at our fulfilment endpoint.

Run this AFTER the endpoint is deployed: Shopify does not probe the URL when the subscription is
created, so registering early just means paid orders are delivered to a 404 and then retried for
48 hours. Re-running is safe — an existing subscription for the same topic is updated in place.
"""
import json
import os
import sys

import requests

SHOP = os.environ["SHOPIFY_STORE_DOMAIN"]
API = f"https://{SHOP}/admin/api/2026-07/graphql.json"
BASE = os.environ.get("PUBLIC_BASE_URL", "https://web-production-c9b31.up.railway.app")
ENDPOINT = f"{BASE}/api/shopify/orders"
TOPIC = "ORDERS_CREATE"


def gql(head, query, variables=None):
    r = requests.post(API, headers=head, json={"query": query, "variables": variables or {}},
                      timeout=60)
    d = r.json()
    if d.get("errors"):
        raise RuntimeError(json.dumps(d["errors"])[:400])
    return d["data"]


def main() -> None:
    tok = requests.post(f"https://{SHOP}/admin/oauth/access_token", data={
        "grant_type": "client_credentials",
        "client_id": os.environ["SHOPIFY_CLIENT_ID"],
        "client_secret": os.environ["SHOPIFY_CLIENT_SECRET"]}, timeout=30).json().get("access_token")
    if not tok:
        sys.exit("shopify token alinamadi")
    head = {"X-Shopify-Access-Token": tok, "Content-Type": "application/json"}

    existing = gql(head, """{ webhookSubscriptions(first:25){ nodes{ id topic
      endpoint{ ... on WebhookHttpEndpoint { callbackUrl } } } } }""")
    print("mevcut abonelikler:")
    mine = None
    for n in existing["webhookSubscriptions"]["nodes"]:
        url = (n.get("endpoint") or {}).get("callbackUrl")
        print(f"   {n['topic']:16} {url}")
        if n["topic"] == TOPIC:
            mine = n["id"]

    if mine:
        d = gql(head, """mutation($id:ID!,$s:WebhookSubscriptionInput!){
          webhookSubscriptionUpdate(id:$id, webhookSubscription:$s){
            webhookSubscription{ id } userErrors{ message } } }""",
                {"id": mine, "s": {"callbackUrl": ENDPOINT, "format": "JSON"}})
        res = d["webhookSubscriptionUpdate"]
    else:
        d = gql(head, """mutation($t:WebhookSubscriptionTopic!,$s:WebhookSubscriptionInput!){
          webhookSubscriptionCreate(topic:$t, webhookSubscription:$s){
            webhookSubscription{ id } userErrors{ message } } }""",
                {"t": TOPIC, "s": {"callbackUrl": ENDPOINT, "format": "JSON"}})
        res = d["webhookSubscriptionCreate"]

    errs = res.get("userErrors")
    print(f"\n{TOPIC} -> {ENDPOINT}")
    print("  " + ("✓ kayitli" if not errs else f"✗ {errs}"))
    if errs:
        sys.exit(1)
    print("\nNOT: imza dogrulamasi SHOPIFY_WEBHOOK_SECRET, yoksa SHOPIFY_CLIENT_SECRET ile yapilir.")
    print("     Ikisi de yoksa endpoint her istegi 401 ile reddeder — bilerek.")


if __name__ == "__main__":
    main()
