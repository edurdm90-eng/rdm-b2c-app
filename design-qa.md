# Habits redesign — design QA

## Evidence and normalization

- Source visual truth: `docs/design/focused-habits/reference.png`, unchanged copy of the user's 1617 × 971 image. Four app panels are approximately 380 × 812; board titles and surrounding canvas are not app UI.
- Implementation: existing Expo native app at `http://localhost:8081/habits`. Main viewport and captures: 380 × 812 CSS/pixels, devicePixelRatio 1. Narrow verification: 320 × 740, density 1. A preliminary desktop-sized capture was excluded from phone-fidelity judgment.
- Captures in `docs/design/focused-habits/`: `habits.png`, `framework.png`, `details.png`, `schedule.png` (before fixes), `schedule-fixed.png`, `schedule-320-fixed.png`.
- Each full-view comparison displayed the original board and the actual browser capture together in one tool input. Focused inspection covered header/type scale, row dots, category selection, form fields, date controls, and pledge/CTA region. Separate crops were unnecessary because these regions were legible at 1:1 capture size.
- Reference titles, balances, categories, and streaks are illustrative. Implementation uses the existing API catalog and persistent account data, not screenshot fixtures. Verification used an isolated local API/MongoDB; no production database or OpenAI key was used.
- Existing seven-tab navigation (including Japanese Wisdom) is retained. Scrollable extra catalog rows, saved time zone, 500-character pledge limit, real-category names, and read-only calendar records are intentional adaptations.

## Comparison history and resolved findings

1. **P1 — Web date changed visually without recalculation.** In `schedule.png`, the end input displays October 1 but summary remains five days. The web field now validates and deduplicates both native input and React change events. Reverification produced 14 weekday-only reflections or 20 daily reflections for September 11–October 1; Back/Continue retained the date. `schedule-fixed.png` shows the corrected 20 RDM total.
2. **P2 — Schedule note below the fold.** At 380 × 812 the settlement note was clipped in the initial view. Reduced schedule-specific gaps, summary gaps, and header/card padding. The revised capture shows the complete Reward/Remorse note above the persistent final CTA.
3. **P2 — Narrow date text clipped.** At 320 pixels, paired inputs truncated the year. Date columns now wrap when 150-pixel minimum widths cannot fit. `schedule-320-fixed.png` shows complete stacked dates; the remaining form scrolls without horizontal overflow.
4. **P2 — Web selected-state semantics.** Native accessibility state alone was absent from browser accessibility output. Added explicit checked/selected/pressed ARIA states alongside native props. Browser snapshots now announce Today/All, calendar selection, template selection, and repeat/day choices.
5. **P1 — Weekday preset regression found in code review.** Preserved the old Deep Work weekday-only default despite its catalog cadence label being Daily. Browser verification confirmed Monday–Friday and the correct 14-day total. No backend scheduling rules changed.

## Required fidelity surfaces

- **Typography:** existing bundled Inter regular/semibold/bold, strong 32-pixel Habits title, 23-pixel navigation headings, compact form/body labels. The raster's exact font file is unknown; the existing Inter family is a close match. Dynamic titles wrap rather than disappear.
- **Spacing/layout:** 20–22-pixel gutters, separated compact list rows, rounded selected templates, two distinct form steps, anchored form/browser CTAs, and existing safe areas. Smaller phones use scrollable content and stacked dates; the final button stays reachable.
- **Colors/tokens:** shared Focused Routine charcoal surfaces, muted secondary text, green selection/actions, cyan category icons, gold streak indicators, and coral validation. Other screens retain their existing design.
- **Assets/icons:** genuine installed MaterialCommunityIcons, using each stored template/habit icon. The reference contains standard UI icons; no generated art, screenshot-as-UI, fabricated illustrations, or custom decorative SVG was needed.
- **Copy/content:** reference hierarchy and creation labels retained. Catalog heading is “Habit frameworks,” avoiding false personalized recommendations. End-exclusive dates, saved time zone, minimum 1 RDM, Base before/after, and settlement consequences are explicit.

## Interaction and persistence checks

- Today/All habits, calendar selection, persisted streak/progress dots, Create buttons, category filtering, template selection and prefilling, Create my own, Back and Continue exercised.
- Empty custom form gives visible validation; category selection works. Both editable daily RDM and plus/minus controls update totals. Unaffordable pledges disable creation with a shortfall message.
- September 11–October 1: 20 daily days or 14 weekdays, end excluded. Details/Back preserved dates and daily amount. Deep Work retains its weekday preset.
- A custom Evening reading habit was created through the UI in the isolated account: two days × 1 RDM. Base changed from 482 to 480 only on final creation. The existing detail route opened successfully.
- Existing action and reflection UI then settled one day: Reward 3 → 4, remaining locked 2 → 1, streak 0 → 1. The record appeared in All habits and the wallet ledger contained one −2 Base lock and one +1 Reward entry.
- Future calendar rows opened a read-only schedule dialog; Open habit returns to the current action/history flow, not a backdated reflection form.
- Japanese Wisdom tab and Hara Hachi Bu setup remained accessible with canonical terms, daily schedule, and separate explicit confirmation. Bonus payouts remain disabled.
- Stable creation ID, synchronous in-flight guard, shared schedule validator, and existing authenticated creation API are retained. No persistence service or schema changes.
- Browser console checked after verification: no errors. Existing shadow and pointerEvents deprecation warnings remain.

## Regression checks and residual gaps

- `pnpm test`: 78 passed.
- `pnpm check-types` and `pnpm build`: passed.
- Native TypeScript and `git diff --check` rechecked after final changes.
- Expo iOS and Android production bundles exported successfully.
- Physical-device keyboard, date-picker interaction, hardware Back/gestures, and system safe-area behavior were not exercised. Native picker code was reviewed and bundled; native safe-area handling is retained.
- Verification was browser-driven UI coverage, not a new automated mobile test suite.
- Previous Home/auth/wallet QA is archived at `docs/design/focused-routine/design-qa.md`; its unrelated pending donation policy is unchanged and outside this Habits request.

## Findings and checklist

No actionable P0/P1/P2 findings remain in the verified redesign scope. Expected deviations are documented above.

- [x] Preserve real habits/catalog/pledges and Japanese Wisdom.
- [x] Match the four-screen hierarchy and navigation.
- [x] Recompare after date, density, and responsive fixes.
- [x] Check persistent creation and reflection settlement.
- [x] Leave the local preview open; reset temporary viewport override.
- [x] Remain on v2, without commit, push, or master changes.

final result: passed
