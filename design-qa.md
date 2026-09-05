# Design QA — Good Deeds Register

## Evidence

- Source visual truth: `/Users/yashdiwan/Documents/rdm-b2c/RDM_Grow_Habits_Wisdom_Family_Update.html`, screen 8.
- Source screen capture: `/Users/yashdiwan/.codex/visualizations/2026/08/27/rdm-good-deeds-register/00-source-good-deeds-screen-half.png`.
- Normalized source: `/Users/yashdiwan/.codex/visualizations/2026/08/27/rdm-good-deeds-register/01-source-good-deeds-normalized.jpg`.
- Selected implementation: `/Users/yashdiwan/.codex/visualizations/2026/08/27/rdm-good-deeds-register/02-implementation-selected-mobile.png`.
- Reward implementation: `/Users/yashdiwan/.codex/visualizations/2026/08/27/rdm-good-deeds-register/03-good-deeds-reward-popup.png`.
- Persisted implementation: `/Users/yashdiwan/.codex/visualizations/2026/08/27/rdm-good-deeds-register/04-implementation-persisted-mobile.png`.
- Source pixels: 169 × 365 from the overview board's half-scale render, normalized proportionally to 390 × 844.
- Implementation viewport and pixels: 390 × 844 CSS px and 390 × 844 px at device scale factor 1.
- State: authenticated mobile user with the first two deeds selected; persisted and positive-action states were captured separately.

## Findings

No actionable P0, P1, or P2 differences remain.

- Fonts and typography: Fraunces, Inter, and JetBrains Mono preserve the source hierarchy, weights, compact reward labels, and wrapping.
- Spacing and layout rhythm: header, card margins, 50 px deed rows, dividers, checkbox alignment, and the separated gold CTA match the normalized source composition.
- Colors and tokens: existing app tokens reproduce the dark canvas, charcoal card, low-contrast dividers, green selections, muted subtitle, and gold rewards/CTA.
- Image quality and assets: screen 8 contains no raster imagery. Standard checkbox and back icons use the installed Material Community Icons set and remain sharp at mobile density.
- Copy and content: all six labels and reward values match the wireframe exactly. The post-submit message is contextual and server-owned.
- Accessibility and responsiveness: each row is a labeled checkbox with checked/disabled state, the CTA exposes disabled/loading state, and all text fits at 390 px without clipping. The blue outline in the selected capture is the browser's expected keyboard-focus indicator and is retained intentionally as P3 accessibility behavior.
- Focused comparison: a separate crop was unnecessary because the complete card and all typography remain readable in the equal-size 390 × 844 comparison.

## Comparison History

- Pass 1 found two P2 fidelity issues: the CTA sat too close to the card and selected checks used a dark glyph instead of the source's light glyph.
- Repair: added 10 px of CTA separation and changed the check glyph to the light ink token.
- Pass 2 compared the normalized source and revised selected implementation in the same input. Geometry, hierarchy, colors, content, wrapping, and control states passed.

## Functional Verification

- Opened the register through **Grow Every Day → Add Sunlight** and toggled deeds on and off.
- Submitted the first two deeds, received the dynamic `+35 RDM` popup, and confirmed **Nice!** returns to the tree.
- Verified wallet reward increased by 35 and tree growth changed from 20 to 22 using two persisted sunlight actions.
- Revisited the register and confirmed completed deeds remain checked and disabled.
- Confirmed MongoDB `rdm-business.gooddeedentries` stores two daily records, with matching idempotency operations on the profile.
- Browser console: no errors or warnings.
- `pnpm test`, `pnpm check-types`, `pnpm build`, and `git diff --check` pass.

## Design QA — Streak Missed

### Evidence

- Source visual truth: `/Users/yashdiwan/Documents/rdm-b2c/RDM_Grow_Habits_Wisdom_Family_Update.html`, screen 9.
- Normalized source: `/Users/yashdiwan/.codex/visualizations/2026/09/05/rdm-streak-missed/00-source-streak-missed-normalized.jpg`.
- Implementation: `/Users/yashdiwan/.codex/visualizations/2026/09/05/rdm-streak-missed/05-final-implementation-390x844.png`.
- Final comparison: `/Users/yashdiwan/.codex/visualizations/2026/09/05/rdm-streak-missed/06-side-by-side-final-verified.jpg`.
- Viewport and output: 390 × 844 CSS px and 390 × 844 px at device scale factor 1. The source crop was normalized to the same dimensions.
- State: an authenticated user with a pledged tree, an 18-day streak, and no care record for the prior local calendar day.

### Findings

No actionable P0, P1, or P2 differences remain.

- Layout, type hierarchy, warning treatment, purse flow, and primary CTA match the supplied screen.
- The CTA copy intentionally says “any care action” to reflect the confirmed flexible-care rule.
- Material Community Icons provide the warning and transfer icons; no substitute or placeholder assets are used.
- The screen fits without clipping at 390 px and exposes the warning/error regions to assistive technology.

### Comparison History

- Pass 1 found P2 vertical-rhythm differences: both cards were too short and the CTA block sat too high.
- Repair: increased the purse and CTA card heights, added section separation, and constrained the supporting copy.
- Pass 2 compared the normalized wireframe and revised implementation in one image. Geometry, colors, copy, and control hierarchy passed.

### Functional Verification

- Confirmed a prior-day fertilizer, water, or sunlight record prevents the missed-day state; the user is never required to complete all three.
- Confirmed no care triggers one fixed 10 RDM transfer from Reward to Remorse while total RDM stays unchanged.
- Confirmed reloading does not repeat the transfer, and **Tend the tree now** acknowledges the notice and returns to the tree.
- Confirmed a journal save creates a dated water-care record in the `rdm-business` database and increases tree growth.
- Confirmed a completed habit cannot be cycled repeatedly on the same local day to inflate its streak.
- Confirmed creating the tree stakes the selected RDM from the available balance, and catch-up reconciliation processes every missed day since the last evaluation exactly once.
- `pnpm test`, `pnpm check-types`, `pnpm build`, and `git diff --check` pass.

final result: passed
