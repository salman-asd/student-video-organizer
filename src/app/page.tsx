"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";

export default function RootPage() {
  const { user, loading, profile, needsOnboarding } = useAuth();
  const router = useRouter();

  React.useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    router.replace(needsOnboarding || !profile ? "/onboarding" : "/dashboard");
  }, [loading, user, profile, needsOnboarding, router]);

  return null;
}
