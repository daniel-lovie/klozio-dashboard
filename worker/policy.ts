/** Personalizer policy: interpretation rules, the design-preserving swap prompt
 *  (distilled from the ai-design skill's preservation recipe), and vision QA. */

export const INTERPRET_SCHEMA = {
  type: "object",
  properties: {
    decision: { type: "string", enum: ["print", "clarify", "reject"] },
    text_to_print: { type: "string", description: "Exact glyphs to render. Empty unless decision=print." },
    reason: { type: "string", description: "One sentence, for the operator." },
    buyer_reply: { type: "string", description: "Ready-to-send English Etsy message. Empty unless clarify/reject." },
  },
  required: ["decision", "text_to_print", "reason", "buyer_reply"],
} as const;

export const INTERPRET_SYSTEM = `You interpret Etsy personalization requests for a t-shirt shop.
The buyer typed free text into a personalization box. Decide what EXACTLY should be printed.

Rules:
- Strip meta-language: "can we write alan?" / "please put Alan" / "name: Alan" all mean the text is "Alan".
- Names get natural capitalization ("alan" -> "Alan", "mrs. rodriguez" -> "Mrs. Rodriguez"); the design
  itself may render all-caps — that is handled downstream, output natural casing.
- Multiple names/segments the design supports (e.g. "Emma, Noah & Mia") are fine — keep buyer's order.
- decision=clarify when: two alternative texts offered ("Emma or maybe Emily"), a question you cannot
  resolve, text longer than 24 characters per name slot, requests to change colors/design/layout
  (we only swap text), or photo requests.
- decision=reject when: punctuation-only ("."), repeated digits ("1111"), emoji-only, empty/whitespace,
  gibberish with no printable intent, or hate/harassment content.
- buyer_reply: warm, short, professional. For clarify: ask the specific question. For reject: explain
  we need the exact text they want printed and give a one-line example.
- NEVER invent text the buyer did not indicate. When unsure between print and clarify, pick clarify.`;

export function buildInterpretUser(opts: {
  personalization: string;
  productTitle: string;
  placeholder: string | null;
  charMax: number;
}) {
  return [
    {
      type: "text" as const,
      text:
        `Product: ${opts.productTitle}\n` +
        `Design's personalizable token: ${opts.placeholder ?? "(unknown — a single name/text slot)"}\n` +
        `Max characters that fit: ${opts.charMax}\n` +
        `Buyer's personalization box content:\n"""${opts.personalization}"""`,
    },
  ];
}

export const DETECT_SCHEMA = {
  type: "object",
  properties: {
    placeholder_text: { type: "string", description: "The exact text in the artwork that is the personalization slot (verbatim, keep case)." },
    lettering_notes: { type: "string", description: "Short description of that text's lettering: case, color, outline, arc/straight, position." },
  },
  required: ["placeholder_text", "lettering_notes"],
} as const;

export const DETECT_SYSTEM = `You are looking at a t-shirt print design that contains a personalizable
text token (a sample name or class/room text that gets replaced per order). Identify it verbatim and
describe its lettering so a generator can re-render it with different text in the identical style.`;

/** The preservation-swap prompt. Recipe: assert EXACT reproduction, name the single change,
 *  pin lettering style, forbid everything else, solid green bg for chroma keying. */
export function buildSwapPrompt(opts: {
  placeholder: string;
  newText: string;
  letteringNotes: string | null;
}) {
  return (
    `Reproduce the supplied t-shirt print artwork EXACTLY — identical composition, illustration, ` +
    `colours, textures, outlines and lettering styles — with ONE single change: the text ` +
    `"${opts.placeholder}" is replaced by "${opts.newText}". Render the replacement text in the ` +
    `IDENTICAL lettering as the original token${opts.letteringNotes ? ` (${opts.letteringNotes})` : ""}: ` +
    `same font style, same fill colour, same outline, same size logic, same curvature and position, ` +
    `letter-spacing adjusted naturally so "${opts.newText}" sits balanced in the same spot. ` +
    `If the original token is upper-case, render the new text upper-case. ` +
    `Do NOT change, add, remove or restyle ANY other element or text of the artwork. ` +
    `Place the artwork isolated on a plain solid uniform deep pine green background with no shadow ` +
    `and no vignette; the background colour must not appear inside the artwork. ` +
    `Exclusions: no t-shirt, no mockup, no fabric, no watermark, no extra text, no style drift.`
  );
}

export const QA_SCHEMA = {
  type: "object",
  properties: {
    text_correct: { type: "boolean", description: "New image shows EXACTLY the requested text (spelling, no duplication, old token gone)." },
    design_preserved: { type: "boolean", description: "Everything except the swapped token matches the original design." },
    problems: { type: "string", description: "Empty if both true; else what is wrong, specific." },
  },
  required: ["text_correct", "design_preserved", "problems"],
} as const;

export const QA_SYSTEM = `You compare an ORIGINAL t-shirt print design with a REGENERATED version whose
only intended difference is a personalization text swap. Verify (1) the regenerated image contains
exactly the requested replacement text — correct spelling, rendered once, old token fully gone — and
(2) every other element (illustration, other text lines, colours, layout) is preserved. Be strict:
misspellings, duplicated words, missing design elements, or style drift are failures.`;
