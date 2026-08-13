import { SignIn } from "@clerk/nextjs";
import { AuthFrame } from "@/components/AuthFrame";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <AuthFrame
      title="Tekrar hoş geldin"
      subtitle="Mağazanın takvimi, katalog sağlığı ve siparişleri seni bekliyor."
    >
      <SignIn signUpUrl="/sign-up" fallbackRedirectUrl="/" />
    </AuthFrame>
  );
}
