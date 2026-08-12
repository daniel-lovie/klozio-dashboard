import { redirect } from "next/navigation";
import { isLoggedIn } from "@/lib/auth";
import AgentChat from "@/components/AgentChat";

export default async function ChatPage() {
  if (!(await isLoggedIn())) redirect("/login");
  return (
    <main className="mx-auto max-w-[1200px] px-3 py-4 sm:px-6 sm:py-6">
      <h1 className="mb-2 text-xl font-semibold sm:text-2xl">Agent</h1>
      <AgentChat />
    </main>
  );
}
