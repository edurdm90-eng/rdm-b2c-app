# Medaa Ai

Medaa Ai is a structured journey inside **AI-Guided**, not an open-ended chatbot. It follows the reference's horizon → long-term ambition → short-term goals → supporting habits → saved plan flow. Existing daily reflection, progress, tree-care, Reward, and Remorse rules remain unchanged.

## Guided journey

1. Choose a **1-, 2-, or 3-year** horizon and define a meaningful long-term ambition with a supported category. These first two steps and local examples make **no OpenAI calls**. The long-term ambition is unfunded planning context, not another RDM commitment.
2. Tap **Get AI help** for three measurable **90–180-day** short-term goal options, then select at most **two** initially. Existing suggestions are reused when reopening the step; only an explicit regeneration asks for another batch.
3. **Add Goal** opens an editable review form. Fixed refinement buttons can make a draft simpler, more specific, or less time-consuming; there is no free-text chat/refinement prompt.
4. Explicitly request supporting habits, review their proposed cadence, and use **Add Habit** to confirm one. Suggestions support the ambition and relevant selected/created goals.
5. View the actual created items together, then add more manually or skip. The plan permits at most **three goals and three habits per journey**, not an account-wide limit. Legacy chats remain readable but cannot send new messages or be submitted as model context.

Only the explicit **Set Habit** or **Set Goal** action creates and funds a confirmed item. The user chooses at least **1 RDM**: a goal locks its whole confirmed pledge; a habit locks its daily pledge multiplied by the scheduled dates. Dates are **start-inclusive and end-exclusive**. The backend calculates exact dates, affordability, and totals before confirmation. Selecting a suggestion, saving a planning direction, and reviewing a card do not spend RDM. No automatic renewals are created.

## Server configuration

Add your existing key to the ignored `apps/server/.env`, then restart the server:

```dotenv
OPENAI_API_KEY=your-private-key
OPENAI_MODEL=gpt-5-mini
MEDAA_DAILY_REQUEST_LIMIT=30
```

Never put the key in an `EXPO_PUBLIC_`/`VITE_` variable, the mobile bundle, Git, or chat. `apps/server/.env.example` contains configuration names only. With no key, the app still starts and manual journey steps remain usable; AI actions report unavailability rather than producing mock answers.

The default uses the documented older `gpt-5-mini` API model, not an assumed `5.3 mini` alias. Change `OPENAI_MODEL` only to a model your project can access that supports Responses, strict structured outputs, and minimal reasoning. There is no silent model fallback. See [GPT-5 mini](https://developers.openai.com/api/docs/models/gpt-5-mini) and [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs).

## Persistence, cost, and privacy

- Journey state, draft versions, reviews, requests, and created-item links persist in MongoDB database `rdm-business`. Reloading resumes saved progress; users access only their own records. Server validation controls categories, dates, schedules, confirmed RDM amounts, affordability, and creation.
- The native cache keeps the newest revision for each journey. A delayed background read cannot roll back a successful save; genuine server-side revision conflicts still require refreshing the saved state.
- AI runs only after an explicit suggestion, regeneration, or fixed refinement action. The server allows **12 generations per journey** and **30 requests per account per UTC day** by default. Reopening a saved batch does not generate it again.
- Each provider call has a **30-second timeout**, minimal reasoning, and a **3,000-token output ceiling** including reasoning. There is no automatic provider retry or paid tool call.
- OpenAI receives only the bounded ambition (12–300 characters), selected horizon/category, fixed action, up to **30 relevant draft summaries**, and app date/timezone/rules. It receives **no chat history, wallet/RDM values, journals, reflections, authentication details, or other users' records**. User-entered ambition and draft content are necessarily included; do not enter secrets there.
- The adapter rejects missing structured actions, non-empty chat history, oversized context, invalid refinement targets, malformed results, wrong suggestion types/counts, and unexpected tool calls. Unsafe/off-topic ambitions produce a brief explanation and no suggestions, not an open conversation.
- Requests use `store: false`; this is not a promise of zero retention by OpenAI. Consult the project's applicable provider data controls. The app persists its own journey records.
- Retries use saved request/creation identifiers. Model text never proves creation or authorizes spending. Errors preserve drafts and return sanitized messages; raw provider bodies, secrets, and input content are not logged by the adapter.
- If a submitted Set attempt is interrupted across a date rollover, recovery requires the same frozen review and a new acknowledgement of the original dates and any missed-day settlement. A stored, exact-match approval is required; arbitrary past-dated new commitments remain rejected. Recovery never shifts the schedule or creates a new pledge identifier.

## Reference adaptations

The Add screens include date and RDM confirmation missing from the visual reference. Existing supported app categories are used instead of introducing a new Career category. The reference's reminder-time control is omitted because the app does not yet implement reminder delivery; no nonfunctional notification control is shown. Goal pledges still settle on the goal outcome, while habits settle each scheduled day after action and reflection.

## Verification

Run `pnpm check-types`, `pnpm test`, and `pnpm --filter server test:integration` from the repository root. Database integration tests use an isolated local MongoDB. Provider regressions run with `pnpm --filter server exec tsx --test tests/medaa-provider.test.ts` (also included in `pnpm test`): they exercise the real adapter and replace only external HTTP using a fake credential, not the prompt/parser/business-rule implementation. They cover compact fixed-action inputs, secret preflight, invalid outputs, refinements, sanitized errors, timeout, and missing-key behavior. Production never returns fixture suggestions.

Set `RDM_TEST_MONGOD` to your local `mongod` executable if it is not on PATH. The database fixture uses the real API and wallet logic, an injected model boundary, and no OpenAI credential. Medaa persistence cases cover initial/extra goal limits, saved suggestions and refinements, rejected requests, daily admission, 1 RDM/day and exclusive end dates, insufficient funds, repeated/concurrent Set, and confirmed recovery across date rollover.

The current implementation passed **72 unit/provider tests**, **35 integration tests**, workspace type checks, production builds, and Expo exports for Android, iOS, and web. See [the original implementation review](medaa-journey-review.md) and [the signup/race-fix review](signup-medaa-fix-review.md) for scope and remaining live checks.

After adding the key, manually verify: no AI call during horizon/ambition entry, fixed suggestions and refinements, unsafe/off-topic ambition handling, cached suggestions, generation limits, insufficient Base RDM, repeated Set taps, plan limits, resume/back navigation, and connection interruption. Type checks or deterministic fixtures cannot establish live model quality or account access. Live OpenAI calls incur usage; no paid request was made during keyless implementation.
