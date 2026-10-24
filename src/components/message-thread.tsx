"use client";
import { useEffect, useRef } from "react";
export function MessageThread({ children, latest, pageKey, label }: { children: React.ReactNode; latest: boolean; pageKey: string; label: string }) {
  const region = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (latest && region.current) region.current.scrollTop = region.current.scrollHeight;
  }, [latest, pageKey]);
  return <div ref={region} className="message-thread" role="region" aria-label={label} tabIndex={0}>{children}</div>;
}
