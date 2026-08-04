import { redirect } from "next/navigation";
import { isLoggedIn } from "@/lib/auth";
import AgentChat from "@/components/AgentChat";

export default async function ChatPage() {
  if (!(await isLoggedIn())) redirect("/login");
  return (
    <main className="mx-auto max-w-[900px] px-6 py-6">
      <h1 className="mb-2 text-2xl font-semibold">Agent</h1>
      <AgentChat />
    </main>
  );
}
