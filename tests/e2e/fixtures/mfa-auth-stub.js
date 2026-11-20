// Control rendering must never send an SMS, change an account, or require auth.
export const loadSignInOptions = async () => ({ name: "Test app" });
