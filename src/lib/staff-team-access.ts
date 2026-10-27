import { notFound } from "next/navigation";
import { requireStaffPage } from "./staff-access";
import { teamBySlug } from "./staff-teams";

export async function requireTeamPage(slug: string, management = false) {
  const team = teamBySlug(slug);
  if (!team) notFound();
  const staff = await requireStaffPage(management ? "operations" : team.permission);
  return { staff, team };
}
