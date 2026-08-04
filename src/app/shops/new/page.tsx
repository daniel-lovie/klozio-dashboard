import { redirect } from "next/navigation";
import { isLoggedIn } from "@/lib/auth";
import ShopWizard from "@/components/ShopWizard";

export default async function NewShopPage() {
  if (!(await isLoggedIn())) redirect("/login");
  return (
    <main className="mx-auto max-w-[720px] px-6 py-8">
      <h1 className="mb-1 text-2xl font-semibold">Yeni Mağaza</h1>
      <p className="mb-6 text-sm text-muted">
        Mağazayı oluştur, sonra kanalları bağla. Her adım opsiyonel — sonradan tamamlanabilir.
      </p>
      <ShopWizard />
    </main>
  );
}
