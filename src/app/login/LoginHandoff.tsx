"use client";
import { useEffect } from "react";

export default function LoginHandoff() {
  useEffect(() => { window.location.replace("/sign-in"); }, []);
  return (
    <main className="mx-auto max-w-[440px] px-6 py-16 text-sm text-muted">
      Giriş ekranına yönlendiriliyorsun… <a className="underline" href="/sign-in">devam et</a>
    </main>
  );
}
