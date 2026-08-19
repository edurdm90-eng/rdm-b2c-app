# Design QA

**Comparison target**

- Source visual truth: `/Users/yashdiwan/Documents/rdm-b2c/RDM_Full_App_Wireframe.html`
- Source capture: `/tmp/rdm-app-qa/06-source-home-page.png`
- Implementation capture: `/tmp/rdm-app-qa/08-home-revised.png`
- Side-by-side evidence: `/tmp/rdm-app-qa/09-home-comparison-revised.png`
- Viewport: 390 × 844 CSS px, dark theme, authenticated Home state, device scale factor 1.
- Pixels: source and implementation captures are each 390 × 844. The source app surface was cropped from its browser device frame (342 × 734) and normalized to 390 × 844 before comparison. The combined evidence is 786 × 844.

**Full-view comparison evidence**

The revised implementation preserves the source hierarchy: invitation banner, date and greeting, streak card, two path cards, three responsible-game cards, wallet continuation, and persistent five-tab navigation. Fraunces, Inter, and JetBrains Mono reproduce the display/body/utility hierarchy. The dark neutral panels and growth, AI, gold, coral, and plum tokens match the source palette and contrast. Spacing, radii, borders, and vertical rhythm are consistent at the target viewport. App copy intentionally reflects the clarified Framework/custom-habit and AI-preview requirements.

**Focused region comparison evidence**

A separate crop was not needed: both halves of the normalized full-view comparison render the hero, path cards, game cards, typography, icons, and navigation at readable size. The generated sprout asset is sharper and more app-icon-like than the source's decorative plant mark; this is acceptable P3 branding polish rather than a structural mismatch.

**Findings**

- No actionable P0, P1, or P2 differences remain.
- P3: the Home growth illustration uses the product sprout mark instead of the wireframe's thin botanical illustration. A future brand-asset pass may refine it without changing layout or behavior.

**Comparison history**

1. Initial evidence: `/tmp/rdm-app-qa/07-home-comparison.png`. P2 — the fixed-width horizontal game row clipped Pattern Match and changed the source's above-the-fold composition.
2. Fix: replaced the horizontal scroller with a responsive three-column row and flexible card widths in `apps/native/app/(app)/(tabs)/index.tsx`.
3. Post-fix evidence: `/tmp/rdm-app-qa/09-home-comparison-revised.png`. All three games fit fully with matching density; no P0/P1/P2 differences remain.

**Primary interactions checked**

Authentication, Framework/template and custom habit creation, idempotent habit action/reflection/reward, missed-pledge handling, six timed game mechanics with server-controlled scoring and expiry, group contribution/join codes/editable idempotent multi-member awards, all leaderboard scopes, unique referral progression, 24 badges, atomic wallet remorse decisions/donation/redemption, tab navigation, and the static AI Coach preview were exercised against the browser-rendered Expo app and local API.

**Implementation checklist**

- [x] Match source typography, colors, layout, spacing, and copy hierarchy.
- [x] Keep all persistent controls visible at the target viewport.
- [x] Verify core routes and mutations against the local backend.
- [x] Preserve AI Coach as a clearly labeled preview for later implementation.

final result: passed
