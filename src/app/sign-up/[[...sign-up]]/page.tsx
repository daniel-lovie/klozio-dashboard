import { SignUp } from "@clerk/nextjs";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <main className="mx-auto flex min-h-screen max-w-[440px] flex-col justify-center px-6">
      <h1 className="mb-1 text-2xl font-semibold">Hesap aç</h1>
      {/* A new account has no shop, so the first stop after sign-up is the wizard. Nothing but a name
          is required there — Etsy comes later, when there is something to publish. */}
      <p className="mb-6 text-sm text-muted">
        Kaydolduktan sonra kendi mağazanı kurarsın. Etsy bağlamak zorunlu değil — yayınlamak
        istediğinde bağlarsın.
      </p>
      <SignUp signInUrl="/sign-in" fallbackRedirectUrl="/shops/new" />
    </main>
  );
}
