# Design QA — Grow Your Tree

**Comparison Target**

- Source visual truth: `/Users/yashdiwan/Documents/rdm-b2c/RDM_Grow_Habits_Wisdom_Family_Update.html`
- Source board capture: `/Users/yashdiwan/.codex/visualizations/2026/08/25/rdm-grow-habits-audit/00-top-viewport.png` (1280 × 720 px)
- Focused source crop: `/Users/yashdiwan/.codex/visualizations/2026/08/25/rdm-tree-implementation/00-source-grow-every-day.png` (344 × 638 px)
- Implementation capture: `/Users/yashdiwan/.codex/visualizations/2026/08/25/rdm-tree-implementation/08-grow-every-day-final.jpg` (390 × 844 px)
- Viewport: 390 × 844 CSS px, device scale factor 1; the implementation capture is 1:1 with no density normalization. The focused source crop preserves the wireframe's native board density and excludes the surrounding board and adjacent phones.
- State: authenticated Day 18 / Budding profile, 100 RDM entered, pledge not yet submitted, dark theme.

**Findings**

- No actionable P0, P1, or P2 mismatches remain.
- [P3] The implementation viewport is taller than the cropped wireframe phone, so it shows the complete action tiles and additional bottom breathing room. This is expected responsive behavior and does not alter the above-the-fold flow.

**Required Fidelity Surfaces**

- Fonts and typography: Fraunces, Inter, and JetBrains Mono match the source hierarchy, weights, wrapping, and compact labels.
- Spacing and layout rhythm: header, score, pledge card, tree, and three action tiles retain the source order, proportions, radii, borders, and vertical rhythm.
- Colors and visual tokens: dark surfaces, mint growth accent, gold Reward, coral Remorse, muted copy, and the subtle score-card tint match the wireframe palette.
- Image quality and asset fidelity: the three-leaf tree uses the exact paths and ellipses from the source wireframe through `react-native-svg`; no placeholder or approximate artwork remains.
- Copy and content: titles, purse labels, pledge explanation, warning, and action labels match the source.

**Comparison History**

1. Initial comparison found a P2 asset mismatch: a generic sprout icon on a circular tint replaced the wireframe's distinctive three-leaf tree.
2. Fixed by installing `react-native-svg`, copying the source artwork exactly, removing the circular backdrop, and adding the source's subtle score-card tint.
3. Post-fix evidence: focused source crop and `08-grow-every-day-final.jpg` were opened together. No actionable P0/P1/P2 differences remain.

**Interaction and Runtime Evidence**

- Home `Grow Your Tree` card opened `/tree` successfully.
- Pledge mutation persisted 100 RDM, returned the disabled `Pledged` state, and announced `Your tree pledge is active.`
- `Add Fertilizer` opened the existing Habits screen; Water and Sunlight show scoped next-step messages.
- Browser console errors checked after the final render and interactions: none.

**Implementation Checklist**

- [x] Home card and navigation
- [x] Faithful Grow Every Day screen
- [x] Persisted pledge backend and database fields
- [x] Mobile visual comparison and interaction verification

final result: passed
