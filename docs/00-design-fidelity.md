# 00 — Design Fidelity (read before building any UI)

> **Update 2026-10-12 (decision D12):** the founder chose the **Scrapbook** visual direction. For LOOK & FEEL (colour, type, materials, motion) the Scrapbook direction and the tokens in `src/app/globals.css` now win; the mockups below remain binding for **layout, flow and copy**. See CLAUDE.md "Design fidelity".

> **The mockups are the design. Reproduce them — do not reinterpret them.** They are a binding reference implementation, not loose inspiration. The founder has approved this UI; the build must match it.

## The rule

When you build a screen, your job is to **reproduce the approved mockup** in production code: same layout and structure, same colours (the brand tokens), same typography, same copy/wording, same spacing and proportions, same components, and the same restrained animations (hero draw-in, product-morph, gentle CTA wobble). The visual result should be indistinguishable from the mockup, then made real (real children's artwork and product photography replacing the placeholder doodles).

Do **not** substitute a different component library's default look, a generic admin-template aesthetic, or your own redesign. Build the component set to match the mockups and reuse it everywhere.

## The mockup files (in `/mockups`)

- `snickerdoodle-mobile-mockups.html` — the **mobile** designs for Landing, Start Creating, Catalogue, Studio (full-bleed canvas + floating brush HUD + bottom sheet + scrolling tool bar), Checkout, Family Keepsake Home, and the Gift link.
- `snickerdoodle-visibility-and-circles.html` — the **per-asset visibility** modal (Only me / Family / Extended) and the **add-family-member** modal (relationship → circle, photo, birthday, email invite).
- `snickerdoodle-desktop-mockups.html` — the **desktop** designs for the same screens and the create-gift-link modal.

Open these in a browser; treat the rendered result as the target. They use the exact brand tokens and fonts in `docs/02`.

## Precedence (when sources differ)

- **Visuals** (layout, colour, type, spacing, components, copy): the **mockups win**.
- **Behaviour** (what happens on interaction, rules, states): the **functional spec** (`docs/03`) and the **Studio spec** win.
- **Data/permission/trust rules:** `docs/04` and `docs/05` win.

If something needed at build time isn't shown in a mockup (a new state, an edge case, an error), **extend in the same visual language** — same tokens, type, spacing, component patterns — and confirm rather than inventing a new style.

## Fidelity checklist (per screen)
- Matches the mockup's layout and structure at mobile **and** desktop widths.
- Uses the brand tokens exactly (CTAs are the cinnamon orange `#D2691E` with cream text).
- Uses Fraunces / Mulish / Caveat as the mockups do.
- Reuses the shared component set; no stray default styling.
- Reproduces the named animations and respects `prefers-reduced-motion`.
- Copy matches the mockups' voice and wording.
