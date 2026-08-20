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
  // Which commit is actually serving. Twice on 2026-08-19 a fix was diagnosed as not working when it
  // had simply not shipped yet: the build log's "Healthcheck succeeded" belongs to whichever build
  // wrote it last, so tailing it says nothing about the build you just pushed. Comparing this against
  // `git rev-parse HEAD` is a fact.
  // RAILWAY_GIT_COMMIT_SHA is only set for repo-triggered deploys; `railway up` ships local
  // files and leaves it empty, so the deploy script sets BUILD_SHA itself.
  const build = (process.env.BUILD_SHA || process.env.RAILWAY_GIT_COMMIT_SHA || "").slice(0, 7) || null;
  if (!url.searchParams.has("engine")) return Response.json({ ok: true, build });

  const want = (process.env.AGENT_ENGINE || "cloud").trim();
  // The same 3s budget the agent uses; a slower answer than that is a fallback in practice, so
  // reporting it as reachable would be reporting something the agent does not believe.
  const reachable = want === "local" ? await ollamaReady() : false;
  return Response.json({
    ok: true, build,
    chat: { requested: want, reachable, effective: want === "local" && reachable ? "local" : "cloud",
            // Role, not model name: the endpoint is public and unauthenticated.
            engine: want === "local" && reachable ? "local text model" : "cloud" },
  });
}
