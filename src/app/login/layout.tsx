import Link from "next/link";

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <div className="login-with-demo">{children}<nav className="login-demo-entry" aria-label="Demo access"><Link className="btn" href="/demo"><span aria-hidden="true">▷</span>For demo</Link></nav></div>;
}
