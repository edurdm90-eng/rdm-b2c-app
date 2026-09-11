# Goals — design QA

## Findings and comparison history

No actionable P0/P1/P2 findings remain in the verified scope.

1. **Resolved P2 — Add-goal summary clipped above the footer.** `create-top.png` showed the Base-after-pledge row partly hidden. Reduced form-only spacing and summary padding. `create-fixed.png`, compared again with the source at 376 × 846, shows the complete summary and explicit lock action.
2. **Resolved P2 — Goal overview density.** `overview.png` placed the remaining-allocation card behind an unnecessary Back footer and pushed early closure below the reference viewport. Removed that redundant footer when no daily/final action is available, kept header Back, moved progress editing beside the roadmap heading, and tightened step/section gaps. `overview-fixed.png` shows the ledger, recent reflection, remaining allocation, schedule and early-close control together. Longer content remains scrollable.
3. **Resolved P2 — Modal keyboard and accessibility review.** Added keyboard avoidance inside the native Modal, retained its bounded ScrollView and safe-area padding, and made the native progress slider an explicit accessible adjustable element. Web confirmation cancellation was reachable at 740 × 360 (`end-sheet-short.png`). Physical keyboard/screen-reader verification remains a device-testing gap.
4. **Resolved correctness/navigation findings.** Bind unsaved reflection text to its original saved-zone day; reject stale submission/confirmation snapshots; apply navigation interception only to an actually available reflection view. The recent-reflection shortcut now expands and scrolls to its saved day even when early closure adds more than seven later entries (`reflections-history.png`). Legacy completion copy describes its whole-goal settlement correctly.

The final independent React/backend review found no additional concrete regressions after these fixes.

## Source, state and normalization

- Source visual truth: `docs/design/focused-goals/reference.png`, unchanged user board, 1617 × 971 pixels. Each goal panel is approximately 376 × 846; board labels and surrounding canvas are excluded from app content.
- Implementation: existing Expo native app at `http://localhost:8081/goals`, using the existing goal creation/detail routes.
- Primary captures: 376 × 846 CSS pixels and image pixels, devicePixelRatio 1. Responsive checks: 320 × 740 and 740 × 360, density 1.
- Final comparison evidence: `goals-final.png`, `create-fixed.png`, `reflection.png`, `overview-fixed.png`. Source and actual image were displayed together in each full-view comparison, including post-fix comparisons.
- Supporting evidence: `completion-confirmation.png`, `end-confirmation.png`, `reflections-history.png`, `completed-320.png`, `end-sheet-short.png`. All paths are under `docs/design/focused-goals/`.
- The four panels' headings, fields, counters, progress, ledger and actions were readable at 1:1. Additional cropped region comparisons were unnecessary.
- Data came from real persistent records in an isolated local API/MongoDB account. Names, dates, counts and outcomes differ from the illustrative board. No production mock records or fabricated historical progress were added.

## Required fidelity surfaces

- **Typography:** reused bundled Inter regular/medium/bold; 31px list title, 22px route headings, 18px card titles and reflection prompt, 13–15px body/input text, 11–12px supporting labels. Longer real titles wrap without clipping. The source's exact font asset is unavailable.
- **Spacing/layout:** charcoal full-screen panels, compact segmented tabs, outlined cards, gold progress tracks, date fields and pledge controls. Creation/reflection retain fixed financial actions; overview uses header Back and a contextual footer only when an action is available. Mobile navigation retains the existing horizontal tab behavior and safe areas, including Japanese Wisdom.
- **Colors/tokens:** reused the existing Focused Routine charcoal, muted text, green primary, gold allocation, cyan link and coral destructive tokens. The established green is softer than the raster reference; this is an intentional consistency choice across the redesigned app.
- **Assets/icons:** installed MaterialCommunityIcons, no new dependency or generated art. Standard icon stroke differences are accepted library substitutions. No decorative images, custom SVG drawings, emoji substitutions or screenshot-based interface rendering were introduced.
- **Copy/content:** real categories remain Focus, Health, Money, Family and Sustainability. Target text retains the API's 120-character limit, not the illustrated 200. Optional target progress is saved separately from daily reflection because the API actions are distinct. The slider supports 0–99%; explicit final completion sets 100%. Roadmap steps use stored strings only: no invented per-step dates or completion badges. Manual goals without steps explain that state. Missed/ended goals are labeled separately from successful completions.

## Interaction and persistence verification

- Exercised required-field validation, category selection, start/end-exclusive dates, 1 RDM minimum, daily-pledge stepper, live total/Base-after preview, insufficient funding and over-90-day blocking.
- Created a one-day, 2 RDM goal through the UI; one unique goal and one Base debit persisted.
- Saved 50% target progress: Reward and remaining pledge were unchanged. Reflection text survived “Not today” and reopening.
- Completed that day's reflection: 2 RDM moved to Reward, remaining pledge became zero, target progress stayed 50%. Explicit final completion changed status/progress to completed/100% with no extra payout.
- A 20-day goal retained its saved 60% target progress and roadmap. Its first reflection moved 1 RDM to Reward and left 19 RDM locked. Reload preserved the result.
- Canceling early closure left purse totals unchanged. Confirming moved exactly 19 remaining allocations to Remorse, retained the previous Reward and target progress, and closed the goal.
- Read-only API assertions verified unique funding/reflection ledger entries, exactly 19 early-close entries, unique dates, final statuses and exact purse totals: Base 434, Reward 9, Remorse 20, Peer 0. Baseline before this Goals QA was Base 456, Reward 6, Remorse 1.
- Saved reflection and target/outcome histories are expandable/read-only. The recent-reflection shortcut reaches the original reflected day after future allocations are forfeited.
- Active/Completed navigation, Medaa Ai entry and Japanese Wisdom tab were exercised. No AI generation request was made; the isolated preview intentionally has no provider key. Existing secrets/environment files were untouched.
- At 320px, titles/funding wrap, content scrolls, and document width remains 320px. Short confirmation content scrolls and cancellation remains reachable.
- Refreshed browser error log: none.

## Regression checks and gaps

- `pnpm test`: 96 passed, including eight new goal presentation/submission-day tests.
- `pnpm check-types`, `pnpm build`, final native TypeScript check and `git diff --check`: passed.
- Final Expo iOS and Android production bundles exported successfully.
- UI coverage was browser-driven native-web testing, not a new automated device suite. Physical iOS/Android keyboard behavior, hardware Back/gestures, VoiceOver/TalkBack, enlarged text and device system insets were not physically tested.
- API/domain behavior, schema, secrets and Medaa generation were not changed. Existing habit work is preserved.
- Previous Habit detail QA is archived at `docs/design/focused-habit-detail/design-qa.md`.

## Implementation checklist

- [x] Four connected Goals screens with persistent data.
- [x] Explicit pledge lock, separate reflection/progress actions and guarded early closure.
- [x] Reference comparisons, visual corrections and post-fix captures.
- [x] Timezone/day-boundary tests and exact local settlement assertions.
- [x] Native bundles, typechecks, build and React review.
- [x] Remain on v2; no commit, push, master modification or environment-file edits.
- [x] Preview retained and temporary viewport reset before handoff.

final result: passed
