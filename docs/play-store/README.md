# Google Play listing assets

This directory contains version-controlled, non-sensitive source assets for the RecompIQ Google
Play listing.

## Included

- `app-icon-512.png` — 512×512 full-square R-and-pulse listing icon with no baked rounded corners.
- `feature-graphic-1024x500.png` — 1024×500 opaque feature graphic.
- `brand-generation-prompts.md` — reproducible source provenance and generation prompts.
- `listing-copy.md` — reviewed listing copy, URLs, and screenshot plan.

The canonical user-supplied lockup is preserved byte-for-byte at
`public/brand/recompiq-logo-primary.png`. The emblem-only launcher master lives at
`public/brand/recompiq-mark-master.png`; its full-bleed navy background and centered safe-zone layout
allow Android and Google Play to apply their own icon masks without clipping the mark.

The emblem master and feature graphic were created with the built-in image-generation workflow,
then resampled to Google's exact dimensions. The feature graphic contains no text, pricing,
rankings, medical imagery, body transformations, store badges, or performance claims.

Feature graphic alt text: Mint, teal, and blue RecompIQ R-and-pulse emblem over a deep navy signal
wave background.

App icon alt text: Mint, teal, and blue RecompIQ R-and-pulse emblem on a deep navy square.

## Screenshot rules

Use only a disposable demonstration account with synthetic data. Do not commit or upload screenshots
containing a real person's health, profile, authentication, or support information. Capture the final
Play-installed build rather than a desktop browser frame.
