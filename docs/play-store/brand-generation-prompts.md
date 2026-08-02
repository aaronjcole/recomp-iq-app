# RecompIQ brand asset generation

The user-supplied primary lockup is preserved byte-for-byte at
`public/brand/recompiq-logo-primary.png` (SHA-256
`b0f1100f01d4caf105859974cf800d72a1b9cbf7b8a2b3d3a5af687d7222dea8`). The derived assets used the
built-in image-generation workflow with the prompts below.

## Launcher emblem

```text
Use case: logo-brand
Asset type: Google Play launcher icon master and PWA app icon
Input images: Image 1 is the edit target and canonical RecompIQ logo.
Primary request: Create an emblem-only square icon from Image 1. Remove only the bottom “Recomp IQ” wordmark and remove the baked rounded-square edge and white outer corners. Continue the existing deep navy background cleanly to all four square edges with no rounded corners and no external border.
Subject: Keep the exact stylized capital R and central pulse/heartbeat line from Image 1, centered and slightly enlarged for a launcher icon.
Style/medium: Preserve the original polished gradient, dimensional material, edge highlights, navy background, mint/teal/cyan/blue palette, and existing visual identity.
Composition/framing: 1:1 square, emblem centered inside the central 66% safe zone so Android circular and squircle masks will not crop it; balanced padding on all sides.
Constraints: No text. No letters other than the existing R-shaped emblem. No new symbols. No redesign. Do not alter the pulse shape, R silhouette, palette, gradients, lighting, proportions, or material treatment. No rounded outer corners, no baked mask, no white corners, no border, no drop shadow outside the emblem, no watermark.
```

## Play feature graphic

```text
Use case: ads-marketing
Asset type: Google Play feature graphic, final delivery will be cropped to 1024×500
Input images: Image 1 is the canonical emblem reference and must be preserved exactly.
Primary request: Create a premium, restrained landscape brand graphic for RecompIQ using the exact R-and-pulse emblem from Image 1.
Scene/backdrop: Full-bleed deep navy background matching Image 1, with subtle teal and blue atmospheric glow and very faint flowing signal lines suggesting adaptive progress.
Subject: One exact RecompIQ R-and-pulse emblem, centered, crisp, fully visible, and clearly dominant.
Style/medium: Polished modern health-and-fitness technology branding; sophisticated, minimal, dimensional, consistent with Image 1.
Composition/framing: Extra-wide approximately 2.05:1 composition. Keep all important artwork inside the central 70% of both dimensions so a 1024×500 center crop remains safe. Generous negative space; no edge clutter.
Color palette: Deep navy, mint, teal, cyan, and electric blue taken from Image 1.
Constraints: Preserve the emblem silhouette, pulse shape, gradients, palette, materials, and proportions exactly. No text, no wordmark, no people, no bodies, no medical imagery, no app-store badges, no rankings, no claims, no additional icons, no border, no rounded outer corners, no white corners, no watermark.
Avoid: Busy sci-fi HUD elements, charts, tiny decorations, unrelated symbols, and multiple copies of the emblem.
```
