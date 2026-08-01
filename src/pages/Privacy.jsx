import LegalShell from "@/components/LegalShell";
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

      <H2>2. How we use it</H2>
      <p>
        We use your data to compute your adaptive nutrition and training targets, calculate your
        Recomp Signal and trends, generate weekly check-in summaries and AI coach guidance, and
        display your progress. We do not sell your data.
      </p>

      <H2>3. Storage &amp; retention</H2>
      <p>
        Your account records are stored in our hosted database and encrypted in transit. We retain
        them while your account is active. Deleting your account from Profile removes those records
        and the current browser's on-device progress photos. Deleting an account does not currently
        guarantee immediate deletion of files previously submitted for optional AI analysis; those
        files are handled under our hosting and AI providers' retention procedures.
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
        You may also disable notifications from your device settings.
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

      <H2>Health disclaimer</H2>
      <p className="text-muted-foreground">
        RecompIQ provides general fitness and nutrition information, not medical advice. Consult a
        qualified healthcare professional before starting any diet or exercise program.
      </p>
    </LegalShell>
  );
}
