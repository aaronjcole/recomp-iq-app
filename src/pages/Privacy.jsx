import LegalShell from "@/components/LegalShell";
import { Link } from "react-router-dom";
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from "@/lib/support";

function H2({ children }) {
  return <h2 className="text-xl font-semibold pt-2">{children}</h2>;
}

export default function Privacy() {
  return (
    <LegalShell title="Privacy Policy" updated="August 2026">
      <H2>1. What we collect</H2>
      <p>
        When you create an account and complete onboarding, you provide profile details: age, sex,
        height, current and goal weight, goal, training and cardio days, job activity, average steps,
        and experience level. As you use the app, we store your daily logs (weight, calories, macros,
        steps, sleep, mood, waist), habits, exercise sessions, strength logs, weekly check-ins, and
        decision history. Photos added to your progress timeline are stored locally on your device
        and are not uploaded. If you choose a food-photo or body-composition scan, that photo is
        uploaded to private storage and shared with our AI inference provider through a temporary
        signed link for analysis.
      </p>
      <p>
        If you join the Android beta, we store your email and may store sanitized campaign labels
        from the link you used, plus whether you opened the landing-page explainer before signup.
        These details are captured only when you submit the form and help us compare launch
        messages. The landing page does not use advertising cookies or cross-site identifiers.
      </p>
      <p>
        When you use AI Coach, your message, recent conversation, and relevant RecompIQ profile,
        plan, safety-flag, nutrition, activity, and progress context are processed by an
        authenticated Base44 backend and its configured AI inference provider to generate a reply.
        If you report a reply, we store its bounded message identifier, report category, any
        optional reason you submit, and a bounded copy of the reported AI reply. The reply copy
        may include health-related numbers that the AI repeated from your account context, such as
        calorie or weight information.
      </p>

      <H2>2. How we use it</H2>
      <p>
        We use your data to compute your adaptive nutrition and training targets, calculate your
        Recomp Signal and trends, generate weekly check-in summaries and AI coach guidance, and
        display your progress. Reported AI replies are used to investigate safety, quality, and
        policy concerns. Waitlist campaign labels are used only to understand which launch sources
        produce completed signups. We do not sell your data.
      </p>

      <H2>3. Storage &amp; retention</H2>
      <p>
        Your account records are stored in our hosted database and encrypted in transit. We retain
        them while your account is active. Deleting your account removes those hosted records and
        progress photos stored by RecompIQ in the current browser or app installation. Operational
        copies of AI requests and responses—including Coach messages, relevant account context,
        generated replies, and files submitted for optional AI analysis—may remain temporarily in
        provider backups or security logs under the provider&apos;s limited retention process. Support
        will identify any retention that applies to a deletion request and its applicable period;
        retained data is not used to continue providing a deleted account. We normally complete verified
        deletion requests within 30 days and notify the requester when complete or when a disclosed
        legal, security, fraud-prevention, or provider-backup exception applies. AI response reports
        are retained while your account is active and are included in this account-deletion process
        and timeline, subject to the same disclosed exceptions.
      </p>

      <H2>4. Sharing</H2>
      <p>
        We share data only with service providers that help us operate (e.g., hosting, AI inference)
        under appropriate confidentiality obligations, or when required by law. Aggregated,
        de-identified analytics may be used to improve the product.
      </p>

      <H2>5. Your rights &amp; choices</H2>
      <p>
        You can review and update your profile and preferences at any time and delete your account.
        If you cannot access the app, use our public{" "}
        <Link className="text-teal underline underline-offset-2 font-medium" to="/delete-account">
          account deletion workflow
        </Link>
        {" "}to request deletion from the email address associated with your account.
      </p>

      <H2>6. Children</H2>
      <p>RecompIQ is not intended for anyone under 18.</p>

      <H2>7. Security</H2>
      <p>We use reasonable technical and organizational measures to protect your data, but no system is perfectly secure.</p>

      <H2>8. Changes</H2>
      <p>We may update this policy; material changes will be surfaced in the app.</p>

      <H2>9. Contact</H2>
      <p>
        Questions about privacy or support? Email{" "}
        <a className="text-teal underline underline-offset-2" href={SUPPORT_MAILTO}>
          {SUPPORT_EMAIL}
        </a>
        .
      </p>
      <p>
        For troubleshooting and request instructions, visit{" "}
        <Link className="text-teal underline underline-offset-2" to="/support">RecompIQ Support</Link>.
      </p>

      <H2>Health disclaimer</H2>
      <p className="text-muted-foreground">
        RecompIQ provides general fitness and nutrition information, not medical advice. RecompIQ
        is not a medical device and does not diagnose, treat, cure, or prevent any medical
        condition. Consult a qualified healthcare professional before starting any diet or
        exercise program.
      </p>
    </LegalShell>
  );
}
