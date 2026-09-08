# Signup Airdrop and Medaa Progress Review

Baseline confirmed by the user: `22ecd2ccd0906d385015814aecc24fcc00d79297`. Scope: one-time 500 RDM Base signup grant and the first-horizon/revision-conflict bug. Automated tests were limited to API boundaries as requested.

## Standards

No documented-standard breaches or actionable code-smell findings. The grant has focused allocation/recovery tests, an atomic wallet receipt, server-owned eligibility, and sanitized failure handling. The native cache uses one shared revision guard for query and mutation responses. No generated files or secret configuration changed.

Standards findings: **0**; no outstanding Standards issue.

## Spec

New accounts receive 500 Base RDM once; repeated sign-ins do not refill spent funds. Existing accounts remain unchanged. A failed grant can recover through a subsequent session or profile request using the same receipt.

Delayed older journey responses no longer replace newer saved state. Equal-revision updates remain accepted, and genuine conflicts are not bypassed. All three horizons advanced correctly under the network conditions that reproduced the original failure.

Spec findings: **0**; no outstanding Spec issue.

## Reproduction and verification

The fast local connection did not reproduce the bug. A disposable HTTP proxy delayed conversation GET responses by 750 ms and horizon mutation forwarding by 150 ms. Before the fix, revision 1 / long-term arrived before revision 0 / horizon; the screen rolled back and the next click returned 409. After the fix, the same response ordering preserved step two, and the next ambition save succeeded at revision 2. The proxy and disposable database were removed afterward.

- API signup cases followed red → green, including a real database-boundary failure and concurrent retry recovery.
- The Medaa API test guards revision/idempotency contracts; it is not claimed to reproduce the client race. The client race and signup wallet display were checked manually in native web, with no UI suite or paid model calls.
- Passed: 72 unit/provider tests, 35 isolated integration tests, strict type checks, production builds, and Expo Android/iOS/web exports.
- The normal server configuration was restored, and native web was left at the login screen on port 8081. Physical-device acceptance remains separate from web verification and native export success.

Summary: **Standards 0; Spec 0.** No outstanding issue within either reviewed axis.
