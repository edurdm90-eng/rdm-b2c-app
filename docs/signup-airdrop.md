# Signup Airdrop

New accounts receive **500 RDM in the Base Purse**. Reward, Remorse, and Peer balances remain zero; no habits, goals, tree, XP, or badges are seeded. The wallet records one `Welcome airdrop` transaction.

Eligibility is marked by the server when the auth account is created. Clients cannot submit or update this flag, and it is omitted from public user responses. Existing accounts are not backfilled, including accounts with an empty wallet.

The signup session credits the airdrop using the stable `signup-airdrop:<userId>` operation. The balance increment, operation receipt, and transaction are recorded atomically in the profile. Later sign-ins and concurrent requests cannot grant it again or refill spent RDM.

If the credit fails after account creation, signup still succeeds. Eligibility remains pending; a later session or profile access retries the same operation. Failures log a generic message without exposing auth or database details.

## Verification

The isolated API suite covers new registration, concurrent sign-ins after spending, recovery from a real database-boundary failure, missing-profile recovery, legacy accounts, client eligibility tampering, and invalid/duplicate signup. Run:

```sh
RDM_TEST_MONGOD=/path/to/mongod pnpm --filter server test:integration
```

No backfill command or administrative top-up endpoint is introduced.
