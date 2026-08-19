# Workflows as code

API-format graphs, versioned here rather than living in someone browser session. `factory_worker.py`
patches prompt, seed and steps by node title — `POSITIVE`, `NEGATIVE`, `SAMPLER` — so a graph can be
re-wired without touching the worker.

| file | checkpoint | for |
|---|---|---|
| `wf_graphic.json` | SDXL base 1.0 | illustration and graphic designs |
| `wf_subject_art.json` | Juggernaut XL v9 | the SUBJECT of a typographic layout |

## There is deliberately no typography workflow

The source spec asked for `wf_flux_typography.json`, for "text-on-shirt designs". This shop forbids
AI-rendered text outright: models return malformed glyphs, dropped characters and invented
punctuation, and a listing that promises words the shirt does not have is worse than no listing.

So `wf_subject_art.json` draws the subject and `scripts/typeset.py` sets the words afterwards, in a
vendored OFL face, as it already does for every design here. The negative prompt in both graphs lists
`text, words, letters, typography` for the same reason — the model is being told not to try.

This also removes a risk the spec carried: "upscaled raster text looks fuzzy" cannot happen when the
model never draws a letter.
