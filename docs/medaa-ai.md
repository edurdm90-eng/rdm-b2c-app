# Medaa Ai

Medaa is a structured, **goals-only** journey inside AI-Guided. The user's 1-, 2-, or 3-year ambition is unfunded planning context, never a years-long funded goal. Games and group goals are unchanged.

## Journey

1. Choose a horizon and describe the long-term ambition/category. These steps do not call OpenAI.
2. Explicitly request up to three **alternative** measurable goal suggestions. Each includes a target, rationale, practical steps, and a short daily reflection question.
3. Select one or two goals whose combined pledges fit the available Base Purse. Medaa has no new habit-generation, habit-creation, or “Write my own goal” UI. Manual creation remains in the normal Goals and Habits tabs.
4. Review the target, start date, exclusive end date, daily RDM pledge, total, and remaining plan budget. Only **Set Goal** creates and funds the normal Goal record.
5. Continue daily reflections and progress in Goals, without daily AI requests. The saved Medaa plan links to the created records.

## Duration and affordability

New Medaa goals last **1–90 calendar days**. The model considers 45, 60, or 90 days when suitable; none is a mandatory minimum. A low balance must produce a smaller realistic milestone, not the same large target squeezed into fewer days.

New daily goals lock `durationDays × dailyPledge` from Base upfront. The minimum is **1 RDM/day**. The server supplies `remainingBaseRdm`, `dailyPledgeRdm`, and `maxAffordableDays = min(90, floor(remainingBaseRdm / dailyPledgeRdm))`. Other selected, unfunded goals count against the shared planning budget. Suggestions in an alternative batch are not added together until selected.

The server validates generated durations, review limits, selected-plan affordability, and actual funding. A review is not a reservation; Set rechecks available funds and the normal goal funding operation protects against concurrent overdrafts. Date/pledge edits do not trigger model calls. Explicit refinement can fit a smaller milestone to the current budget without silently changing the selected daily rate.

With no affordable day, the app saves an explanation and keeps existing drafts; it makes no paid model call and does not fund a goal. It never substitutes fake suggestions or grants RDM to bypass funding.

## Normal goal lifecycle and compatibility

New mobile manual goals and Medaa goals share daily funding and reflection. A recorded daily reflection releases that day's allocation to Reward. An elapsed unreflected day settles to Remorse. Remaining allocations stay locked; completion never pays the whole pledge a second time. Final outcome/progress and daily settlement are separate. Early completion is unavailable while future daily allocations remain; explicitly marking a daily goal missed settles its remaining allocations to Remorse after confirmation.

Existing whole-outcome goals retain their original amount, dates, and settlement rule. Existing habits are not converted or deleted. Old, unsubmitted Medaa goal reviews must be reviewed again under daily terms. Frozen approved goal retries preserve the exact original funding mode. Legacy habit recovery is limited to already-backed attempts; Medaa cannot fund a new habit from an old suggestion.

## Configuration, cost, and privacy

The existing ignored server environment provides `OPENAI_API_KEY`, `OPENAI_MODEL` (default `gpt-5-mini`), and `MEDAA_DAILY_REQUEST_LIMIT` (default 30/account/UTC day). Do not place keys in client variables or Git. No model or key change is required by this feature.

Generation remains explicit, cached, limited to 12 requests per journey, and guarded by a server lease and saved request identifiers. A request has a 30-second timeout and a 3,000-token output ceiling; no automatic paid retries or tool calls are used.

OpenAI receives bounded ambition/category/horizon, the server action, relevant goal draft summaries, date/timezone, and **the limited planning budget**. It does not receive full wallet ledgers, journals, reflections, credentials, or other users' records. `store: false` is not a promise of zero provider retention. The app persists its own journey and financial records in `rdm-business`.

## Verification

Run `pnpm check-types`, `pnpm test`, and `pnpm --filter server test:integration`. Integration tests start an isolated local MongoDB and override the database URL before imports; they never use the existing app database. Provider tests replace only external HTTP, use fake test credentials, and make no paid requests. `RDM_TEST_MONGOD` can identify the local MongoDB binary.

API coverage includes goals-only enforcement, low/zero budgets, combined selection costs, daily funding/reflection, missed-day settlement, duplicate/concurrent requests, frozen approvals, ownership, cached suggestions, and legacy records. Live model quality and authenticated mobile/device usability require separate acceptance checks; automated fixtures do not establish those.

Historical implementation reports remain in `medaa-journey-review.md`, `signup-medaa-fix-review.md`, and `medaa-short-commitment-review.md` and describe their respective versions, not today's policy.
