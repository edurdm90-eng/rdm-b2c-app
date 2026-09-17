# Medaa Ai — design QA

## Findings and comparison history

No actionable P0/P1/P2 findings remain in the verified scope.

1. **Resolved P2 — duplicated textarea focus outline.** `18-long-term-aim.png` showed an inset browser outline plus the blue field border. Suppressed the web-only input outline while preserving the wrapper focus indication. `18-aim-focus-fixed.png`, compared again with the same source at 376 × 830, shows one clear border and readable content.
2. **Resolved P2 — obsolete async owner could unlock a newer confirmation.** A replaced draft component could finish refreshing after the new component began Set. Mounted-instance cleanup prevents that old callback from clearing the new submission lock.
3. **Resolved P2 — failed-request actions could overlap funding.** Root retry/dismiss controls and handlers now respect a synchronous child-operation lock, with a stable callback. Independent Standards review rechecked both fixes; no blocking findings remain.

## Source, state and normalization

- Source visual truth: `docs/design/focused-medaa/reference-17-20.png` and `reference-21-24.png`, unchanged user boards, each 1617 × 971 pixels. App panels are approximately 376 × 830; board headings/canvas are excluded from app content.
- Implementation: existing Expo native app at `http://localhost:8081/ai-coach`; existing Goals routes receive created goals.
- Primary screenshots: 376 × 830 CSS and image pixels, devicePixelRatio 1. Responsive captures: 320 × 740 and 740 × 360, density 1.
- All evidence below is under `docs/design/focused-medaa/`. Full-view source and actual images were shown together for screens 17–24, including the post-fix aim comparison. Captures preserve the app viewport without device chrome.
- Primary evidence: `17-horizon.png`, `18-aim-focus-fixed.png`, `19-suggestions.png`, `20-selected-plan.png`, `21-confirm.png`, `22-created.png`, `23-saved-journeys.png`, `24-low-balance.png`.
- Supporting states: `aim-320.png`, `created-short.png`, `goal-open.png`, `goal-reflected.png`, `goals-tab.png`.
- Headings, fields, pledge amounts and controls are readable at 1:1; additional cropped regions were unnecessary. A temporarily scaled emulation capture was discarded and replaced by the normalized post-fix capture.
- Records came from an isolated local API/MongoDB account. Two real OpenAI requests produced suggestions and budget refinement. Titles, roadmap length, dates, balances and journey counts differ from illustrative source data. No mock production data or fabricated roadmap states were added.

## Required fidelity surfaces

- **Typography:** bundled Inter regular/medium/bold, strong headings, secondary copy and smaller funding labels. Long titles and steps wrap. The exact reference font asset is unavailable; existing Focused Routine typography is retained.
- **Spacing/layout:** charcoal panels, Medaa header and Base chip, three-step rail, outlined cards, numbered roadmap, separated funding summary, fixed safe-area-aware actions. Long content scrolls independently of the footer. Landscape success actions remain within the viewport; the body scrolls.
- **Colors/tokens:** existing charcoal, muted text, green primary, cyan planning/link and coral shortfall colors. The established green/blue are softer than the raster reference, intentionally consistent with other redesigned screens.
- **Assets/icons:** installed MaterialCommunityIcons; no new image assets, custom SVG drawings, emoji substitutions or rasterized interface. Standard icon-stroke differences are accepted library substitutions.
- **Copy/content:** retained real categories (Focus, Health, Money, Family, Sustainability), not unsupported illustrated categories. Roadmaps render stored text without invented dates/statuses. Journeys say Created rather than falsely claiming a linked goal remains active. Low balance explicitly requests a smaller plan instead of showing a fabricated alternative. Review saves terms; Set locks the pledge. Legacy records remain accessible without enabling new AI habits.

## Interaction and persistence verification

- Selecting 1/2/3 years is local until Continue. Continue saved the journey and advanced without an AI request or pledge lock. Saving the aim and requesting suggestions used the newly saved revision; no stale-journey error occurred.
- Real generation with 20 Base RDM returned three goals. Selecting the 20-RDM option disabled alternatives exceeding the remaining combined budget. Review displayed the saved target, roadmap and rate.
- Preparing 20 days × 1 RDM saved end-exclusive dates, zone and review ID. Base remained 20; no AI goal existed yet.
- Another isolated commitment reduced Base to 6. The stale 20-RDM Set was rejected; recovery showed Need 20, Base 6, Shortfall 14. No funding occurred and the draft remained saved.
- Explicit Fit my budget made the second real AI request, replacing the book milestone with a six-day essay/three-takeaway milestone and adjusted roadmap/prompt. Prior review was cleared. Back/forward retained the replacement; fresh review was required.
- Explicit Set reserved 6 RDM once and created one normal Goal. Open goal preserved the exact title, target, why, five roadmap steps, reflection prompt, dates, saved zone and rate. Finish navigated to Goals, where the AI goal appeared correctly.
- A normal daily reflection moved 1 RDM to Reward and left 5 locked. Target progress stayed 0% because progress updates are separate. Read-only API assertions verified exact content mapping, one created goal, six-day pledge, one completed day, Base 0, Reward 1, Remorse 0, Peer 0, and exactly two AI requests.
- Saved journeys showed the created-goal count. Starting another journey preserved the earlier one; draft and created states remained accessible. Saved-suggestion browsing, reopening success and reload did not request AI or fund again.
- At 320px the aim form wrapped cleanly and document width stayed 320px. At 740 × 360, Open goal, Finish and More goals stayed reachable. Existing navigation and Japanese Wisdom were retained.
- Fresh browser error log after reload: none. An expected rejected funding request was exercised earlier as the low-balance scenario.

## Standards

Independent review against baseline `5873fec` found no hard documented violations. Two P2 async/submission-lock findings were fixed and rechecked. Shared display arithmetic, parallel refreshes and unused presentation exports remain optional refactoring suggestions. No secrets, schemas, model settings or production data were modified.

## Spec

Independent review against the supplied screens found no actionable omissions, scope creep or incorrect funding behavior. Goal-only creation, bounded dates/rate, explicit review/Set, combined-budget protection, saved journeys, genuine budget refinement and Goals integration are implemented.

Review summary: Standards — 2 P2 findings resolved, 0 outstanding blockers; Spec — 0 findings.

## Regression checks and gaps

- `pnpm test`: 96 passed.
- `pnpm --filter server test:integration`: 60 passed, including 19 Medaa cases. New assertions cover summary metadata/owner isolation and exact AI-to-Goals mapping with idempotent Set.
- `pnpm check-types`, `pnpm build`, native TypeScript and `git diff --check`: passed.
- Expo production exports: iOS 1,922 modules; Android 2,287 modules; one Hermes bundle each and 106 assets. Bundle checks, not signed IPA/APK builds.
- UI coverage was browser-driven native-web testing, not a new automated device suite. Physical keyboard behavior, hardware Back/gestures, VoiceOver/TalkBack, enlarged text and real device system insets remain device-testing gaps.
- Existing server OpenAI key reused in memory by the isolated preview; no environment files changed. Two live requests were made; other provider paths used the isolated integration harness.
- Previous Goals QA: `docs/design/focused-goals/design-qa.md`.

## Implementation checklist

- [x] Eight connected Medaa screens with persisted goal data.
- [x] Explicit pledge review/confirmation and low-balance recovery.
- [x] AI goal visible in Goals with roadmap and working reflection.
- [x] Reference comparisons and corrected focus-state recapture.
- [x] Full tests, types, build, native bundles and two-axis review.
- [x] Limited to v2; no push, master or environment-file changes.

final result: passed
