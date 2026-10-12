# 02 — Brand & Design Requirements

> Full brand bible: `snickerdoodle-brand-and-product-foundations.md`. This is the build-facing distillation. The HTML mockups are the visual source of truth — match them.

## Brand essence

One idea: **"Keep the magic."** Childhood is fleeting; turn throwaway kids' art into kept keepsakes. We frame the wonky bits in gold.

## Voice (required throughout copy)

Warm · plain · playful-with-a-wink · quietly reassuring. Non-corporate. Lowercase, friendly. **Trust is shown through control, not declared.**

- **Lexicon / CTAs:** "start creating", "keep the magic", "they're only little once", "made real", "your keepsake box", "share a ready-to-buy link", "join family & checkout".
- **Anti-patterns:** corporate stiffness; pushy upsell; shouting about "AI"; anything that makes a parent feel a child's data is exposed; anything that reads as a social network.
- **Product naming — "Studio" (decision D9):** there is **one** Studio, a single creative surface that *grows and improves* over time (mirroring the Keepsake Home that grows with the child). It is never renamed and never split into a separate "Editor". Future power capability — end-to-end / create-from-scratch / standalone generative design — arrives as an **upgraded mode within Studio ("Studio Plus")**, not a new product. The free/paid line is depth of capability in one place, never a different room — and never a wall in front of keeping or viewing a family's own keepsakes.

## Design tokens (required values)

**Colour** — use this exact token set; primary actions use the bright cinnamon orange:

| Token | Hex | Use |
|---|---|---|
| oat | `#FBF5E9` | Paper / base background |
| cocoa | `#2E2723` | Ink / text (never pure black) |
| honey | `#F2A640` | Hero accent / gold framing |
| cinnamon | `#C8623A` | Deep accent, heading highlights |
| **cta** | `#D2691E` | **Primary buttons** (start creating, checkout, join family) |
| cta-text | `#FFF6E9` | Cream text on CTAs |
| sky | `#84BBD0` | Accent |
| berry | `#E8786E` | Accent |
| meadow | `#93B97C` | Accent |
| green-save | `#5C8A3F` | Savings / trust green (e.g. "save 5%") |
| honey-band | `#FBEEDB` | Warm section bands (home header, modals) |

**Type** (free Google Fonts):
- **Fraunces** — display serif (headlines, product names, section titles).
- **Mulish** — body sans.
- **Caveat** — handwriting accent (eyebrows, captions, personal notes — sparingly).

**Shape & motion:** generous radii (pill buttons/chips, ~12–16px cards). Motion restrained — gentle CTA wobble, the hero "draws itself in", the product-morph. Always guarded by `prefers-reduced-motion`.

## Imagery

Placeholder doodles in the mockups will be replaced by **real children's artwork and product photography** — design every image surface to make that the hero, especially on mobile and the catalogue/hero. A child's photo or drawing is sensitive data; it inherits the same privacy rules as keepsakes (see `docs/05`).
