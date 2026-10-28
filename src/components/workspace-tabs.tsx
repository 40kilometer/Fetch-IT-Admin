"use client";
import { useId, useRef, useState, type ReactNode } from "react";

/** Keep panels mounted so switching tasks does not discard an unfinished form. */
export function WorkspaceTabs({ label, items, defaultValue, value, onChange }: {
  label: string;
  items: { id: string; label: string; content: ReactNode }[];
  defaultValue?: string;
  value?: string;
  onChange?: (id: string) => void;
}) {
  const prefix = useId(), buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const [selected, setSelected] = useState(defaultValue ?? items[0]?.id);
  const active = value ?? selected;
  function select(id: string) { setSelected(id); onChange?.(id); }
  return <div className="workspace-tabs">
    <div className="workspace-tab-list" role="tablist" aria-label={label}>{items.map((item, index) => <button
      type="button" role="tab" key={item.id} id={`${prefix}-${item.id}-tab`}
      aria-controls={`${prefix}-${item.id}-panel`} aria-selected={active === item.id}
      tabIndex={active === item.id ? 0 : -1} ref={element => { buttons.current[index] = element; }}
      onClick={() => select(item.id)} onKeyDown={event => {
        const next = event.key === "ArrowRight" ? (index + 1) % items.length : event.key === "ArrowLeft" ? (index + items.length - 1) % items.length : event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : -1;
        if (next < 0) return;
        event.preventDefault(); select(items[next].id); buttons.current[next]?.focus();
      }}>{item.label}</button>)}</div>
    {items.map(item => <section key={item.id} role="tabpanel" id={`${prefix}-${item.id}-panel`} aria-labelledby={`${prefix}-${item.id}-tab`} hidden={active !== item.id} tabIndex={0}>{item.content}</section>)}
  </div>;
}
