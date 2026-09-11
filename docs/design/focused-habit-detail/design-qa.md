# Habit action, reflection and history — design QA

## Findings and comparison history

No actionable P0/P1/P2 findings remain in the verified scope.

1. **Resolved P2 — Nested web focus outline.** Action and reflection textareas initially displayed a second rectangular browser outline inside the rounded field (`action-initial.png`, `action-fixed.png`, `reflection-fixed.png`). The web-only input outline is now transparent and zero-width; the containing field supplies a visible cyan focus border. A fresh bundle load and comparison confirmed one clean focus boundary in `action-final.png` and `reflection-final.png`.
2. **Resolved P2 — Completion card clipped above the footer.** In `completed.png`, the bottom of the next-reflection card was clipped at the reference viewport. Reduced result-only gaps from 12 to 10 and bottom padding to 8. `completed-fixed.png` shows the complete card and both persistent actions.
3. **Resolved P1 — Final-day result selection.** The API deactivates a fully settled commitment immediately. The new presentation helper gives today's persisted completed/missed outcome precedence over inactive/finished state. UI checks show 1 of 1 completed with zero locked RDM, or 0 of 1 and one missed settlement; ten focused state tests cover these boundaries.
4. **Resolved P2 — Short-screen confirmation reachability.** The missed-day sheet uses a bounded, scrollable body with bottom safe-area padding. At 740 × 360, both actions were visible and cancellation worked (`missed-sheet-short.png`). Transient resize/slide-animation captures were excluded from judgment.

The React/backend review also led to fresh day/stage checks before submission and preservation of cached content and unsaved drafts when background refresh fails. Final independent review found no further actionable correctness issues.

## Evidence and normalization

- Source: `docs/design/focused-habit-detail/reference.png`, unchanged user image, 1617 × 971 pixels. Four app panels are approximately 366 × 824; board labels and surrounding canvas are not app content.
- Implementation: existing Expo native app, `http://localhost:8081/habits`, opening the existing habit detail route. Primary captures: 366 × 824 CSS/pixels at devicePixelRatio 1. Responsive checks: 320 × 740 and 740 × 360, density 1.
- Evidence folder: `docs/design/focused-habit-detail/`. Final comparisons use `action-final.png`, `reflection-final.png`, `completed-fixed.png`, `history.png`, and `missed-sheet.png`. Supporting captures include `insights.png`, `final-day.png`, `missed-result.png`, `completed-320.png`, and `missed-sheet-short.png`.
- The original board and actual capture were displayed together in each full-view comparison. Header/stepper, fields/counters, allocation/metrics, history rows, and confirmation controls were legible at 1:1, so separate region crops were unnecessary.
- Captures use real persisted records in an isolated local API/MongoDB account. Names, streaks, dates, counts, and history length differ from illustrative reference data; no fabricated past entries or hardcoded production values were added.

## Required fidelity surfaces

- **Typography:** existing bundled Inter with regular, medium and bold weights; 19-pixel habit heading, 21-pixel question, 22-pixel result title, 15-pixel input text and compact supporting labels. Wrapping and hierarchy follow the reference; its exact font asset is unavailable.
- **Spacing/layout:** compact two-row header, four-step indicator, separated action/reflection content, rounded allocation cards, fixed bottom actions, and a bottom confirmation sheet. Result spacing was re-compared after the clipping fix. At 320 pixels, content scrolls while Back/history remain reachable; document width stays 320.
- **Colors:** existing Focused Routine charcoal tokens, green success/actions, cyan information/focus, gold allocations and coral missed states. The reflection allocation uses the same gold emphasis as the completion allocation, an intentional consistency choice.
- **Assets/icons:** installed MaterialCommunityIcons and each habit's saved icon. No raster illustrations are required by these panels; no generated artwork, screenshot-based UI, decorative SVG or emoji replacements were introduced. Individual icon stroke differences from the raster are accepted library substitutions.
- **Copy/content:** actionable labels and daily-result hierarchy match the reference. Action notes retain the existing API's 240-character maximum (not the illustrated 500); reflections allow 500. “Next reflection” follows actual scheduled weekdays. Saved action/history are read-only because the backend has no action-edit endpoint. Legacy missed allocations avoid claiming an exact deduction when only available Base RDM can move.

## Interaction and persistence verification

- Empty action/reflection validation, action save, saved-action disclosure, reflection completion, History/Insights, saved-entry expansion, and return-to-Habits navigation exercised.
- Drafts survived opening and closing History. Completed records survived reloading. Future commitments exposed no daily mutation controls.
- Miss cancellation changed neither history nor balances. Confirmation recorded exactly one missed day, displayed the Remorse result, and removed further daily settlement controls.
- Isolated API assertions passed: Base remained 456 after the already-funded commitments; Reward increased from 4 to 6 through two separate 1 RDM reflections; Remorse increased from 0 to 1. Each action had exactly one ledger entry, with the established negative-amount/incoming convention retained for Remorse.
- A 20-day commitment retained 19 RDM after its first reflection. One-day completed and missed commitments each retained zero, one history entry, and the correct outcome despite deactivation. Upcoming commitment retained 2 RDM and no history.
- Japanese Wisdom remained accessible with canonical non-restrictive wording and disabled bonuses. Its existing habit check-in, reflection and history semantics are preserved.
- Browser error logs: none during verification.

## Regression checks and gaps

- `pnpm test`: 88 passed, including ten new habit presentation tests.
- Native and workspace TypeScript checks, `pnpm build`, and `git diff --check`: passed.
- Expo iOS and Android production bundles exported successfully.
- UI verification was browser-driven native-web coverage, not a new automated device test suite. Physical keyboards, native hardware Back/gestures, screen readers, large accessibility text and device system insets were not physically tested.
- Previous Habits list/browser/form QA is archived at `docs/design/focused-habits/design-qa.md`.

## Implementation checklist

- [x] Four connected screens with persistent data and explicit missed-day confirmation.
- [x] Reference comparison, visual fixes and post-fix captures.
- [x] Scheduled/legacy settlement rules and Japanese Wisdom preserved.
- [x] Final-day, missed-day, upcoming, timezone and custom-weekday regression coverage.
- [x] Local preview retained; no commit, push, master changes or environment-file edits.
- [x] Temporary viewport override reset before handoff.

final result: passed
