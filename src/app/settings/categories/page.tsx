import { RequireAuth } from "@/components/auth/RequireAuth";
import { TaxonomySettings } from "@/components/settings/TaxonomySettings";

export default function CategoriesSettingsPage() {
  return <RequireAuth><TaxonomySettings mode="categories" /></RequireAuth>;
}