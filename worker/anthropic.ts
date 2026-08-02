/** Minimal Anthropic Messages client for the personalizer agent.
 *  Tool-forced JSON: we define one tool whose input schema IS the answer shape,
 *  set tool_choice to it, and read the tool_use input — no fragile text parsing. */

const API = "https://api.anthropic.com/v1/messages";
const MODEL = process.env.PERSONALIZER_MODEL || "claude-opus-5";

type Content =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "url"; url: string } | { type: "base64"; media_type: string; data: string } };

export async function forcedJson(opts: {
  system: string;
  user: Content[];
  toolName: string;
  schema: Record<string, unknown>;
  maxTokens?: number;
}): Promise<any> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set");
  const res = await fetch(API, {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: opts.maxTokens ?? 1024,
      system: opts.system,
      messages: [{ role: "user", content: opts.user }],
      tools: [{ name: opts.toolName, description: "Return the structured answer.", input_schema: opts.schema }],
      tool_choice: { type: "tool", name: opts.toolName },
    }),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`anthropic ${res.status}: ${JSON.stringify(json).slice(0, 400)}`);
  const tu = (json.content || []).find((c: any) => c.type === "tool_use");
  if (!tu) throw new Error("no tool_use block in response");
  return tu.input;
}
