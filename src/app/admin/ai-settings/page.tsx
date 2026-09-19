"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Moved to /settings/default-ai-connection — this page's actual content
 * (system AI connections + default quota management) now lives there,
 * alongside a user's other Settings sections rather than buried under
 * /admin, since it's reached from the same Settings expandable nav group
 * (only rendered for admins, same effective access as before).
 *
 * Kept as a redirect, not deleted outright, so any existing bookmark or
 * link pointing at the old /admin/ai-settings URL still lands somewhere
 * useful instead of 404ing.
 */
export default function AdminAiSettingsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/settings/default-ai-connection");
  }, [router]);
  return null;
}
