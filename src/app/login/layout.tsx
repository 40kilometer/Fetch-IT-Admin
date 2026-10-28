import Link from "next/link";

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <div className="login-with-demo">{children}<nav className="login-demo-entry" aria-label="Staff accounts"><Link className="btn" href="/staff">Staff accounts</Link></nav></div>;
}
