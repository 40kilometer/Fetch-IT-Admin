import { currentStaff, requireStaffPage } from "./staff-access";
// Existing operational routes keep their Admin-only boundary.
export const currentAdmin = () => currentStaff("operations");
export const requireAdminPage = () => requireStaffPage("operations");
