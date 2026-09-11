# Japanese Wisdom

The native app has a dedicated **Japanese Wisdom** destination, labelled **Wisdom** in the bottom navigation. On narrow screens, swipe the tab bar to reach all seven destinations. Screen 10 of `RDM_Grow_Habits_Wisdom_Family_Update.html` supplies the visual reference. This release includes only **Hara Hachi Bu**; it adds no AI calls, subscriptions, or other practices.

## Commitment and reflection

Setup uses the normal habit system with a server-validated `hara-hachi-bu` practice identifier. The practice text and every-day schedule are fixed; users choose dates and a whole daily RDM pledge, starting at 1 RDM. The reviewed total is locked from Base only after explicit confirmation. Dates include the start and exclude the end, using the saved commitment time zone.

An action check-in followed by an honest reflection releases that day's allocation to Reward. An explicit miss or elapsed unreflected day releases its allocation to Remorse. Past Reward remains unchanged. The same canonical habit appears in Habits and Japanese Wisdom, sharing settlement, history, and tree-care records rather than issuing duplicate rewards.

The exercise rewards reflection, not food quantity, calories, weight, or restriction. Reflections may describe difficulty. Content reminds users to follow their individual nutritional needs and professional guidance.

## Bonus policy

The owner explicitly approved **leaving bonus payouts disabled**. Each Wisdom habit records `disabled-v1`; neither client input nor perfect consistency enables a payout. No bonus amount or funding source is configured.

Perfect consistency is reported only after the exclusive end date, with every scheduled day completed, every allocation settled, and no misses. A later recovered streak does not erase a missed day. This status is informational, not an entitlement to additional RDM. Enabling bonuses requires a separately approved amount, funding source, and enrollment policy; existing disabled commitments must not be silently reinterpreted.

## Verification

Run `pnpm test`, `pnpm check-types`, and `pnpm --filter server test:integration`. Focused persistence cases are named `Japanese Wisdom…` and run against an isolated temporary MongoDB. They cover canonical terms, duplicate requests, Base-only funding, reflection settlement, misses, disabled bonuses, date boundaries, and interruption recovery.

For UI acceptance, use an isolated account/database: open Wisdom, configure a commitment, inspect/cancel confirmation, confirm funding, reflect, revisit both tabs, reload, and check the saved balances/history. Exercise navigation at narrow mobile widths. Native-web checks do not replace physical-device safe-area and gesture testing.

### Mobile UI acceptance — 2026-09-11

Verified the Expo native-web app at 390×844 and 320×740 with an isolated account and database:

- Only Hara Hachi Bu is offered; all seven navigation destinations are reachable without horizontal page overflow.
- Insufficient Base disables review. The confirmation shows dates, saved time zone, daily amount, total, and disabled bonus policy before funding.
- A three-day commitment at 1 RDM locks 3. An honest difficult-day check-in and reflection releases 1 to Reward, leaving 2 locked, a one-day streak, and persisted reflection history after reload.
- The same commitment appears once in both Habits and Wisdom. A separate one-day missed commitment releases 1 to Remorse without changing earlier Reward; no bonus transactions appear.
- Direct-linked setup/detail pages return safely to Wisdom when no back history exists. Finished missed commitments show that all allocations are settled.

The back-navigation warning found during testing was fixed and retested. No new runtime errors remained in the tested flow; existing React Native Web shadow-style deprecation warnings remain. These were interactive browser checks, not physical Android/iOS tests or a committed automated UI suite.
