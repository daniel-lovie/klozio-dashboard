#!/usr/bin/env python3
"""Copy the skills the web agent needs into a directory it can actually reach.

The agent's `read_file` is confined to `process.cwd()`, which is `dashboard/`. The 21 skill packages live
at the repository root, one level up — so the agent could never open them. That was not a permissions
problem: the Docker build context is `dashboard/`, so the skills are not in the container at all, and
widening the sandbox root would have found nothing in production.

The fix is to put a copy where the container can see it. The copy is GENERATED, never hand-edited, so the
root skills stay the single source of truth — the alternative is two divergent copies, which is exactly
how this project ended up with six contradictory numbers in one prompt.

Only the skills whose subject the agent actually acts on are synced. Meta ads, EverBee research and the
platform-architecture skills describe work the operator does, not work this agent does; copying them would
cost tokens on every read and teach it about jobs it has no tools for.

    python3 scripts/sync_agent_knowledge.py           # write dashboard/agent-knowledge/
    python3 scripts/sync_agent_knowledge.py --check   # fail if out of date (for CI)
"""
from __future__ import annotations

import argparse
import hashlib
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
DASHBOARD = HERE.parent
SKILLS = DASHBOARD.parent / ".claude" / "skills"
OUT = DASHBOARD / "agent-knowledge"

# name -> when the agent should open it. The line becomes the index entry, so it is written for the model
# to route on, not for a human to admire.
WANTED: dict[str, str] = {
    "veteran-playbooks": "Konsept yazarken: altı arketip, başlık formülleri, fiyat bantları, tempo kuralları. "
                         "CLAUDE.md her yeni konseptin bir arketipe eşlenmesini şart koşuyor.",
    "order-fulfillment": "Sipariş geldiğinde: üreticiye giden paket, etiket (Etsy arayüzünden, API YOK), "
                         "takip girişi, kusur/yeniden baskı/kayıp kargo politikası.",
    "pod-fulfillment": "Üretici ilişkisi: kayıtlı ortak, blank ve renk adları, maliyet modeli, "
                       "üretim ortağının Etsy'de kayıtlı olması şartı.",
    "ai-design": "AI beyanı, 'Designed by' atıfı ve provenance arşivi — yayın kapısı.",
    "etsy-seo": "İlan skorlaması ve 85 yayın eşiği; başlık/tag/açıklama puanlama kalemleri.",
    "batch-production": "Toplu üretimin tuzakları: yer tutucu token'lar, ENABLE_PRODUCER, ölçüm kapıları, "
                        "stil/palet çelişkileri, kesim ve dizgi hataları.",
    "listing-covers": "Kapak görseli formülü — kapak bir reklam panosudur, mood fotoğrafı değil.",
    "tshirt-visuals": "Galeri sırası, mockup seçimi, thumbnail okunurluğu.",
    "etsy-listing-helper": "İlan metni üretimi: başlık, tag, açıklama, materyaller, öznitelikler.",
    "printful-embroidery": "Nakış fulfillment: varyant eşleme, iplik renkleri, draft/confirm, maliyet.",
    "shopify-ops": "Shopify tarafı: ürün mutasyonları, kişiselleştirme alanı, koleksiyon/fiyat.",
}

HEADER = ("<!-- URETILMIS DOSYA — ELLE DUZENLEME. Kaynak: .claude/skills/{name}/SKILL.md\n"
          "     Guncellemek icin: python3 scripts/sync_agent_knowledge.py -->\n\n")


def build() -> dict[Path, str]:
    """Returns the full desired contents of OUT, path -> text."""
    files: dict[Path, str] = {}
    missing = [n for n in WANTED if not (SKILLS / n / "SKILL.md").exists()]
    if missing:
        raise SystemExit(f"skill bulunamadi: {', '.join(missing)}")

    index = ["# Agent bilgi dizini\n",
             "Bu klasör depo kökündeki skill'lerden ÜRETİLİR. read_file ile açabilirsin; hangisini ne zaman\n"
             "açacağın aşağıda. Büyük dosyalarda offset/limit kullan — tek seferde kesilirse gerisini iste.\n"]
    for name, when in WANTED.items():
        src = (SKILLS / name / "SKILL.md").read_text(encoding="utf-8")
        files[OUT / f"{name}.md"] = HEADER.format(name=name) + src
        kb = round(len(src) / 1024)
        index.append(f"- **agent-knowledge/{name}.md** (~{kb} KB) — {when}")
    files[OUT / "INDEX.md"] = "\n".join(index) + "\n"
    return files


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="yazma, guncel degilse hata ver")
    a = ap.parse_args()

    want = build()
    if a.check:
        stale = [p.name for p, text in want.items()
                 if not p.exists()
                 or hashlib.sha256(p.read_bytes()).hexdigest()
                 != hashlib.sha256(text.encode("utf-8")).hexdigest()]
        extra = [p.name for p in OUT.glob("*.md")] if OUT.exists() else []
        extra = [n for n in extra if OUT / n not in want]
        if stale or extra:
            print(f"agent-knowledge guncel degil — eskimis: {stale or '-'}, fazla: {extra or '-'}")
            return 1
        print(f"agent-knowledge guncel ({len(want)} dosya)")
        return 0

    OUT.mkdir(exist_ok=True)
    # A skill dropped from WANTED must disappear from the copy too, or the agent keeps reading a file the
    # generator no longer owns.
    for old in OUT.glob("*.md"):
        if old not in want:
            old.unlink()
            print(f"  kaldirildi {old.name}")
    for p, text in want.items():
        p.write_text(text, encoding="utf-8")
    total = sum(len(t) for t in want.values())
    print(f"{len(want)} dosya yazildi, toplam {total//1024} KB -> {OUT.relative_to(DASHBOARD.parent)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
