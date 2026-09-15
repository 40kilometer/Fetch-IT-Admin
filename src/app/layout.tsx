import "./globals.css";

export const metadata = {
  title: "Fetch-It Admin",
  description: "Fetch-It administrative control panel",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
