# Producer Agent — Spec (image-generation automation)

## Problem
Today the human content-approves a product in /plan, then a local operator generates the design,
print file and 3 mockups by hand. Wanted: content approval alone triggers production on Railway;
the reviewer either likes the result (then schedule-approves as before) or hits **Redo** to
regenerate; nothing requires the local operator.

## Flow
```
content_status='approved' AND images=0 AND design_state IS NULL
  └─ agent claims → design_state='generating'
      1. design: HF generate_image (design_model: recraft_v4_1|nano_banana_pro, design_params from DB;
         redo_note appended as a revision clause when present)
      2. print file: scripts/process_design.py  (svg mode: strip bg path + rsvg 4200 + verify;
         png mode: v2 keyer)  — FAIL → retry once → design_state='error'
      3. mockups: 3 × nano_banana_pro, ref = design job id, prompts from DB (already carry the
         placeholder-bg clause and 45/55 size clauses)
      4. optional vision QA (Opus): design text spelled right, mockups faithful — SKIPPED cleanly
         when the Anthropic account is unfunded (the human review in /plan is the real gate)
      5. attach: replace product_images (cover/hanging/model JPEG q88 + color chart rank 4),
         set products.print_file
      → design_state='ready' (visible in /plan with images)
reviewer dislikes → POST /api/plan/redo {product_id, note?} → design_state='redo' (+redo_note)
  └─ agent regenerates from scratch, replaces images on success
reviewer likes → existing schedule approval → publisher ships it (unchanged)
```

## Rules
- Never touches products whose schedule row is already `published`.
- `redo` regenerates even if images exist; old images stay until the new set attaches (no gap).
- Claim uses FOR UPDATE SKIP LOCKED; stale `generating` (>30 min) is reclaimed; 3 strikes → `error`.
- Runs in the same Railway `agent` service loop as the personalizer (sequential, HF-friendly).

## Acceptance
1. One real product content-approved → agent produces design+print+3 mockups+chart, `ready`,
   images visible via /api/images, print ≥250 DPI, verify PASS.
2. Redo with a note regenerates and replaces images.
3. recraft (SVG) and nano (PNG) paths both work in the container (librsvg present).
4. Personalizer loop unaffected.
