# Focused Routine design QA

## Evidence and normalization

- Source visual truth: `docs/design/focused-routine/reference.png`, copied unchanged from the user's supplied clipboard image (1619 × 971 pixels).
- Source mobile panels: approximately 366 × 829 pixels each; their surrounding board is not app content.
- Implementation: existing Expo native application at `http://localhost:8081`, against an isolated local MongoDB and API, never the live database. Main comparison viewport 366 × 829 CSS pixels, devicePixelRatio 1; captures are 366 × 829. Narrow checks use 320 × 740, also density 1.
- Captures: `docs/design/focused-routine/login.png`, `signup-final.png`, `home-final.png`, `wallet-expanded.png`, `wallet-collapsed.png`, plus narrow captures and the initial signup state.
- Full-view comparisons emitted the original reference and each browser capture together in one comparison input. Scroll-position-mismatched captures were rejected and Home was recaptured at the top.
- Focused review covered signup heading/inputs, wallet rows/chevrons, Home ring/CTA, and auth footer. Separate crop comparisons were unnecessary: these controls and their text remained legible at the source and capture resolutions.
- Reference names, tree age, balances, and next actions are illustrative. Verification used an account created through the real signup UI and persisted commitments in an isolated database. The extra Wisdom access, More menu, horizontal seven-tab navigation, donation cards, and variable activity length are intentional deviations.

## Comparison history

1. **P2 — Signup density:** the initial 366-pixel screen wrapped the heading and pushed the footer offscreen (`signup-initial.png`). Signup-only padding, title metrics, and form spacing were adjusted. `signup-final.png` confirms the single-line heading and visible footer at the same viewport; the 320-pixel layout remains scrollable.
2. **P2 — Nested web focus outline:** removed the browser's inner input outline only on web; retained the containing field's blue focus border.
3. **P2 — Progress-ring compatibility:** the library's animated wrapper forwarded a non-boolean `collapsable` attribute into SVG. The unwrapped, typed, static library component removes the warning. The zero-progress stroke is neutral; populated progress remains dynamic.
4. **P2 — Disclosure accessibility:** native accessibility state did not emit web expanded/selected attributes. Explicit ARIA attributes now accompany native props. Browser state confirms Recent activity expands/collapses and the selected tab is announced.

## Required fidelity surfaces

- **Typography:** bundled Inter regular/semibold/bold; strong sans-serif titles, subdued labels, compact purse rows. Signup heading wrapping fixed. The exact font file used by the raster reference is unknown; Inter is the existing app's closest available family.
- **Spacing/layout:** 22-pixel content gutters (28 on sign-in), 10-pixel control radii, compact separated rows, roughly 128-pixel ring. Phone-width forms stay inside the viewport; longer histories and additional Wisdom/donation content scroll above the persistent tab bar.
- **Colors:** scoped charcoal surfaces, green actions/Base, gold Reward, coral Remorse, purple Peer, cyan links. Other app screens retain their existing theme for later redesign.
- **Assets:** existing icon library, genuine transparent generated sprout PNG, no screenshot embedded as UI or hand-drawn decorative SVG. Minor P3: footer linework differs from the reference and is softer at phone scale.
- **Copy/content:** reference auth copy and airdrop wording retained. Counts, date, titles, tree day, balances, and transactions come from the API. No false external charity payment claim.

## Interaction and regression evidence

- Signup input validation, password visibility, Back/mode toggle, signup, sign-out confirmation, and subsequent sign-in exercised.
- A real new account received its existing 500 Base RDM airdrop. Isolated commitment funding and real reflections produced Home 2/4, then a goal reflection through the UI produced 3/4 and exactly +1 Reward (Base unchanged).
- Home's primary action opened the existing goal detail; Back returned to updated Home. Japanese Wisdom and More/account access remained available.
- Wallet purse disclosures and Recent activity open/close verified, including web expanded state. Donation controls remain intentionally disabled pending the unanswered policy decision.
- Existing 78 domain/provider tests and 59 isolated integration tests passed. `pnpm check-types` and `pnpm build` passed. No live OpenAI requests were made.
- Browser console checked. The introduced SVG warning was fixed; existing shadow-style deprecation warning remains unrelated. Temporary preview restart/network errors were resolved before functional checks.
- Physical iOS/Android keyboard, system navigation, and device safe-area verification remain unperformed; existing safe-area handling is retained. No new automated mobile test suite was added while seam confirmation is pending.

## Findings and completion gate

- **P1 / pending product decision:** the two requested donation actions cannot debit yet. Approve internal RDM contribution recording versus external payout integration before implementing settlement and its regression coverage.
- The four visual redesigns have no remaining actionable P0/P1/P2 visual mismatch in the checked native-web states. Do not hand off the overall request as finished while donation behavior remains pending.

final result: blocked
