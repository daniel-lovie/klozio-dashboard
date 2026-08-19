# POD Design Factory v2 — local generation on the DGX Spark

**Branch** `dgx` · **Server** NVIDIA DGX Spark (GB10, 128 GB unified) · **App** app.klozio.io on Railway

This is the source spec adapted to what this repository actually is. Three of its open questions are
answered here from the code rather than left open, and three of its instructions conflict with rules
this shop already treats as non-negotiable. Those are resolved below, not deferred — a spec that
contradicts `CLAUDE.md` gets implemented once and reverted once.

---

## 0. What the source spec assumed, and what is true here

### Open question 2 — "app language/stack (Python assumed)"

**It is both, and the split is already load-bearing.** The app is Next.js/TypeScript on Railway; the
generation work is Python, invoked by TypeScript. `src/lib/producer.ts` spawns
`scripts/produce_product.py`, and so does the agent's `produce` tool and the operator by hand — one
implementation, three callers, with a comment in that file explaining that a second image-building path
is precisely the defect that once shipped a whole catalogue at the wrong scale.

**Consequence:** the local engines are added *inside the existing Python*, at the two functions that
already own the calls, and the TypeScript side learns only about a queue. No new generation path.

### Open question 1 — "which POD provider pins Phase 4's dimensions"

**None of them.** `CLAUDE.md` is explicit: a **manual production partner**, no POD platform
integration. We send a print-ready PNG, the product details and an Etsy shipping label; they source
the blank and ship. (Printful is installed on the Shopify store for a different, embroidery-era
reason and is not in the Etsy path.)

So Phase 4's acceptance cannot be "passes Printify upload validation". The real gate already exists
and is stricter in the way that matters:

| | |
|---|---|
| Format | transparent PNG, sRGB, 300 DPI embedded |
| Size | ~4500×5400 px is a **ceiling**, not a target |
| Real gate | **effective PPI ≥ 300 at the printed size**, measured on `getbbox()` |
| Printed size | producer prints **10 inches** max (`PRINT_INCHES` in `produce_images.py`) |

The bbox distinction is not pedantry: measuring the canvas instead of the artwork is a bug this repo
already shipped, and it reported 95 files as fine that were not.

### Open question 3 — the model bake-off

Unchanged and correct: klein vs Qwen-Image vs SDXL against ten reference Higgsfield outputs. One
addition to the rubric in §3.

---

## 1. Conflicts with existing rules — resolved

### 1.1 `wf_flux_typography.json` cannot exist as written

The spec asks for a workflow for "text-on-shirt designs". **`CLAUDE.md` non-negotiable #5: no
AI-rendered text. All type is hand-set in a commercially licensed font.** This is not a preference —
`typeset.py` exists because models return malformed glyphs, dropped characters and invented
punctuation, and a listing that promises words the shirt does not have is worse than no listing.

**Resolution:** the second workflow is `wf_subject_art.json` — a *subject* for a typographic layout,
never the words. Type is composited afterwards by `typeset.py`, as it is today.

This also deletes a risk from the source table for free: "upscaled raster text looks fuzzy" cannot
happen if the model never draws a letter. The mitigation the spec proposes (vector overlay) is what
this repo has always done.

### 1.2 A third producer would race the two that exist

`src/lib/scheduler.ts` carries a warning worth reading before adding any worker: the in-process
producer ticker is **off in production on purpose** (`ENABLE_PRODUCER=false`) because the separate
Railway `agent` service runs `worker/producer.ts`. Both claim from the same rows, so running both
means two workers racing and paying twice for one product — someone read the flag as an oversight,
turned it on, and got exactly that.

**Resolution:** the Spark worker never claims from `products`. It claims from its own
`generation_jobs` table with the same `FOR UPDATE SKIP LOCKED` pattern `claimDue()` uses, and writes
its result back as a job row that the existing producer consumes. One owner per table.

### 1.3 Provenance is a publish gate, not a log line

`CLAUDE.md` non-negotiable #4: complete provenance archive proving we authored it, **no archive → no
publish**. The spec's "record model+license per design in run log" is the right instinct but the wrong
strength. Local models make this *easier* — checkpoint name, licence, seed, steps and workflow hash
are all knowable exactly, which a hosted API never gave us.

**Resolution:** `generation_jobs` stores them as columns, and `PROVENANCE.md` generation reads from
there. A job whose licence field is empty cannot mark a product publish-ready.

---

## 2. Architecture, in this codebase's terms

```
 chat agent (Next.js, cloud)
   └── writes generation_jobs row  {kind, payload, run_at, engine_pref}
                 │
                 │  outbound poll only — no inbound port on the home network
                 ▼
 DGX Spark · tmux "factory"
   ├─ win0 comfyui   ComfyUI API on :8188
   ├─ win1 worker    scripts/factory_worker.py  ← claims one job at a time
   └─ win2 shell     nvtop / logs
                 │
   text  → Qwen3.6-35B-A3B (vLLM or Ollama, OpenAI-compatible)  ─┐
   image → ComfyUI /prompt with a versioned API-format graph     ─┤ sequential, never concurrent
   post  → upscale → rembg → 300 DPI → PNG                       ─┘
                 │
                 ▼
   writes result back to generation_jobs (+ bytes to product_images / print_file)
                 │
                 ▼
 existing pipeline unchanged: produce_images → write_listing_copy → score → schedule → publish
```

The mockup step stays exactly where it is. It is deterministic, it composites onto photographed blanks
with measured print quads, and it has no reason to move.

### The two seams

Everything below hangs off two functions that already exist:

| seam | file | today | becomes |
|---|---|---|---|
| **Image** | `scripts/batch_runner.py` → called by `produce_product.py:generate()` | Higgsfield MCP (`worker/hf.ts`) | `ImageEngine`: `local-comfyui` \| `higgsfield` |
| **Text** | `scripts/seed_minimal_batch.py:call()` | raw Anthropic HTTP | `TextEngine`: `local-qwen` \| `sonnet` |

`call()` is imported by `write_listing_copy.py` and the seeders, so one substitution reaches every
caller. That is the whole point of routing through it rather than adding a parallel path.

**A note on why local is worth doing beyond cost:** the Higgsfield MCP is interactively
authenticated. Its session expired mid-batch during the August run and stalled fourteen designs. A
local engine has no session to expire.

---

## 3. Model choice — one addition to the rubric

The bake-off stands. Add a criterion the source spec does not have, because it is the one this shop
fails on most often:

**Flatness.** Every design here is printed by DTF. The measurement already exists and is not a
matter of opinion — `eclipse_art.alpha_report()` returns the fraction of partly-transparent pixels,
and the shipped drawn files run **0.02–0.48%**, which is edge antialiasing and nothing else. A model
whose output is 15% mid-alpha after background removal has produced something the transfer cannot lay
down, however good the composition looks on screen.

Score each candidate on: prompt adherence · flatness after rembg · palette discipline · effective PPI
after upscale · licence.

Disqualified on licence, unchanged: FLUX dev variants.

---

## 4. Schema

```sql
CREATE TABLE generation_jobs (
  id            BIGSERIAL PRIMARY KEY,
  product_id    BIGINT REFERENCES products(id),
  kind          TEXT NOT NULL CHECK (kind IN ('image','text','both')),
  status        TEXT NOT NULL DEFAULT 'queued'
                CHECK (status IN ('queued','claimed','running','done','failed','cancelled')),
  payload       JSONB NOT NULL,              -- prompt, qty, niche, placement, workflow name
  run_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Which engine was ASKED for, and which actually did the work. They differ whenever a fallback
  -- fired, and that difference is the only way to know how often local is really carrying the load.
  engine_pref   TEXT,
  engine_text   TEXT,
  engine_image  TEXT,
  fallback_reason TEXT,

  -- Provenance, as columns rather than a log line: publishing depends on these.
  model         TEXT,
  model_licence TEXT,
  seed          BIGINT,
  steps         INTEGER,
  workflow_sha  TEXT,

  claimed_at    TIMESTAMPTZ,
  worker        TEXT,
  attempts      INTEGER NOT NULL DEFAULT 0,
  last_error    TEXT,
  timings       JSONB,
  result_url    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX generation_jobs_due_idx ON generation_jobs (status, run_at)
  WHERE status = 'queued';

CREATE TABLE worker_heartbeat (
  worker     TEXT PRIMARY KEY,
  beat_at    TIMESTAMPTZ NOT NULL,
  detail     JSONB
);
```

Claiming uses the same shape as `claimDue()` in `publish.ts`, including the stale-lock release —
a worker that dies holding a claim must not park a job forever.

---

## 5. Feature flag and fallback

`LOCAL_ENGINE` ∈ `off` → `internal` → `percent:N` → `default_on`. `off` is the kill switch and needs
no deploy.

Fallback is **per stage, independently** — a Qwen hiccup must not push the image to Higgsfield:

| stage | trigger | action |
|---|---|---|
| text | error, or > 90 s | retry once → `sonnet` |
| image | error, > 10 min, or heartbeat older than 5 min | → `higgsfield` |

Both tagged in `engine_text` / `engine_image` / `fallback_reason`. **The cloud path is never deleted.**

### The quality gate is the shop's own, not a new one

Before `default_on`, twenty generations A/B. Local output must clear the gates that already exist,
which is a higher bar than "looks fine":

- `seo_score ≥ 85` for text (`score_listings.py`)
- effective PPI ≥ 300 at the print size, measured on the bbox
- mid-alpha fraction < 2%
- the visual IP check: no logos, brand marks, characters, team marks, celebrity likenesses

---

## 6. Phases, with acceptance criteria that are measurable here

| # | phase | days | acceptance |
|---|---|---|---|
| 0 | SSH, tunnels, tmux | 0.5 | `dgxf` reattaches after a lid close with panes intact; `localhost:8188` reachable |
| 1 | ComfyUI, Spark-patched | 1 | SDXL 1024² < 60 s, no OOM, no duplicated model memory in `nvidia-smi` |
| 2 | Workflows as code | 1 | `wf_graphic.json` + `wf_subject_art.json` versioned; prompt patched via JSON without touching the UI |
| 3 | Queue + engine abstraction | 3–4 | AC1–AC4 below |
| 4 | Print-ready postprocess | 1 | 3 samples pass the §5 gates; no upscale artefacts at 100% |
| 5 | Daily ops | 0.5 | fresh boot → one command → batch delivered |
| 6 | Shop-style LoRA (v2) | — | blind A/B recognisably "the shop's style" |

**Phase 3 acceptance, restated against this app:**

- **AC1** flag `internal`: "5 anime tees, schedule Friday" runs end to end; job row reads
  `local-qwen` + `local-comfyui`; the products reach `schedule` as `pending`
- **AC2** kill Ollama mid-run: same flow completes, `engine_text=sonnet`, image still local
- **AC3** Spark unplugged: completes fully on cloud engines, unchanged except speed
- **AC4** flag `off`: byte-identical behaviour to today; no inbound ports open

**A fifth, from this repo's own history:** the publish path must still refuse anything the local
engine produced badly. Inventory and images are verified against Etsy after activation, and the
hourly guard sweeps live listings — neither may be weakened to let local output through.

---

## 7. Risks — the source table, plus what this codebase has already been bitten by

| risk | mitigation |
|---|---|
| Home device serving a production app | outbound-poll worker, heartbeat + cloud fallback, UPS |
| ComfyUI double-memory caps usable RAM | Spark patches in Phase 1 |
| Licence contamination | Apache/community checkpoints only; licence is a **column**, and empty blocks publish |
| SSH drops kill long runs | everything in tmux on the Spark; the MacBook is a viewer |
| **A third producer racing the two that exist** | separate table, one owner, `SKIP LOCKED` (§1.2) |
| **Silent success** — a write that returns 200 and changes nothing | read back and verify. This shipped 16 listings with no sizes and one with 1 of 8 photos; the same rule applies to every job stage |
| **Measuring the wrong side** | verify on the destination, never on our own table. The image bug asked our database whether photos existed |

---

## 8. Order of work

Phases 0 and the app half of 3 need no Spark and land first: schema, engine abstraction, feature flag
defaulted `off`, worker skeleton. Everything stays inert until `LOCAL_ENGINE` moves off `off`, so it
can ship to production without changing a single behaviour.
