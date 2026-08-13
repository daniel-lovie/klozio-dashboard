import { SignUp } from "@clerk/nextjs";
import { AuthFrame } from "@/components/AuthFrame";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <AuthFrame
      title="Klozio'ya başla"
      subtitle="Etsy ve Shopify mağazanı bağla, tasarımdan siparişe kadar tek yerden yönet."
    >
      <SignUp signInUrl="/sign-in" fallbackRedirectUrl="/" />
    </AuthFrame>
  );
}
