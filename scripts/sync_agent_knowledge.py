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
#
# Reference files matter as much as the SKILL.md. Only SKILL.md was copied, so every "playbook:
# references/x.md" pointer inside a synced skill was a dead link in the container — including the two the
# operator's standing directives name by path (cover-image.md for the cover formula and for the rule that
# mockups are produced in higgsfield from a reference image). The agent was being told to follow a file it
# could not open, and the reachable substitute said the opposite.
WANTED: dict[str, str] = {
    "tshirt-design-prompt-engineer": "Tasarim promptu yazarken: 10 katmanli derleyici, katman sirasi, "
                                     "stil katmanina konu/renk sizdirmama kurali.",
    "veteran-playbooks": "Konsept yazarken: altı arketip, başlık formülleri, fiyat bantları, tempo kuralları. "
                         "CLAUDE.md her yeni konseptin bir arketipe eşlenmesini şart koşuyor.",
    "order-fulfillment": "Sipariş geldiğinde: üreticiye giden paket, etiket (Etsy arayüzünden, API YOK), "
                         "takip girişi, kusur/yeniden baskı/kayıp kargo politikası.",
    "pod-fulfillment": "Üretici ilişkisi: kayıtlı ortak, blank ve renk adları, maliyet modeli, "
                       "üretim ortağının Etsy'de kayıtlı olması şartı.",
    "ai-design": "TASARIM YONU (renkli/goz alici, duzluk kurali, palet) + AI beyani, 'Designed by' atifi "
                 "ve provenance arsivi. Tasarim yonu icin de BURAYA bak — index eskiden sadece beyan "
                 "tarafini anlatiyordu ve yon bolumu hic acilmiyordu.",
    "etsy-seo": "İlan skorlaması ve 85 yayın eşiği; başlık/tag/açıklama puanlama kalemleri.",
    "batch-production": "Toplu üretimin tuzakları: yer tutucu token'lar, ENABLE_PRODUCER, ölçüm kapıları, "
                        "stil/palet çelişkileri, kesim ve dizgi hataları.",
    "listing-covers": "Kapak görseli formülü — kapak bir reklam panosudur, mood fotoğrafı değil.",
    "tshirt-visuals": "Galeri sırası, mockup seçimi, thumbnail okunurluğu.",
    "etsy-listing-helper": "İlan metni üretimi: başlık, tag, açıklama, materyaller, öznitelikler.",
    "printful-embroidery": "Nakış fulfillment: varyant eşleme, iplik renkleri, draft/confirm, maliyet.",
    "shopify-ops": "Shopify tarafı: ürün mutasyonları, kişiselleştirme alanı, koleksiyon/fiyat.",
}

EXTRA = [
    ("reference__bestseller-teardown.md", "research/competitor-teardowns/hilariousteezz-texas.md",
     "KATEGORI BESTSELLER'I (%6.19 donusum). Tasarlamadan ONCE oku: stil, baslik yapisi, kapak, fiyat. "
     "Stili kopyala, ticari markasini ASLA."),
]

HEADER = ("<!-- URETILMIS DOSYA — ELLE DUZENLEME. Kaynak: .claude/skills/{src}\n"
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
        files[OUT / f"{name}.md"] = HEADER.format(src=f"{name}/SKILL.md") + src
        kb = round(len(src) / 1024)
        index.append(f"- **agent-knowledge/{name}.md** (~{kb} KB) — {when}")
        # references/ travels with its skill. A SKILL.md that says "playbook: references/cover-image.md"
        # is not knowledge the agent has unless that file is in the container too.
        refs = sorted((SKILLS / name / "references").glob("*.md"))
        for r in refs:
            body = r.read_text(encoding="utf-8")
            files[OUT / f"{name}__{r.name}"] = HEADER.format(src=f"{name}/references/{r.name}") + body
            index.append(f"    - **agent-knowledge/{name}__{r.name}** (~{round(len(body) / 1024)} KB) — "
                         f"{name} skill'inin referansi")
    # Documents that are not skills but that the agent is told to follow. The bestseller teardown is the
    # reference CLAUDE.md names as the style standard; it lived under research/, outside every sync, so the
    # directive "study category bestsellers before designing" reached the agent as an unopenable path.
    for out_name, rel, when in EXTRA:
        src_path = SKILLS.parent.parent / rel
        if not src_path.exists():
            raise SystemExit(f"kaynak yok: {rel}")
        body = src_path.read_text(encoding="utf-8")
        files[OUT / out_name] = HEADER.format(src=f"../{rel}") + body
        index.append(f"- **agent-knowledge/{out_name}** (~{round(len(body) / 1024)} KB) — {when}")
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
