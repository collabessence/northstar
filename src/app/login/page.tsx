import { login } from "./actions";
import { gateEnabled } from "@/lib/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  // Nothing to log into if no password is configured — bounce straight in.
  if (!gateEnabled()) redirect("/");

  const params = await searchParams;
  const next = params.next && params.next.startsWith("/") ? params.next : "/";
  const hasError = params.error === "1";

  return (
    <div className="grid min-h-screen place-items-center bg-[#f5f6f7] p-4">
      <div className="w-full max-w-[400px] overflow-hidden rounded-[22px] border border-[#e6e8eb] bg-white p-7 shadow-[0_18px_50px_rgba(30,36,40,0.08)]">
        <div className="flex items-center gap-3">
          <span className="brand-mark"><span /><span /><span /></span>
          <span className="text-[19px] font-bold tracking-[-0.04em]">Northstar</span>
        </div>
        <h1 className="mt-6 text-xl font-bold tracking-[-0.03em] text-[#202529]">This workspace is private</h1>
        <p className="mt-1.5 text-sm text-[#7a8187]">Enter the password to continue.</p>

        <form action={login} className="mt-6">
          <input type="hidden" name="next" value={next} />
          <label className="field">
            <span>Password</span>
            <input type="password" name="password" required autoFocus placeholder="••••••••" />
          </label>
          {hasError && (
            <p className="mt-3 rounded-xl bg-[#fff0ec] px-3 py-2.5 text-xs font-semibold text-[#aa4c3c]">
              That password isn&apos;t right. Try again.
            </p>
          )}
          <button type="submit" className="primary-button mt-5 w-full justify-center">
            Enter
          </button>
        </form>
      </div>
    </div>
  );
}
