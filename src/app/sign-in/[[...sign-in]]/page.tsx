import { SignIn } from "@clerk/nextjs";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <main className="mx-auto flex min-h-screen max-w-[440px] flex-col justify-center px-6">
      <h1 className="mb-1 text-2xl font-semibold">Klozio</h1>
      <p className="mb-6 text-sm text-muted">Mağazanı yönetmek için giriş yap.</p>
      <SignIn signUpUrl="/sign-up" fallbackRedirectUrl="/" />
    </main>
  );
}
