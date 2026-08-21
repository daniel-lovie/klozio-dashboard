/**
 * Recovering a tool call the model wrote as text.
 *
 *   npx tsx tests/typed-tool-call.mts
 *
 * Qwen typed {"name":"ask",...} into its answer instead of calling the tool, so the operator was shown
 * raw JSON where a row of buttons belonged and the turn ended with nobody having asked anything. These
 * cases are the three shapes seen from it, plus the ones that must NOT be salvaged — a message that
 * merely quotes JSON is still a message.
 */
import { streamOllama } from "../src/lib/agent/ollama";

// The parser is not exported; exercise it the way production does, through a fake Ollama.
const TOOLS = [{ name: "ask", description: "", input_schema: {} },
               { name: "sql", description: "", input_schema: {} }];

const REAL = '{"name": "ask", "arguments": {"question": "Hangi stilde olsun?", '
           + '"options": ["engraving", "plate", "collection"], "multi": false}}';

const cases: [string, string, string | null][] = [
  ["bare object",     REAL, "ask"],
  ["json fenced",     "```json\n" + REAL + "\n```", "ask"],
  ["tool_call tags",  "<tool_call>" + REAL + "</tool_call>", "ask"],
  ["escaped quotes",  '{"name":"sql","arguments":{"query":"select \\"id\\" from products"}}', "sql"],
  ["prose quoting it","Sana su cagriyi yapardim: " + REAL + " ama once soruyorum, ne dersin?", null],
  ["unknown tool",    '{"name": "launch_missiles", "arguments": {}}', null],
  ["plain answer",    "Iki urun olusturuldu ve onaya hazir.", null],
  ["broken json",     '{"name": "ask", "arguments": {', null],
];

let pass = 0;
for (const [label, text, want] of cases) {
  const lines = [JSON.stringify({ message: { content: text } }),
                 JSON.stringify({ done: true, prompt_eval_count: 1, eval_count: 1 })].join("\n") + "\n";
  const orig = globalThis.fetch;
  globalThis.fetch = (async () => new Response(
    new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(lines)); c.close(); } }),
    { status: 200 })) as any;

  let got: string | null = null;
  try {
    for await (const ev of streamOllama([{ role: "user", content: "x" }], "sys", TOOLS)) {
      if ((ev as any).kind === "assistant") {
        const tu = (ev as any).content.find((b: any) => b.type === "tool_use");
        got = tu ? tu.name : null;
      }
    }
  } finally { globalThis.fetch = orig; }

  const ok = got === want;
  if (ok) pass++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label.padEnd(18)} -> ${got ?? "(metin olarak birakildi)"}`);
}
console.log(`\n${pass}/${cases.length} gecti`);
process.exit(pass === cases.length ? 0 : 1);
