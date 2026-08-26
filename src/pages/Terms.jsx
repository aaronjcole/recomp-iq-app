import LegalShell from "@/components/LegalShell";

function H2({ children }) {
  return <h2 className="text-xl font-semibold pt-2">{children}</h2>;
}

export default function Terms() {
  return (
    <LegalShell
      title="Terms of Service"
      description="RecompOne's Terms of Service: eligibility, acceptable use, health disclaimer, data ownership, disclaimers, and limitation of liability."
      canonicalPath="/terms"
      updated="July 2026"
    >
      <H2>1. Acceptance</H2>
      <p>By creating an account or using RecompOne, you agree to these Terms. If you don't agree, don't use the app.</p>

      <H2>2. Eligibility</H2>
      <p>You must be at least 18 years old and able to enter into a binding agreement to use RecompOne.</p>

      <H2>3. Your account</H2>
      <p>You're responsible for keeping your credentials secure and for activity on your account. Provide accurate information during onboarding and keep it updated.</p>

      <H2>4. Health disclaimer</H2>
      <p className="text-muted-foreground">
        RecompOne offers general fitness and nutrition guidance, not medical advice or diagnosis.
        RecompOne is not a medical device and does not diagnose, treat, cure, or prevent any medical
        condition. Always
        consult a qualified healthcare professional before starting or changing any diet, supplement, or
        exercise program. Stop and seek medical attention if you experience pain, dizziness, or discomfort.
      </p>

      <H2>5. Acceptable use</H2>
      <p>You agree not to misuse the app, reverse-engineer it, attempt to access others' data, or use it for any unlawful purpose.</p>

      <H2>6. Your content &amp; data</H2>
      <p>You own the data you log. You grant us a limited license to process it solely to operate and improve the features described in our Privacy Policy.</p>

      <H2>7. Disclaimers</H2>
      <p className="text-muted-foreground">RecompOne is provided "as is" without warranties of any kind. Plans and recommendations are estimates and may not produce specific results.</p>

      <H2>8. Limitation of liability</H2>
      <p>To the maximum extent permitted by law, RecompOne and its providers are not liable for any indirect, incidental, or consequential damages arising from your use of the app.</p>

      <H2>9. Termination</H2>
      <p>You may delete your account at any time. We may suspend or terminate access if you violate these Terms.</p>

      <H2>10. Changes</H2>
      <p>We may update these Terms; continued use after changes constitutes acceptance.</p>

      <H2>11. Contact</H2>
      <p>Questions about these Terms? Reach out from the app's More tab.</p>
    </LegalShell>
  );
}