const paths: Record<string, string> = {
  overview: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  bookings: "M7 3h10v4H7z M7 5H4v16h16V5h-3 M8 12h8 M8 16h5",
  riders: "M4 16h16 M7 16l3-8h5l3 8 M10 8V5h4 M4 16a2 2 0 1 0 0 .1 M20 16a2 2 0 1 0 0 .1",
  users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M16 3a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-3.87 M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  support: "M4 14V11a8 8 0 0 1 16 0v3 M4 12H2v6h4v-6z M20 12h2v6h-4v-6z M20 18c0 3-3 3-6 3",
  reports: "M4 3v18h17 M8 16v-4 M13 16V8 M18 16V5",
  audit: "M21 12a9 9 0 1 1-3-6.7 M21 3v6h-6 M12 7v5l3 2",
  workspace: "M3 7h18v14H3z M8 7V3h8v4 M3 12h18 M10 12v3h4v-3",
  finance: "M3 5h18v14H3z M3 9h18 M7 15h3 M15 15h2",
  lookup: "M21 21l-5-5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  team: "M9 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0 M21 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0 M1 21v-4a5 5 0 0 1 10 0v4 M13 21v-4a5 5 0 0 1 10 0v4",
  cases: "M8 4h8v4H8z M8 6H4v15h16V6h-4 M8 12h8 M8 16h5",
  resources: "M3 4h7c1 0 2 1 2 2 0-1 1-2 2-2h7v16h-7c-1 0-2 1-2 2 0-1-1-2-2-2H3z M12 6v16",
  account: "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M4 21v-2a8 8 0 0 1 16 0v2",
  menu: "M4 6h16 M4 12h16 M4 18h16",
  refresh: "M20 8a8 8 0 1 0 0 8 M20 3v6h-6",
};
export function AdminIcon({ name }: { name: string }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] ?? paths.overview} /></svg>;
}
