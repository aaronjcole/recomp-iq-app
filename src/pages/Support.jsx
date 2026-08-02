import { Link } from "react-router-dom";
import { LifeBuoy, Mail, ShieldCheck } from "lucide-react";
import LegalShell from "@/components/LegalShell";
import {
  SUPPORT_EMAIL,
  SUPPORT_REQUEST_MAILTO
} from "@/lib/support";

function H2({ children }) {
  return <h2 className="text-xl font-semibold pt-2">{children}</h2>;
}

export default function Support() {
  return (
    <LegalShell title="RecompOne Support" updated="August 2026">
      <div className="rounded-xl border border-line bg-panel p-4 flex items-start gap-3">
        <LifeBuoy className="w-5 h-5 text-teal shrink-0 mt-0.5" aria-hidden="true" />
        <div className="space-y-1">
          <p className="font-medium">Contact the RecompOne support team</p>
          <p className="text-muted-foreground">
            Email us from the address associated with your account whenever the issue is
            account-specific.
          </p>
        </div>
      </div>

      <a
        href={SUPPORT_REQUEST_MAILTO}
        className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-teal px-5 py-3 font-medium text-buttonText hover:opacity-90"
      >
        <Mail className="w-4 h-4" aria-hidden="true" /> Email {SUPPORT_EMAIL}
      </a>

      <H2>What to include</H2>
      <ul className="list-disc pl-5 space-y-2">
        <li>A short description of what happened and what you expected.</li>
        <li>Your device model, Android version, and whether you were online.</li>
        <li>The approximate date and time of the problem.</li>
      </ul>
      <p className="rounded-lg bg-panel2 p-3 text-muted-foreground">
        Never email your password, verification code, progress photos, or detailed health
        records. We may ask you to verify account ownership before making account changes.
      </p>
      <p>
        We acknowledge account and privacy requests promptly, normally complete verified deletion
        requests within 30 days, and notify the requester when the work is complete or if a
        disclosed retention exception applies.
      </p>

      <H2>Account and data deletion</H2>
      <div className="flex items-start gap-2">
        <ShieldCheck className="w-4 h-4 text-teal shrink-0 mt-0.5" aria-hidden="true" />
        <p>
          You can delete a signed-in account from Profile, or use our public deletion workflow
          if you cannot access the app. <Link className="text-teal underline underline-offset-2" to="/delete-account">Open account deletion instructions</Link>.
        </p>
      </div>
    </LegalShell>
  );
}
