/**
 * Deployment healthcheck. Unauthenticated on purpose, and it touches nothing.
 *
 * The healthcheck used to point at /login, which returned 200 while the shared password was the login.
 * Adding Clerk turned that page into a redirect, so the platform stopped seeing a 200 and marked a
 * perfectly healthy container as a failed deploy — the app was fine and the probe was measuring a page
 * whose job had changed. A dedicated endpoint cannot drift like that.
 *
 * It also answers the one question that is otherwise invisible from outside: which engine the chat
 * agent will actually use on the next turn. `AGENT_ENGINE=local` is a request, not a fact — the agent
 * falls back to the cloud whenever the Spark is unreachable, silently and by design, so a variable set
 * in the dashboard proves nothing. `?engine=1` asks the question the way the agent asks it. Nothing
 * here names a host or a credential.
 */
import { ollamaReady } from "@/lib/agent/ollama";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!url.searchParams.has("engine")) return Response.json({ ok: true });

  const want = (process.env.AGENT_ENGINE || "cloud").trim();
  // The same 3s budget the agent uses; a slower answer than that is a fallback in practice, so
  // reporting it as reachable would be reporting something the agent does not believe.
  const reachable = want === "local" ? await ollamaReady() : false;
  return Response.json({
    ok: true,
    chat: { requested: want, reachable, effective: want === "local" && reachable ? "local" : "cloud",
            model: process.env.LOCAL_TEXT_MODEL || "qwen3:30b-a3b" },
  });
}
