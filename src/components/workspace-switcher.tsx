"use client";

import { Check, ChevronDown } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const workspaces = [
  { key: "sales", label: "Sales CRM", href: "/" },
  { key: "recruitment", label: "Recruiting CRM", href: "/recruitment" },
] as const;

export function WorkspaceSwitcher({ current }: { current: "sales" | "recruitment" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(event: MouseEvent) {
      if (open && ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  const active = workspaces.find((workspace) => workspace.key === current) ?? workspaces[0];

  return (
    <div ref={ref} className="relative mb-1">
      <button
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between rounded-xl border border-[#e6e8eb] bg-[#fafafa] px-3 py-2 text-xs font-bold text-[#454c51] transition hover:bg-[#f2f3f3]"
      >
        {active.label}
        <ChevronDown size={13} className={`transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-11 z-50 overflow-hidden rounded-xl border border-[#e6e8eb] bg-white p-1 shadow-[0_14px_36px_rgba(30,36,40,0.14)] animate-pop-in">
          {workspaces.map((workspace) => (
            <Link
              key={workspace.key}
              href={workspace.href}
              className={`flex items-center justify-between rounded-lg px-2.5 py-2 text-xs font-semibold transition ${
                workspace.key === current ? "bg-[#eef6f2] text-[#17785a]" : "text-[#626a70] hover:bg-[#f5f6f7]"
              }`}
            >
              {workspace.label}
              {workspace.key === current && <Check size={13} />}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
