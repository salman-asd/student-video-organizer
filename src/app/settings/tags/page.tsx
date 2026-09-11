import { RequireAdmin } from "@/components/auth/RequireAuth";
import { TaxonomySettings } from "@/components/settings/TaxonomySettings";

export default function TagsSettingsPage() {
  return <RequireAdmin><TaxonomySettings mode="tags" /></RequireAdmin>;
}