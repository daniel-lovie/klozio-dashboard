import { clerkConfigured } from "@/lib/user";
import PasswordLogin from "./PasswordLogin";
import LoginHandoff from "./LoginHandoff";

/**
 * /login predates Clerk and is still linked from bookmarks and the old sign-out flow.
 *
 * It hands over to Clerk on the CLIENT rather than with a server redirect, and that is not a style
 * choice: the deployment healthcheck probes this path, and a 307 made the platform mark a healthy
 * container as a failed deploy — the app was fine and the probe was reading a page whose job had
 * changed. Returning 200 keeps the probe honest while the visitor still lands on the sign-in screen.
 */
export default function Login() {
  if (clerkConfigured()) return <LoginHandoff />;
  return <PasswordLogin />;
}
