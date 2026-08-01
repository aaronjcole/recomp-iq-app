# Base44 audit prompts

These prompts are intentionally limited to platform capabilities and deployment settings that
cannot be established by repository code alone. Use them against a preview/staging copy first.

## Private AI-analysis files

> RecompIQ now uploads food and body-composition images with
> `Core.UploadPrivateFile`, creates a five-minute URL with `Core.CreateFileSignedUrl`, and passes
> that signed URL to `Core.InvokeLLM.file_urls`. In this preview only, verify that both analysis
> flows work end to end. Do not replace either call with public `UploadFile`. Report: (1) whether
> InvokeLLM supports the signed URL, (2) the exact private-file retention period, (3) whether an
> authenticated user or backend function can permanently delete a private file, and (4) whether
> account deletion removes private files. If deletion is supported, show the official API and a
> minimal implementation plan; do not invent an undocumented endpoint.

## Frame isolation

> Audit the hosted RecompIQ preview's response headers and framing behavior. The installed Base44
> SDK forwards API request and response data to `window.parent` while the app is framed, so the app
> must not be embeddable by arbitrary websites. Configure the narrowest supported deployment policy
> using `Content-Security-Policy: frame-ancestors` (and compatible fallback headers if available),
> allowing only origins genuinely required by the Base44 editor/preview. Do not use `*`. Report the
> exact final header and demonstrate that an untrusted-origin iframe is blocked while the Base44
> editor still works.

## OAuth callback integrity

> Review RecompIQ's Base44 email/Google authentication callback against Base44's current supported
> OAuth flow. Use the platform's state and PKCE support, if available, so an access-token callback is
> cryptographically bound to the login attempt that started in the same browser. Ensure a random
> callback cannot swap the signed-in account or clear an unrelated session. Preserve the existing
> safe same-origin return-path validation. Cite the Base44 API or generated implementation used;
> do not create a custom token protocol if the platform already owns this flow.

## Waitlist abuse controls

> Replace RecompIQ's process-local waitlist throttling with Base44's strongest supported
> production-grade control: gateway rate limiting, CAPTCHA/bot protection, or a shared atomic
> limiter. Use only a platform-verified client IP signal, enforce a request-body limit before JSON
> parsing, and make normalized email submission idempotent across simultaneous instances. Keep the
> WaitlistEntry entity admin-only. Explain which guarantee is platform-enforced and which remains
> best effort before making changes.

## Cross-account and duplicate-write validation

> In a disposable preview dataset, test RecompIQ with two normal users and no administrator role.
> For every user-owned entity, prove user A cannot list, fetch by guessed ID, update, or delete user
> B's records. Then submit the same DailyLog, HabitEntry, and WeeklyCheckIn operation simultaneously
> from two tabs. Report the exact records created and whether Base44 supports a unique constraint or
> idempotency key for each case. Do not weaken the current owner-or-admin RLS rules to make a test
> pass.
