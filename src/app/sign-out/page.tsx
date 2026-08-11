/**
 * Clears the Clerk session, then returns to sign-in.
 *
 * The hook lives in a child component that is only rendered when a publishable key exists. A Clerk hook
 * needs ClerkProvider, and during the production build there is no key — so prerendering this page threw
 * "useClerk can only be used within ClerkProvider" and failed the whole image build. `force-dynamic` did
 * not save it: Next still generates the shell of a client page. Deciding here, on the server, keeps the
 * hook out of the build entirely.
 */
export const dynamic = "force-dynamic";

import SignOutClient from "./SignOutClient";

export default function SignOutPage() {
  const configured = !!(process.env.CLERK_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
  return (
    <main className="mx-auto max-w-[440px] px-6 py-16 text-sm text-muted">
      {configured ? <SignOutClient /> : "Oturum kapatma yalnizca Clerk yapilandirildiginda calisir."}
    </main>
  );
}
