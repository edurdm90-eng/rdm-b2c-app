# Focused Routine — entry, Home, and Wallet

Source: the user's supplied “RDM / Focused Routine — 01 Welcome, home & wallet” image, saved alongside this document as `reference.png`.

## Requested scope

- Redesign the native app's sign-in, create-account, Home, and Wallet screens using the reference's dark surfaces, green calls to action, type hierarchy, and compact rows.
- Retain Japanese Wisdom even though it is absent from the reference.
- Make Wallet's Recent activity foldable with a chevron.
- Add “Sponsor a student's school supplies” and “Donate for lake/river cleanup”, each costing 5 RDM exclusively from Remorse.
- Preserve real authentication, the existing 500 RDM signup airdrop, persistent records, and mobile navigation safe areas. Reference balances and names are illustrative, not application fixtures.
- Work on v2; do not modify master or push.

## Implemented behavior

Scoped visual tokens avoid restyling the screens the user has not supplied yet. Home obtains due daily reflection counts from saved schedules and time zones, retains today's completed final-day commitments, excludes future dates after goal closure, and links to the existing habit/goal flows. Japanese Wisdom and account/invite/badge/leaderboard access remain available. Wallet shows real purse balances and explicitly labels transaction destinations; missed allocations enter Remorse even where historical ledger amounts are negative.

## Pending decision — not completed

The user was asked whether donations should be recorded as in-app RDM contributions with later team distribution, or remain disabled until external payout integration exists. No answer has arrived. Both cause cards are present but disabled, with explicit no-debit wording. No donation settlement endpoint or financial transfer has been enabled; the pre-existing external charity endpoint remains unavailable. Do not describe this as completed donation functionality.

The proposed new API/mobile regression scope and review baseline (the starting v2 commit `0fe9032`) were also offered for confirmation. Existing regression tests and manual native-web checks ran; no new test seam was assumed approved.
