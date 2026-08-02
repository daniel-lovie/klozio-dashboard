/** Personalizer agent worker — see docs/personalizer-spec.md.
 *
 *  Modes:
 *    loop            poll forever (Railway `agent` service entrypoint)
 *    once            process at most one pending order, then exit
 *    interpret-test  run the acceptance harness against the live model (no DB writes)
 */
import pg from "pg";
import { spawnSync } from "child_process";
import { writeFileSync, readFileSync, unlinkSync } from "fs";
import { forcedJson } from "../worker/anthropic.ts";
import { uploadPng, generateSwap } from "../worker/hf.ts";
import {
  INTERPRET_SCHEMA, INTERPRET_SYSTEM, buildInterpretUser,
  DETECT_SCHEMA, DETECT_SYSTEM, buildSwapPrompt, QA_SCHEMA, QA_SYSTEM,
} from "../worker/policy.ts";

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL not set"); process.exit(1); }
const isLocal = /localhost|127\.0\.0\.1/.test(url);
const pool = new pg.Pool({ connectionString: url, ssl: isLocal ? undefined : { rejectUnauthorized: false }, max: 3 });

const q = async (sql: string, params: any[] = []) => (await pool.query(sql, params)).rows;

async function log(orderId: number, stage: string, detail: any) {
  await q(`UPDATE fulfillment_orders SET agent_log = agent_log || $2::jsonb WHERE id=$1`,
    [orderId, JSON.stringify([{ t: new Date().toISOString(), stage, detail }])]);
  console.log(`[order ${orderId}] ${stage}:`, typeof detail === "string" ? detail.slice(0, 200) : JSON.stringify(detail).slice(0, 200));
}

async function claimOne(): Promise<any | null> {
  const rows = await q(`
    UPDATE fulfillment_orders f SET agent_state='interpreting', status='generating',
           agent_claimed_at=now()
    WHERE f.id = (
      SELECT id FROM fulfillment_orders
      WHERE personalization IS NOT NULL AND btrim(personalization) <> ''
        AND (
          (status='new' AND agent_state IS NULL)
          OR (agent_state IN ('interpreting','rendering') AND agent_claimed_at < now() - interval '15 minutes')
        )
        AND agent_attempts < 3
      ORDER BY ordered_at LIMIT 1 FOR UPDATE SKIP LOCKED)
    RETURNING f.*`);
  return rows[0] ?? null;
}

async function toProblem(o: any, reason: string, buyerReply: string | null, state: string) {
  const note = buyerReply ? `${reason}\n--- suggested buyer reply ---\n${buyerReply}` : reason;
  await q(`UPDATE fulfillment_orders SET status='problem', agent_state=$2, note=$3 WHERE id=$1`, [o.id, state, note.slice(0, 1900)]);
  await log(o.id, "terminal", { state, reason });
}

async function processOrder(o: any): Promise<void> {
  const p = (await q(`SELECT id, slug, title, print_file, print_file_name, personalization_placeholder
                      FROM products WHERE id=$1`, [o.product_id]))[0];
  if (!p) return toProblem(o, "product row missing", null, "error");
  if (!p.print_file) return toProblem(o, "product has no base print file", null, "error");

  // 1 — interpret
  let verdict: any;
  try {
    verdict = await forcedJson({
      system: INTERPRET_SYSTEM,
      user: buildInterpretUser({
        personalization: o.personalization, productTitle: p.title,
        placeholder: p.personalization_placeholder, charMax: 24,
      }),
      toolName: "personalization_verdict", schema: INTERPRET_SCHEMA as any,
    });
  } catch (e: any) {
    await q(`UPDATE fulfillment_orders SET agent_attempts=agent_attempts+1, agent_state=NULL, status='new' WHERE id=$1`, [o.id]);
    return log(o.id, "interpret-error", String(e).slice(0, 300));
  }
  await log(o.id, "interpret", verdict);
  if (verdict.decision !== "print") {
    return toProblem(o, `agent ${verdict.decision}: ${verdict.reason}`, verdict.buyer_reply || null, "needs_human");
  }
  const newText: string = String(verdict.text_to_print || "").trim();
  if (!newText) return toProblem(o, "agent returned print with empty text", null, "needs_human");
  await q(`UPDATE fulfillment_orders SET interpreted_text=$2, agent_state='rendering' WHERE id=$1`, [o.id, newText]);

  // 2 — placeholder: registry, else vision-detect on the base print
  const base: Buffer = p.print_file as Buffer;
  const baseB64 = base.toString("base64");
  let placeholder = p.personalization_placeholder as string | null;
  let lettering: string | null = null;
  try {
    const det = await forcedJson({
      system: DETECT_SYSTEM,
      user: [
        { type: "image", source: { type: "base64", media_type: "image/png", data: baseB64 } },
        { type: "text", text: placeholder ? `The registry says the token is "${placeholder}". Confirm/correct it verbatim and describe its lettering.` : "Identify the personalizable token and describe its lettering." },
      ],
      toolName: "placeholder_report", schema: DETECT_SCHEMA as any,
    });
    placeholder = det.placeholder_text || placeholder;
    lettering = det.lettering_notes || null;
    await log(o.id, "detect", det);
  } catch (e: any) {
    if (!placeholder) return toProblem(o, "cannot identify design's text token: " + String(e).slice(0, 150), null, "error");
  }

  // 3 — generate swap on Higgsfield, chroma-process, vision-QA; up to 2 retries with feedback
  let feedback = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const mediaId = await uploadPng(base, `${p.slug}-base.png`);
      const prompt = buildSwapPrompt({ placeholder: placeholder!, newText, letteringNotes: lettering }) +
        (feedback ? ` IMPORTANT correction from the previous attempt: ${feedback}` : "");
      const rawUrl = await generateSwap(mediaId, prompt);
      await log(o.id, "generated", { attempt, rawUrl });
      const png = Buffer.from(await (await fetch(rawUrl)).arrayBuffer());
      const tin = `/tmp/order-${o.id}-raw.png`, tout = `/tmp/order-${o.id}-print.png`;
      writeFileSync(tin, png);
      const proc = spawnSync("python3", [new URL("./process_order_print.py", import.meta.url).pathname, tin, tout], { encoding: "utf8" });
      if (proc.status !== 0) throw new Error("chroma processing failed: " + (proc.stdout + proc.stderr).slice(0, 200));
      const finalPng = readFileSync(tout);
      unlinkSync(tin); unlinkSync(tout);
      const qa = await forcedJson({
        system: QA_SYSTEM,
        user: [
          { type: "text", text: `Requested replacement: the token "${placeholder}" must now read "${newText}".\nORIGINAL design:` },
          { type: "image", source: { type: "base64", media_type: "image/png", data: baseB64 } },
          { type: "text", text: "REGENERATED design:" },
          { type: "image", source: { type: "base64", media_type: "image/png", data: finalPng.toString("base64") } },
        ],
        toolName: "qa_verdict", schema: QA_SCHEMA as any,
      });
      await log(o.id, "qa", { attempt, ...qa });
      if (qa.text_correct && qa.design_preserved) {
        await q(`UPDATE fulfillment_orders SET order_print_file=$2, status='qa', agent_state='done', note=$3 WHERE id=$1`,
          [o.id, finalPng, `agent: printed text "${newText}" (${placeholder} -> ${newText}). Review the print, then mark QA passed.`]);
        return log(o.id, "done", { text: newText, bytes: finalPng.length });
      }
      feedback = qa.problems || "text or design mismatch";
    } catch (e: any) {
      feedback = String(e).slice(0, 200);
      await log(o.id, "render-error", feedback);
      if (/re-auth|refresh failed/i.test(feedback)) {
        return toProblem(o, "Higgsfield auth expired — reseed hf_tokens", null, "error");
      }
    }
  }
  await q(`UPDATE fulfillment_orders SET agent_attempts=agent_attempts+1 WHERE id=$1`, [o.id]);
  return toProblem(o, `render failed after retries: ${feedback}`, null, "error");
}

async function tick(): Promise<boolean> {
  const o = await claimOne();
  if (!o) return false;
  await log(o.id, "claimed", { personalization: o.personalization });
  await processOrder(o).catch(async (e) => toProblem(o, "unhandled: " + String(e).slice(0, 200), null, "error"));
  return true;
}

async function interpretTest() {
  const cases: Array<[string, string]> = [
    ["can we write alan?", "print"],
    [".", "reject"],
    ["1111", "reject"],
    ["Mrs. Rodriguez room 12", "print"],
    ["either Emma or maybe Emily, idk", "clarify"],
    ["name: JOHNSON FAMILY", "print"],
  ];
  let pass = 0;
  for (const [input, expected] of cases) {
    const v = await forcedJson({
      system: INTERPRET_SYSTEM,
      user: buildInterpretUser({ personalization: input, productTitle: "Custom Team Teacher Shirt, Personalized Teacher Name Tee", placeholder: 'name token "MS. CARTER"', charMax: 24 }),
      toolName: "personalization_verdict", schema: INTERPRET_SCHEMA as any,
    });
    const ok = v.decision === expected;
    pass += ok ? 1 : 0;
    console.log(`${ok ? "PASS" : "FAIL"} [${input}] -> ${v.decision} "${v.text_to_print}" (${v.reason})`);
  }
  console.log(`${pass}/${cases.length} passed`);
  process.exit(pass === cases.length ? 0 : 1);
}

const mode = process.argv[2] || "loop";
if (mode === "interpret-test") await interpretTest();
else if (mode === "once") { await tick(); await pool.end(); }
else {
  console.log("[personalizer] loop started, poll 60s, model", process.env.PERSONALIZER_MODEL || "claude-opus-5");
  while (true) {
    try { while (await tick()) { /* drain queue */ } }
    catch (e) { console.error("[personalizer] tick failed:", e); }
    await new Promise((r) => setTimeout(r, 60_000));
  }
}
