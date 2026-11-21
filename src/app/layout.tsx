import "./globals.css";
import '@/components/admin-workspace.css';

export const metadata = {
  title: "Fetch Staff Portal",
  description: "Fetch support, finance, safety, and operations",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
