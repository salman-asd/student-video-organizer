import { redirect } from "next/navigation";

// Settings used to be one flat page mixing AI Connections and Interests
// (unrelated state and UI sharing a single scroll area). It's now split
// into separate routes, matching the existing /settings/categories and
// /settings/tags convention. This keeps old links/bookmarks to /settings
// working by sending them to the AI Connections page.
export default function SettingsPage() {
  redirect("/settings/ai");
}
