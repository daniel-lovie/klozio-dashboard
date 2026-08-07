"""Queue the four TTRPG products: two designs x embroidered / printed.

Each row is cloned from a proven product of the same kind (an embroidery row for the stitched pair, a
DTF row for the printed pair) and then overridden. Cloning rather than hand-writing an INSERT means
every column we don't care about keeps a value the pipeline already knows how to handle.

Nothing is published here — etsy_listing_id stays NULL. Going live on Etsy is a separate, deliberate
step.

Trademark posture: no protected name appears in any title, tag or description. "Dungeon Master",
"D&D" and every game/publisher name are deliberately absent; the copy uses generic tabletop
vocabulary (d20, dice, tabletop RPG, game night, character sheet) that no one owns.
"""
import os
import psycopg2

DIR = "/Users/omer/Documents/code/etsy/pipeline/ttrpg-guild"
EMB_TEMPLATE = "h-emb-c6-v1"   # embroidery, Printful, chest-left
DTF_TEMPLATE = "a1-c1-v1"      # DTF, printinly, same fandom tree

A_DESC = """A twenty-sided die crowned with a laurel wreath — the badge for anyone whose week is
built around one table, one campaign and one very lucky roll.

{technique_line}

· Comfort Colors 1717, garment-dyed heavyweight cotton — soft from the first wear, holds its colour
· Unisex relaxed fit, S–4XL
· Printed and shipped from the USA, tracked on every order

Made to order. If you want your own character's name on it, we make a personalised version too —
see the Character Crest tee in our shop."""

B_DESC = """Your character, on your chest. The crest carries a twenty-sided die and a banner with
{name_line}

{technique_line}

· Comfort Colors 1717, garment-dyed heavyweight cotton — soft from the first wear, holds its colour
· Unisex relaxed fit, S–4XL
· Printed and shipped from the USA, tracked on every order

How to order: put the name in the Personalisation box exactly as you want it — spelling and
capitalisation are reproduced as typed. Up to 14 characters keeps the banner readable."""

EMB_LINE = ("Stitched, not printed. Real embroidery thread on the left chest, so the badge has actual "
            "relief you can feel and nothing to crack, peel or fade in the wash.")
DTF_LINE = ("Printed large and centred with a soft-hand finish that sits in the fabric rather than on "
            "top of it.")

PRODUCTS = [
    dict(
        slug="h-emb-c8-v1", template=EMB_TEMPLATE, concept_no=8, price_cents=4999,
        title=("Embroidered D20 Crest Tee, Tabletop RPG Gift, Stitched Dice Shirt, "
               "Comfort Colors® Roleplaying Tee, Gift For Game Night, Nerdy Gift For Him"),
        description=A_DESC.format(technique_line=EMB_LINE),
        tags=['d20 shirt', 'tabletop rpg gift', 'embroidered tee', 'dice shirt',
              'roleplaying shirt', 'game night gift', 'comfort colors tee', 'stitched d20',
              'rpg gift for him', 'nerdy gift', 'dice goblin', 'tabletop gamer', 'crit shirt'],
        design="A_laurel_20_print.png", threads=['#000000', '#FFFFFF', '#A67843', '#7BA35A', '#333366', '#6B5294'],
        personalised=False, hook="A d20 in a laurel wreath, stitched as a guild badge.",
    ),
    dict(
        slug="h-emb-c9-v1", template=EMB_TEMPLATE, concept_no=9, price_cents=5999,
        title=("Custom Embroidered Character Crest Tee, Personalized Tabletop RPG Gift, "
               "Your Character Name Stitched, Comfort Colors® D20 Shirt, Roleplaying Gift"),
        description=B_DESC.format(name_line="your character's name stitched into it.",
                                  technique_line=EMB_LINE),
        tags=['custom rpg shirt', 'character name tee', 'personalized rpg', 'd20 shirt',
              'embroidered tee', 'tabletop rpg gift', 'roleplaying gift', 'custom d20 tee',
              'game night gift', 'comfort colors tee', 'rpg gift for him', 'character crest',
              'stitched name tee'],
        design="B2_shield_final.png", threads=['#000000', '#CC3333', '#A67843', '#FFFFFF'],
        personalised=True, hook="A shield crest with a d20 and the player's character name stitched in the banner.",
    ),
    dict(
        slug="h-a1-c7-v1", template=DTF_TEMPLATE, concept_no=7, price_cents=2856,
        title=("D20 Crest Tee, Tabletop RPG Shirt, Dice Laurel Tee, Comfort Colors® Roleplaying "
               "Shirt, Gamer Gift, Game Night Shirt"),
        description=A_DESC.format(technique_line=DTF_LINE),
        tags=['d20 shirt', 'tabletop rpg gift', 'dice shirt', 'roleplaying shirt',
              'game night gift', 'comfort colors tee', 'rpg gift for him', 'nerdy gift',
              'dice goblin', 'tabletop gamer', 'crit shirt', 'gamer tshirt', 'd20 tee'],
        design="A_laurel_20_print.png", threads=None,
        personalised=False, hook="A d20 in a laurel wreath, printed large.",
    ),
    dict(
        slug="h-a1-c8-v1", template=DTF_TEMPLATE, concept_no=8, price_cents=3142,
        title=("Custom Character Crest Tee, Personalized Tabletop RPG Shirt, Your Character Name, "
               "Comfort Colors® D20 Tee, Roleplaying Gift, Game Night Shirt"),
        description=B_DESC.format(name_line="your character's name printed across it.",
                                  technique_line=DTF_LINE),
        tags=['custom rpg shirt', 'character name tee', 'personalized rpg', 'd20 shirt',
              'tabletop rpg gift', 'roleplaying gift', 'custom d20 tee', 'game night gift',
              'comfort colors tee', 'rpg gift for him', 'character crest', 'custom gamer tee',
              'd20 tee'],
        design="B2_shield_final.png", threads=None,
        personalised=True, hook="A shield crest with a d20 and the player's character name.",
    ),
]

DESIGN_PROMPT_NOTE = ("nano_banana_pro drew the emblem ornament only; the '20' numeral was hand-set "
                      "in Futura Bold afterwards. See pipeline/ttrpg-guild/PROVENANCE.md for the "
                      "verbatim prompts and the selection rationale.")


def main() -> None:
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    cur = conn.cursor()
    cur.execute("SELECT column_name FROM information_schema.columns "
                "WHERE table_name='products' AND column_name <> 'id' ORDER BY ordinal_position")
    cols = [r[0] for r in cur.fetchall()]
    collist = ", ".join(f'"{c}"' for c in cols)

    for p in PRODUCTS:
        cur.execute("SELECT 1 FROM products WHERE slug=%s", (p["slug"],))
        if cur.fetchone():
            print(f"  {p['slug']}: zaten var, atlandi")
            continue

        # slug is unique, so it has to be substituted inside the SELECT rather than patched after
        select_list = ", ".join("%s" if c == "slug" else f'"{c}"' for c in cols)
        cur.execute(f"INSERT INTO products ({collist}) SELECT {select_list} FROM products WHERE slug=%s "
                    "RETURNING id", (p["slug"], p["template"]))
        new_id = cur.fetchone()[0]

        with open(f"{DIR}/{p['design']}", "rb") as fh:
            blob = fh.read()

        cur.execute("""
            UPDATE products SET
              slug=%s, title=%s, description=%s, tags=%s, price_cents=%s,
              niche=%s, tree=%s, concept_no=%s, variant=1, hook=%s,
              print_file=%s, print_file_name=%s, print_file_w=4096, print_file_h=4096, print_dpi=409,
              thread_colors=%s, personalised=%s,
              etsy_listing_id=NULL, etsy_state=NULL,
              design_model='nano_banana_pro', design_prompt=%s, design_state='ready',
              content_status='approved', hero_colorway='Pepper',
              notes=%s, agent_log='[]'::jsonb, updated_at=now()
            WHERE id=%s""",
            (p["slug"], p["title"], p["description"], p["tags"], p["price_cents"],
             "tabletop rpg", "fandom · tabletop rpg", p["concept_no"], p["hook"],
             psycopg2.Binary(blob), f"{p['slug']}-print.png",
             p["threads"], p["personalised"],
             DESIGN_PROMPT_NOTE,
             "TTRPG niche launch 2026-08-07. Ad targeting: Dungeons & Dragons (19.4M) + "
             "Tabletop role-playing game (1.76M), age 25-54, advantage_audience off.",
             new_id))
        kind = "nakış" if p["template"] == EMB_TEMPLATE else "baskı"
        print(f"  ✓ {p['slug']:14} {kind:6} ${p['price_cents']/100:6.2f}  "
              f"{'kişiselleştirilmiş' if p['personalised'] else ''}")

    conn.commit()
    cur.execute("""SELECT slug, slot, technique, fulfillment, price_cents, personalised,
                          array_length(tags,1), printful_placement, thread_colors
                     FROM products WHERE slug LIKE 'h-emb-c8%' OR slug LIKE 'h-emb-c9%'
                        OR slug LIKE 'h-a1-c7%' OR slug LIKE 'h-a1-c8%' ORDER BY slug""")
    print("\nkuyrukta:")
    for r in cur.fetchall():
        print(f"  {r[0]:14} slot={r[1]:4} {r[2]:9} {r[3]:10} ${r[4]/100:6.2f} "
              f"kisisel={r[5]} etiket={r[6]} yer={r[7]} iplik={r[8]}")
    conn.close()


if __name__ == "__main__":
    main()
