import { Link } from "react-router-dom";
import { Mail, ShieldCheck, Trash2 } from "lucide-react";
import LegalShell from "@/components/LegalShell";
import {
  ACCOUNT_DELETION_MAILTO,
  SUPPORT_EMAIL
} from "@/lib/support";

function H2({ children }) {
  return <h2 className="text-xl font-semibold pt-2">{children}</h2>;
}

export default function DeleteAccount() {
  return (
    <LegalShell title="Delete your RecompIQ account" updated="August 2026">
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 flex items-start gap-3">
        <Trash2 className="w-5 h-5 text-destructive shrink-0 mt-0.5" aria-hidden="true" />
        <p>
          Account deletion removes access to your RecompIQ account and begins deletion of the
          hosted profile, nutrition, training, habit, progress, and plan-history records described below.
        </p>
      </div>

      <H2>If you can sign in</H2>
      <ol className="list-decimal pl-5 space-y-2">
        <li>Open <strong>More</strong>, then <strong>Profile &amp; plan</strong>.</li>
        <li>Select <strong>Delete account</strong>.</li>
        <li>Review the warning and confirm deletion.</li>
      </ol>
      <p>
        This also removes progress photos stored by RecompIQ in the current browser or app
        installation. Photos stored in another installation remain on that device until its
        local app data is removed.
      </p>

      <H2>If you cannot access the app</H2>
      <p>
        Send a deletion request from the email address used for your RecompIQ account. We may
        ask you to verify ownership before completing the request. Do not send your password,
        verification code, photos, or health records.
      </p>
      <a
        href={ACCOUNT_DELETION_MAILTO}
        className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-destructive px-5 py-3 font-medium text-destructive-foreground hover:opacity-90"
      >
        <Mail className="w-4 h-4" aria-hidden="true" /> Request deletion by email
      </a>
      <p className="text-muted-foreground">
        Requests are handled at <a className="text-teal underline underline-offset-2" href={ACCOUNT_DELETION_MAILTO}>{SUPPORT_EMAIL}</a>.
      </p>
      <p>
        We acknowledge requests promptly, normally complete verified requests within 30 days,
        and email you when the request is complete. If a legal, security, fraud-prevention, or
        provider-backup exception applies, our reply will explain what is retained and the
        applicable retention period.
      </p>

      <H2>Retention after deletion</H2>
      <div className="flex items-start gap-2">
        <ShieldCheck className="w-4 h-4 text-teal shrink-0 mt-0.5" aria-hidden="true" />
        <p>
          Hosted account records are removed through the deletion workflow. Operational copies of
          AI requests and responses—including Coach messages, relevant account context, generated
          replies, and files submitted for optional AI analysis—may remain temporarily in provider
          backups or security logs under the provider&apos;s limited retention process. Support will
          identify any retention that applies to your request and its applicable period; retained
          data is not used to continue providing a deleted account.
        </p>
      </div>

      <p>
        For more detail, read the <Link className="text-teal underline underline-offset-2" to="/privacy">Privacy Policy</Link> or visit <Link className="text-teal underline underline-offset-2" to="/support">Support</Link>.
      </p>
    </LegalShell>
  );
}
