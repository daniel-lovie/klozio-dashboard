#!/usr/bin/env python3
"""Generate the first gaming batch spec: 20 concepts across TTRPG / RPG / FPS / MMORPG.

Design constraints baked in here rather than left to the prompt:
- Every concept is EMBLEM-led, never typography-led. AI must not render type, and the runner can only
  hand-set the personalisation token — so a design whose whole point is a phrase has no safe path yet.
- No game, studio, franchise or publisher name appears anywhere. Each genre is expressed through its
  generic vocabulary (a d20, a crosshair, a loot crate, a guild banner), which nobody owns.
- Embroidery threads are chosen FROM Printful's palette, not mapped onto it afterwards — nearest-match
  sent dusty blue to purple and muted gold to brown on the last batch.
- Personalised concepts always carry an empty banner in the artwork for the token to sit in; without
  one the personalizer has nothing to swap and the order fails.
"""
import json
from pathlib import Path

OUT = Path(__file__).with_name("batch_gaming_01.json")

AI_NOTE = ("This design was created by me using AI image-generation tools as part of my design "
           "process, then refined and prepared for print by hand.")
EMB_LINE = ("Stitched, not printed. Real embroidery thread on the left chest, so the badge has relief "
            "you can feel and nothing to crack, peel or fade in the wash.")
DTF_LINE = ("Printed large and centred with a soft-hand finish that sits in the fabric rather than "
            "on top of it.")
BULLETS = ("\n\n- Comfort Colors 1717, garment-dyed heavyweight cotton\n"
           "- Unisex relaxed fit, S-4XL\n"
           "- Made to order and shipped from the USA, tracked on every order\n"
           "- If anything is wrong we replace it or refund you, and you never ship it back")
PERS_NOTE = ("\n\nType the name in the Personalisation box exactly as you want it. Spelling and "
             "capitalisation are reproduced as typed; up to 14 characters keeps the banner readable.")

CARD_PERS = {"file": "how-to-personalize.jpg", "title": "HOW TO PERSONALIZE",
             "footer": "MADE TO ORDER IN THE USA",
             "steps": [["Pick colour and size", "22 garment-dyed shades, S-4XL"],
                       ["Type the name", "Reproduced exactly as you type it"],
                       ["We make it and ship it", "Tracked on every order"]]}
CARD_STITCH = {"file": "stitched-not-printed.jpg", "title": "STITCHED, NOT PRINTED",
               "footer": "NOTHING TO CRACK OR PEEL", "numbered": False,
               "steps": [["Real thread", "Raised satin stitch you can feel"],
                         ["Wash after wash", "No cracking, peeling or fading"],
                         ["Left chest, badge sized", "Sits like a patch, not a slogan"]]}
CARD_PRINT = {"file": "printed-to-last.jpg", "title": "PRINTED TO LAST",
              "footer": "SOFT-HAND FINISH", "numbered": False,
              "steps": [["Sits in the fabric", "Not a stiff plastic layer on top"],
                        ["Full colour", "Every shade in the artwork prints"],
                        ["Wash cold, inside out", "Keeps the colour where it belongs"]]}
CARD_FIT = {"file": "fit-and-care.jpg", "title": "FIT & CARE", "footer": "COMFORT COLORS 1717 · S-4XL",
            "numbered": False,
            "steps": [["Unisex relaxed fit", "Roomy through the body; size down for closer"],
                      ["Garment-dyed cotton", "Heavyweight and soft from the first wear"],
                      ["Wash cold, tumble low", "No bleach, no ironing over the design"]]}

# emblem shape, thread palette (exact Printful hexes), and the per-genre wording
SHARED_TAIL_NOTE = "flat vector emblem, bold patch design, thick outlines, flat solid colours"

C = []


def add(slug, niche, kind, personalised, concept_no, price, colorway, hook, prompt_head,
        title, tags, blurb, threads=None, banner=None):
    is_emb = kind == "embroidery"
    desc = (f"{AI_NOTE}\n\n{blurb}\n\n{EMB_LINE if is_emb else DTF_LINE}{BULLETS}"
            + (PERS_NOTE if personalised else ""))
    cards = ([CARD_PERS] if personalised else []) + [CARD_STITCH if is_emb else CARD_PRINT, CARD_FIT]
    c = {"slug": slug, "niche": niche, "kind": kind, "personalised": personalised,
         "concept_no": concept_no, "price_anchor_cents": price, "hero_colorway": colorway,
         "hook": hook, "prompt_head": prompt_head, "title": title, "tags": tags,
         "description": desc,
         "cover": {"banner": banner or ("YOUR NAME · STITCHED" if personalised and is_emb
                                        else "REAL EMBROIDERY · NOT A PRINT" if is_emb
                                        else "SOFT-HAND PRINT"),
                   "strip": "COMFORT COLORS 1717 · S-4XL"},
         "info_cards": cards}
    if is_emb:
        c["threads"] = threads
    if personalised:
        c["placeholder_token"] = "KAELEN"
        c["personalization_instructions"] = (
            "Name or callsign — up to 14 characters, "
            + ("stitched" if is_emb else "printed") + " exactly as you type it")
    C.append(c)


# "a ribbon banner" alone gets drawn as a thin outlined scroll: four of the first batch came back
# with banners 0-26px tall against the 135px one that worked, and no font size stitches a name into
# a 4px scroll. The banner has to be asked for as a solid filled shape, wide and deliberately tall,
# because it is the one element the personalizer must find and overwrite.
BAN = ("a wide ribbon banner across the bottom, the banner drawn as a SOLID FILLED white shape "
       "with a large plain unbroken white interior, tall and thick, at least as tall as it is "
       "thick, with nothing written on it, ")

# ---------------------------------------------------------------- TTRPG
add("h-emb-c10-v1", "tabletop rpg", "embroidery", True, 10, 5999, "Pepper",
    "An initiative crest with the player's name stitched in the banner.",
    "a heraldic crest badge, a twenty-sided die at the centre with completely blank unmarked faces, "
    "two crossed longswords behind it, " + BAN,
    "Custom Embroidered Initiative Crest Tee, Personalized Tabletop RPG Gift, Character Name Stitched, "
    "Comfort Colors D20 Shirt",
    ["custom rpg shirt", "character name tee", "personalized rpg", "d20 shirt", "embroidered tee",
     "tabletop rpg gift", "roleplaying gift", "initiative tracker", "game night gift",
     "comfort colors tee", "rpg gift for him", "dice goblin", "stitched name tee"],
    "A crest for the one who always rolls first, with your character's name stitched into the ribbon.",
    ["#000000", "#FFFFFF", "#FFCC00", "#CC3333", "#333366"])

add("h-emb-c11-v1", "tabletop rpg", "embroidery", False, 11, 4999, "Blue Jean",
    "A stone dice tower crowned as a guild badge.",
    "a heraldic crest badge built around a tall stone dice tower with an arched opening, two small "
    "polyhedral dice tumbling from the mouth, a thick circular border ring",
    "Embroidered Dice Tower Tee, Tabletop RPG Gift, Stitched Dice Shirt, Comfort Colors Roleplaying "
    "Tee, Game Night Gift",
    ["dice tower tee", "tabletop rpg gift", "embroidered tee", "dice shirt", "roleplaying shirt",
     "game night gift", "comfort colors tee", "stitched d20", "rpg gift for him", "nerdy gift",
     "dice goblin", "tabletop gamer", "dm gift"],
    "The tower that decides everyone's fate, stitched as a guild badge.",
    ["#000000", "#FFFFFF", "#96A1A8", "#A67843", "#01784E"])

add("h-a1-c9-v1", "tabletop rpg", "dtf", False, 9, 2856, "Butter",
    "A d20 rosette with crossed swords, printed large.",
    "a bold rosette emblem, a twenty-sided die at the centre with completely blank unmarked faces, "
    "crossed longswords behind it, a ring of small pointed rays radiating outward",
    "D20 Rosette Tee, Tabletop RPG Shirt, Dice Emblem Tee, Comfort Colors Roleplaying Shirt, Gamer Gift",
    ["d20 shirt", "tabletop rpg gift", "dice shirt", "roleplaying shirt", "game night gift",
     "comfort colors tee", "rpg gift for him", "nerdy gift", "dice goblin", "tabletop gamer",
     "gamer tshirt", "d20 tee", "crit shirt"],
    "The die that decides everything, framed like a medal.")

add("h-a1-c10-v1", "tabletop rpg", "dtf", False, 10, 2856, "Pepper",
    "A potion and dice cluster badge for the table hoarder.",
    "a badge emblem of three stoppered potion bottles of different sizes clustered together with two "
    "small polyhedral dice at their base, a thin circular border ring, small sparkle marks",
    "Potion And Dice Tee, Tabletop RPG Shirt, Fantasy Gamer Tee, Comfort Colors Roleplaying Shirt, "
    "Game Night Gift",
    ["potion shirt", "tabletop rpg gift", "dice shirt", "fantasy tee", "roleplaying shirt",
     "game night gift", "comfort colors tee", "rpg gift for him", "nerdy gift", "dice goblin",
     "tabletop gamer", "gamer tshirt", "fantasy gift"],
    "Everything you hoard and never drink, in one badge.")

add("h-a1-c11-v1", "tabletop rpg", "dtf", True, 11, 3142, "Ivory",
    "A character sheet shield carrying the player's name.",
    "a heraldic shield crest divided into four quarters, a small twenty-sided die with blank faces in "
    "the upper left quarter, a sword in the upper right, a potion in the lower left, a scroll in the "
    "lower right, " + BAN,
    "Custom Character Shield Tee, Personalized Tabletop RPG Shirt, Your Character Name, Comfort Colors "
    "D20 Tee, Roleplaying Gift",
    ["custom rpg shirt", "character name tee", "personalized rpg", "d20 shirt", "tabletop rpg gift",
     "roleplaying gift", "custom d20 tee", "game night gift", "comfort colors tee", "rpg gift for him",
     "character crest", "custom gamer tee", "d20 tee"],
    "Four quarters for four things every character carries, and your name across the bottom.")

# ---------------------------------------------------------------- RPG
add("h-emb-c12-v1", "rpg", "embroidery", True, 12, 5999, "Moss",
    "A save-point crystal crest with the player's name stitched in.",
    "a heraldic crest badge built around a tall faceted crystal floating above a small stone pedestal, "
    "soft radiating lines behind the crystal, " + BAN,
    "Custom Embroidered Save Point Tee, Personalized RPG Gamer Gift, Your Name Stitched, Comfort Colors "
    "Gaming Shirt",
    ["custom gamer shirt", "save point tee", "personalized gamer", "rpg shirt", "embroidered tee",
     "gamer gift for him", "video game gift", "crystal tee", "gaming shirt", "comfort colors tee",
     "nerdy gift", "rpg gamer tee", "stitched name tee"],
    "The one place you always felt safe, stitched with your name beneath it.",
    ["#000000", "#FFFFFF", "#3399FF", "#005397", "#FFCC00"])

add("h-emb-c13-v1", "rpg", "embroidery", False, 13, 4999, "Brick",
    "A healing potion badge for the one who never uses them.",
    "a badge emblem of a single round-bellied stoppered potion bottle with a cork, a small cross "
    "symbol on the bottle body, a thick circular border ring behind it",
    "Embroidered Potion Tee, RPG Gamer Gift, Stitched Gaming Shirt, Comfort Colors Video Game Tee, "
    "Nerdy Gift For Him",
    ["potion shirt", "rpg shirt", "embroidered tee", "gamer gift for him", "video game gift",
     "gaming shirt", "comfort colors tee", "stitched gamer tee", "nerdy gift", "healer tee",
     "rpg gamer tee", "gamer tshirt", "fantasy gift"],
    "Ninety-nine in the bag and saved for a boss you never fight.",
    ["#000000", "#FFFFFF", "#CC3333", "#96A1A8", "#01784E"])

add("h-a1-c12-v1", "rpg", "dtf", False, 12, 2856, "Espresso",
    "A treasure chest emblem, printed large.",
    "a bold emblem of an open wooden treasure chest with iron bands and a heavy lock plate, coins and "
    "a small crown spilling out, radiating light lines behind it",
    "Treasure Chest Tee, RPG Gamer Shirt, Loot Emblem Tee, Comfort Colors Video Game Shirt, Gamer Gift",
    ["treasure chest tee", "rpg shirt", "loot shirt", "gamer gift for him", "video game gift",
     "gaming shirt", "comfort colors tee", "nerdy gift", "rpg gamer tee", "gamer tshirt",
     "dungeon tee", "fantasy gift", "loot goblin"],
    "The only reason anyone opens a door.")

add("h-a1-c13-v1", "rpg", "dtf", False, 13, 2856, "Blue Spruce",
    "A level-up burst emblem.",
    "a bold emblem of an upward-pointing chevron arrow inside a hexagonal frame, a burst of short rays "
    "radiating outward behind the hexagon, two small stars flanking it",
    "Level Up Tee, RPG Gamer Shirt, Gaming Emblem Tee, Comfort Colors Video Game Shirt, Nerdy Gift",
    ["level up shirt", "rpg shirt", "gamer gift for him", "video game gift", "gaming shirt",
     "comfort colors tee", "nerdy gift", "rpg gamer tee", "gamer tshirt", "xp shirt",
     "gaming emblem tee", "gift for gamer", "geek gift"],
    "The sound you would keep if you could only keep one.")

add("h-a1-c14-v1", "rpg", "dtf", True, 14, 3142, "Sandstone",
    "An adventurer's ID plate with the player's name.",
    "a rectangular metal name plate emblem with rounded corners and rivets at each corner, a small "
    "sword and shield crossed above the plate, " + BAN,
    "Custom Adventurer Name Tee, Personalized RPG Gamer Shirt, Your Name Printed, Comfort Colors "
    "Gaming Tee, Gamer Gift",
    ["custom gamer shirt", "adventurer tee", "personalized gamer", "rpg shirt", "name plate tee",
     "gamer gift for him", "video game gift", "gaming shirt", "comfort colors tee", "nerdy gift",
     "rpg gamer tee", "custom gamer tee", "gift for gamer"],
    "Every adventurer needs papers. Here are yours.")

# ---------------------------------------------------------------- FPS
add("h-emb-c14-v1", "fps", "embroidery", True, 14, 5999, "Black",
    "A callsign name tape patch, stitched like the real thing.",
    # The detector finds the banner as a light band, and a name tape drawn dark leaves it nothing:
    # this concept came back three times with no light area at all in the lower half.
    "a rectangular military-style name tape patch emblem with a thick stitched border and clipped "
    "corners, a small five-pointed star at each end of the strip, the centre of the strip a large "
    "SOLID FILLED WHITE panel, plain and completely empty with no writing",
    "Custom Embroidered Callsign Tee, Personalized Gamer Gift, Your Callsign Stitched, Comfort Colors "
    "Shooter Shirt, Gaming Gift",
    ["custom gamer shirt", "callsign tee", "personalized gamer", "fps shirt", "embroidered tee",
     "gamer gift for him", "shooter game tee", "gaming shirt", "comfort colors tee", "nerdy gift",
     "squad shirt", "custom gamer tee", "stitched name tee"],
    "Your callsign, stitched on a name tape the way it should be.",
    ["#000000", "#FFFFFF", "#96A1A8", "#01784E", "#A67843"])

add("h-emb-c15-v1", "fps", "embroidery", False, 15, 4999, "Grey",
    "A crosshair badge for the steady hand.",
    "a badge emblem of a circular crosshair reticle with four thick tick marks at the compass points "
    "and a small centre dot, a hexagonal outer frame behind the reticle",
    "Embroidered Crosshair Tee, FPS Gamer Gift, Stitched Gaming Shirt, Comfort Colors Shooter Tee, "
    "Nerdy Gift For Him",
    ["crosshair tee", "fps shirt", "embroidered tee", "gamer gift for him", "shooter game tee",
     "gaming shirt", "comfort colors tee", "stitched gamer tee", "nerdy gift", "gamer tshirt",
     "esports shirt", "gift for gamer", "aim trainer tee"],
    "Centre dot, steady hand, nothing else on the screen.",
    ["#000000", "#FFFFFF", "#E25C27", "#96A1A8", "#333366"])

add("h-a1-c15-v1", "fps", "dtf", False, 15, 2856, "Pepper",
    "A loadout flat-lay emblem.",
    "a bold emblem arranged as a symmetrical flat lay of gear silhouettes, a headset at the top, a "
    "compass and a canteen below it, two crossed combat knives at the base, a thin circular border ring",
    "Loadout Tee, FPS Gamer Shirt, Gaming Gear Emblem Tee, Comfort Colors Shooter Shirt, Gamer Gift",
    ["loadout tee", "fps shirt", "gamer gift for him", "shooter game tee", "gaming shirt",
     "comfort colors tee", "nerdy gift", "gamer tshirt", "esports shirt", "gift for gamer",
     "squad shirt", "gaming gear tee", "geek gift"],
    "Everything you check twice before the round starts.")

add("h-a1-c16-v1", "fps", "dtf", False, 16, 2856, "Denim",
    "A respawn emblem for the endlessly patient.",
    "a bold circular emblem of two thick arrows chasing each other in a clockwise loop, a small "
    "hourglass silhouette at the centre of the loop, short rays radiating outward",
    "Respawn Tee, FPS Gamer Shirt, Gaming Emblem Tee, Comfort Colors Shooter Shirt, Nerdy Gamer Gift",
    ["respawn tee", "fps shirt", "gamer gift for him", "shooter game tee", "gaming shirt",
     "comfort colors tee", "nerdy gift", "gamer tshirt", "esports shirt", "gift for gamer",
     "gaming emblem tee", "geek gift", "one more round"],
    "Ten seconds to think about what you did.")

add("h-a1-c17-v1", "fps", "dtf", True, 17, 3142, "Moss",
    "A squad patch carrying the player's callsign.",
    "a shield-shaped squad patch emblem with a thick border, a pair of crossed rifles silhouetted in "
    "the upper half with no visible branding or markings, three small stars above them, " + BAN,
    "Custom Squad Patch Tee, Personalized FPS Gamer Shirt, Your Callsign Printed, Comfort Colors "
    "Shooter Tee, Gaming Gift",
    ["custom gamer shirt", "squad patch tee", "personalized gamer", "fps shirt", "callsign tee",
     "gamer gift for him", "shooter game tee", "gaming shirt", "comfort colors tee", "nerdy gift",
     "custom gamer tee", "gift for gamer", "squad shirt"],
    "One patch, one squad, your callsign across the bottom.")

# ---------------------------------------------------------------- MMORPG
add("h-emb-c16-v1", "mmorpg", "embroidery", True, 16, 5999, "Blue Jean",
    "A guild tag patch with the guild name stitched in.",
    "a heraldic banner emblem hanging from a horizontal bar, a small castle tower silhouette at the "
    "top of the banner, two hanging tassels at the bottom corners, the banner face left completely "
    "empty with no writing",
    "Custom Embroidered Guild Tee, Personalized MMO Gamer Gift, Your Guild Name Stitched, Comfort "
    "Colors Gaming Shirt",
    ["custom gamer shirt", "guild tee", "personalized gamer", "mmo shirt", "embroidered tee",
     "gamer gift for him", "mmorpg gift", "gaming shirt", "comfort colors tee", "nerdy gift",
     "guild name tee", "custom gamer tee", "stitched name tee"],
    "The guild you have been in longer than most friendships, stitched on a banner.",
    ["#000000", "#FFFFFF", "#005397", "#FFCC00", "#CC3333"])

add("h-emb-c17-v1", "mmorpg", "embroidery", False, 17, 4999, "Espresso",
    "A trinity badge: shield, cross and sword.",
    "a circular badge emblem divided into three equal wedges by thick dividing lines, a tower shield "
    "silhouette in the first wedge, a plain cross in the second, an upright sword in the third, a "
    "thick outer ring",
    "Embroidered Tank Healer DPS Tee, MMO Gamer Gift, Stitched Gaming Shirt, Comfort Colors MMORPG "
    "Tee, Nerdy Gift",
    ["tank healer dps", "mmo shirt", "embroidered tee", "gamer gift for him", "mmorpg gift",
     "gaming shirt", "comfort colors tee", "stitched gamer tee", "nerdy gift", "healer tee",
     "raid shirt", "gamer tshirt", "gift for gamer"],
    "Three jobs, one party, endless arguing about who pulled.",
    ["#000000", "#FFFFFF", "#005397", "#01784E", "#CC3333"])

add("h-a1-c18-v1", "mmorpg", "dtf", False, 18, 2856, "Blue Spruce",
    "A portal emblem for the raid-night commute.",
    "a bold emblem of an upright stone archway with a swirling spiral filling the opening, two small "
    "floating runic diamonds flanking the arch, short rays radiating outward",
    "Portal Tee, MMO Gamer Shirt, Raid Night Emblem Tee, Comfort Colors MMORPG Shirt, Gamer Gift",
    ["portal tee", "mmo shirt", "raid shirt", "gamer gift for him", "mmorpg gift", "gaming shirt",
     "comfort colors tee", "nerdy gift", "gamer tshirt", "gift for gamer", "guild tee",
     "gaming emblem tee", "geek gift"],
    "Twenty minutes of summoning and one person still not through.")

add("h-a1-c19-v1", "mmorpg", "dtf", False, 19, 2856, "Butter",
    "A loot crate emblem for the drop that never comes.",
    "a bold emblem of a sturdy wooden crate with iron corner brackets, its lid lifting slightly with "
    "light spilling out, a small four-pointed sparkle above it, a thin circular border ring",
    "Loot Drop Tee, MMO Gamer Shirt, Raid Loot Emblem Tee, Comfort Colors MMORPG Shirt, Nerdy Gift",
    ["loot drop tee", "mmo shirt", "raid shirt", "gamer gift for him", "mmorpg gift", "gaming shirt",
     "comfort colors tee", "nerdy gift", "gamer tshirt", "gift for gamer", "loot goblin",
     "guild tee", "geek gift"],
    "Forty runs. Still not the one you wanted.")

add("h-a1-c20-v1", "mmorpg", "dtf", True, 20, 3142, "Ivory",
    "A guild banner carrying the guild name.",
    "a tall heraldic banner emblem with a forked bottom edge hanging from a horizontal pole, a small "
    "griffin-like winged silhouette at the top of the banner face, " + BAN,
    "Custom Guild Banner Tee, Personalized MMO Gamer Shirt, Your Guild Name, Comfort Colors MMORPG "
    "Tee, Gaming Gift",
    ["custom gamer shirt", "guild banner tee", "personalized gamer", "mmo shirt", "guild name tee",
     "gamer gift for him", "mmorpg gift", "gaming shirt", "comfort colors tee", "nerdy gift",
     "custom gamer tee", "raid shirt", "gift for gamer"],
    "Fly the colours you have been repping for years.")


def main() -> None:
    spec = {
        "campaign": "gaming-01",
        "shop_id": 2,
        "pipeline_dir": "/Users/omer/Documents/code/etsy/pipeline",
        "campaign_scene_calls": 0,
        "cover_crop_top": 0.2,
        "templates": {"embroidery": "h-emb-c6-v1", "dtf": "h-a1-c1-v1"},
        "printful": {"product_id": 586, "store_id": 18561101, "variant_ids": [17695],
                     "option_groups": ["Women's 2", "Women's", "Men's", "Flat"], "placement": "front"},
        "concepts": C,
    }
    bad = []
    for c in C:
        if len(c["title"]) > 140:
            bad.append(f"{c['slug']} title {len(c['title'])}")
        if len(c["tags"]) != 13 or any(len(t) > 20 for t in c["tags"]):
            bad.append(f"{c['slug']} tags {len(c['tags'])} / longest {max(len(t) for t in c['tags'])}")
        if c["kind"] == "embroidery" and len(c.get("threads") or []) > 6:
            bad.append(f"{c['slug']} threads {len(c['threads'])}")
        if c["personalised"] and "empty" not in c["prompt_head"]:
            bad.append(f"{c['slug']} personalised but prompt has no empty banner")
    OUT.write_text(json.dumps(spec, indent=1, ensure_ascii=False))
    by = {}
    for c in C:
        by[c["niche"]] = by.get(c["niche"], 0) + 1
    print(f"{len(C)} konsept -> {OUT.name}")
    print("  tur dagilimi:", by)
    print("  nakis:", sum(1 for c in C if c["kind"] == "embroidery"),
          "· baski:", sum(1 for c in C if c["kind"] == "dtf"),
          "· kisisellestirilmis:", sum(1 for c in C if c["personalised"]))
    print("  on kontrol:", "temiz ✅" if not bad else bad)


if __name__ == "__main__":
    main()
