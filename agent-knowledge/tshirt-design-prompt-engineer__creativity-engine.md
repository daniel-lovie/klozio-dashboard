<!-- URETILMIS DOSYA — ELLE DUZENLEME. Kaynak: .claude/skills/tshirt-design-prompt-engineer/references/creativity-engine.md
     Guncellemek icin: python3 scripts/sync_agent_knowledge.py -->

# Creativity & Likeability Engine

When the user asks for "creative," "unique," or "likeable" designs, do not just output a generic skull, sunset, or typography block. Engage the Creativity Engine before compiling the prompt.

## 1. The Cliché Filter
Avoid the most overused print-on-demand tropes unless the user specifically demands them:
- **Avoid:** Generic howling wolves, basic geometric mountain/pine tree badges, standard retro sunsets with palm trees, unironic "Live Laugh Love" cursive, generic coffee cups with steam, floating astronaut-in-space, and plain skull-with-roses.
- **Instead:** Find a specific sub-niche, an unexpected juxtaposition, or a highly specific visual metaphor.

## 2. The Three Angles of Creativity
When generating concepts from a loose brief, provide 3 distinct creative angles:

1. **The Literal but Elevated:** Takes the user's idea directly but executes it in a striking, unexpected visual style (e.g., instead of a "vector coffee cup," a "linocut anatomical heart brewing coffee").
2. **The Clever Juxtaposition:** Combines two unrelated themes to create a new niche (e.g., "Gothic Victorian engraving style" + "Modern skateboarding culture").
3. **The Inside Joke / Subculture Deep-Cut:** Focuses on a specific detail only true fans of the niche would understand (e.g., instead of "I love coding," a visual pun about "Dropping tables" or "Missing semicolons" drawn as a vintage horror comic).

## 3. The "Likeability" Formula (Commercial Appeal)
A design is "likeable" and sells well when it balances uniqueness with wearability:
- **Wearable Silhouette:** The outer shape must feel natural on a chest. Avoid hard, arbitrary squares or rigid circles unless the concept demands a badge. Use organic, irregular, or arched silhouettes.
- **Identity Expression:** The design must allow the wearer to project an identity. It should say "I am [X]" without needing to literally write "I am [X]".
- **Color Intent:** Every colour needs a job — which one carries the shapes, which draws contour, which is the accent. Intent is not scarcity: DTF prints full colour natively and six to twelve flat colours is the working range (operator directive 2026-08-14; the earlier "2-4 colors" guidance produced the washed-out look this shop kept rejecting). Name specific evocative colours ("burnt ochre, electric teal, deep navy") rather than the word "colorful". What DTF punishes is *soft transitions* — gradients, glows, airbrush fades — not colour count.
- **Visual Anchor:** One clear focal point that can be read from 10 feet away, supported by secondary details discovered up close.

## 4. Coherent Novelty, Not Randomness
Novelty must feel intentional. Use one dominant concept and no more than two novelty levers, such as an unexpected subject pairing, unusual medium, visual metaphor, subculture detail, transformed scale, or unconventional viewpoint. Do not combine unrelated elements merely to appear creative. Each surprising choice must reinforce the wearer's identity or the central joke.

## 5. Concept Selection Gate
Score all three angles from 0-5 on the criteria below before compiling a prompt:

| Criterion | Question |
|---|---|
| **Novelty** | Is it meaningfully different from the first obvious POD solution? |
| **Identity resonance** | Would the intended wearer feel specifically seen or represented? |
| **Instant readability** | Is the hero idea understandable at a glance without explanation? |
| **Wearability** | Does it feel intentional on a chest rather than like a poster rectangle? |
| **Printability** | Can it remain clear, limited, and strong inside the 10 × 10 inch envelope? |
| **IP safety** | Is it original and free of unauthorized brands, characters, likenesses, or artist imitation? |

Reject any concept scoring below 3 for novelty, identity resonance, wearability, printability, or IP safety. Select the highest total; on a tie, choose the concept with the clearer silhouette and fewer elements. **Likeability is target-specific, not universal cuteness.** The winning concept should make the intended subculture say, "This is for people like me."

## Workflow Integration
When a user asks for a creative idea:
1. Run the concept through the Cliché Filter.
2. Generate 3 brief concepts using the Three Angles.
3. Score them with the Concept Selection Gate.
4. If the user asked to choose, show the 3 concise options and scores. If the user asked for autonomous creation, proceed with the highest-scoring concept without blocking.
5. Compile the 10-layer prompt using the winning concept, ensuring the Likeability Formula is applied to the composition, palette, and style layers.
