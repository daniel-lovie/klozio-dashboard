<!-- URETILMIS DOSYA — ELLE DUZENLEME. Kaynak: .claude/skills/tshirt-design-prompt-engineer/references/quality-rubric.md
     Guncellemek icin: python3 scripts/sync_agent_knowledge.py -->

# Quality Rubric and Validation Gate

Use this 100-point rubric to evaluate generated t-shirt artwork candidates. A candidate must score **≥ 85** and have **NO fatal failures** to be considered ready for production preparation.

## Fatal Failures (Instant Reject)
If any of these are true, the generation fails immediately. Do not proceed to scoring; diagnose the failure and refine the prompt.
- [ ] **Wrong literal text:** Misspelled words, duplicated letters, or missing words from the requested typography contract.
- [ ] **IP Violation:** Contains recognizable unauthorized brands, copyrighted characters, celebrity likenesses, or exact imitations of living artists.
- [ ] **Format Failure:** The design is rendered on clothing, a person, paper, a wall, or within a scene instead of appearing as an isolated flat print graphic.
- [ ] **Cropped Subject:** The primary subject touches the edge of the canvas and is cut off.
- [ ] **Fused Background:** The background contains complex scenery, floors, or gradients that cannot be cleanly separated from the subject.
- [ ] **Fake Transparency:** The model rendered a literal grey-and-white checkerboard pattern instead of a true alpha channel or uniform matte.
- [ ] **Oversized Print File:** At 300 PPI, the transparent artwork or canvas exceeds 3000 px in width or height, which exceeds the fixed 10 × 10 inch maximum.
- [ ] **Shape Distortion:** A wide, tall, organic, irregular, or asymmetrical concept was unnecessarily forced into a square, circle, badge, or border.

---

## 100-Point Scoring System

### 1. Background and Alpha Readiness (15 points)
- **15 pts:** True alpha channel OR a perfectly uniform, untextured matte color that does not appear in the artwork. Crisp edges.
- **10 pts:** Uniform matte, but requires minor cleanup (e.g., small enclosed counters are filled with matte).
- **5 pts:** Matte has slight gradients, paper texture, or soft shadows that complicate extraction.
- **0 pts:** Complex scene, floor, or fused background. (Fatal)

### 2. Concept, Creativity, and Originality (20 points)
- **20 pts:** The core concept is executed perfectly with a unique, non-cliché angle (e.g., clever juxtaposition, elevated style, or subculture depth). Subject, action, and message are clear.
- **15 pts:** Concept is present but relies on standard POD tropes (e.g., generic sunset, basic badge) or is slightly diluted by unnecessary elements.
- **5 pts:** Concept is muddled, "adjective soup" resulted in confusing elements, or it is a direct copy of a tired cliché.
- **0 pts:** Fails to depict the requested subject.

### 3. Composition and Likeability (15 points)
- **15 pts:** Highly likeable and wearable. Strong, recognizable outer contour in a natural shape (organic, irregular, arched). One clear visual anchor. Well-balanced with an even safety margin and no forced container.
- **10 pts:** Acceptable layout, but silhouette is slightly rigid (forced square/circle) or lacks a clear visual anchor.
- **5 pts:** Poor hierarchy, awkward placement of elements.
- **0 pts:** Cropped edges or arbitrary, unusable layout.

### 4. Production Readiness (15 points)
- **15 pts:** Opaque shapes, sturdy line weights. Intentional texture (halftone/distress) is bounded inside the silhouette. Fits the target print method and the maximum 10 × 10 inch envelope; at 300 PPI, both final dimensions are ≤3000 px.
- **10 pts:** Mostly printable, but contains minor fragile details or slight low-opacity areas.
- **5 pts:** Contains semi-transparent haze, mud, or isolated specks that will print poorly.
- **0 pts:** Structurally unsuitable for the intended print method.

### 5. Typography (15 points)
- **15 pts:** Exact text quoted. Excellent hierarchy, alignment, and lettering character. Integrates well with the art.
- **10 pts:** Text is correct but placement or font style is slightly mismatched with the art.
- **5 pts:** Contains tiny, unreadable filler copy or unrelated pseudo-text alongside the correct text.
- **0 pts:** Misspelled or wrong text. (Fatal)

### 6. Thumbnail Readability (10 points)
- **10 pts:** The primary concept and headline remain clearly identifiable when scaled down to ~300 pixels.
- **5 pts:** Loses some impact or legibility at small sizes.
- **0 pts:** Becomes an unrecognizable blur at thumbnail size.

### 7. Style and Palette Restraint (10 points)
- **10 pts:** Coherent visual grammar with a highly intentional palette where every colour has a job (6-12 flat evocative colours is the working range; fewer is a style choice, not a virtue). All fills flat. Colors contrast well with the intended garment color.
- **5 pts:** Style is okay, but the palette is unintentional (colours with no assigned role) or uses gradients/soft glows, or contrast is slightly weak for the target shirt.
- **0 pts:** Contradictory styles (e.g., flat vector mixed with photorealism) or colors merge with the intended garment.

### 8. Safety (0 points - Pass/Fail)
- **Pass:** Commercially safe, generic stylistic attributes used effectively.
- **Fail:** IP violation. (Fatal)

---

## Diagnostic Loop (Refinement)

If a candidate fails, identify the specific module to change based on the failure:

| Failure Mode | Change Only | Preserve Exactly |
|---|---|---|
| **Wrong concept** | Subject/action/message module | Style, composition, palette, background contract |
| **Weak or forced silhouette** | Viewpoint, crop, pose, outline, and natural aspect ratio | Subject identity, message, palette, texture |
| **Dirty background** | Matte color, edge contrast, shadow/glow exclusions | Artwork composition and internal colors |
| **Misspelled text** | Exact text block, type hierarchy, text density | Illustration, palette, overall layout |
| **Too much microdetail** | Detail budget, line weight, distress scale | Main motif, type, palette, silhouette |
| **Color failure on garment** | Ink-role assignments, knockout/outline variant | Geometry and type |
| **Unwanted scene/shirt generated** | Artifact contract and background contract | Creative concept and style grammar |
| **Oversized or square-forced output** | Final physical dimensions, generation ratio, transparent crop, and proportional scaling | Subject, typography, palette, and natural outer silhouette |
