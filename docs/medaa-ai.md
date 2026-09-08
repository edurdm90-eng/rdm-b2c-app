# Medaa Ai

Medaa Ai lives inside **AI-Guided** in the native app. It helps refine an intention, suggests an editable habit or goal, and hands off to the existing commitment system. Chatting, accepting a suggestion, and reviewing a card do not spend RDM. Only the explicit **Set Habit** or **Set Goal** action can create and fund the confirmed item. Existing reflection, progress, tree-care, Reward, and Remorse rules remain unchanged.

## Server configuration

Add your existing key to the ignored `apps/server/.env`, then restart the server:

```dotenv
OPENAI_API_KEY=your-private-key
OPENAI_MODEL=gpt-5-mini
MEDAA_DAILY_REQUEST_LIMIT=30
```

Never put the key in an `EXPO_PUBLIC_`/`VITE_` variable, the mobile bundle, Git, or chat. `apps/server/.env.example` contains configuration names only. An absent key does not prevent the rest of the app from starting; Medaa Ai reports that it is not configured instead of substituting mock answers.

The default uses the documented older `gpt-5-mini` API model, not an assumed `5.3 mini` alias. Change `OPENAI_MODEL` only to a model your project can access that supports Responses, strict structured outputs, and minimal reasoning. There is no silent model fallback. See [GPT-5 mini](https://developers.openai.com/api/docs/models/gpt-5-mini) and [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs).

## Persistence and safeguards

- Conversations, draft versions, reviews, and created-item links live in the application's MongoDB database, `rdm-business`. Reloading the app resumes saved work.
- Authenticated users can access only their own conversations. Server validation controls categories, dates, schedules, confirmed RDM amounts, affordability, and creation.
- Retries use persisted request and creation identifiers. Model-generated text is never proof of creation or permission to debit a purse.
- Requests are limited per account per UTC day (30 by default). Each provider call has a 30-second timeout, minimal reasoning, and a 3,000-token output ceiling including reasoning. No automatic provider retry or paid tool call is made.
- The complete saved conversation (at most 100 messages of 2,000 characters each) and up to 30 draft summaries, plus supported app rules/date/timezone, are sent to OpenAI. Initial intentions and constraints are not silently truncated. Oversized input is rejected. Wallet amounts, journals, reflections, authentication details, and other users' records are not included. Anything the user writes into chat is necessarily included in that conversation context.
- Requests use `store: false`; this is not a promise of zero retention by OpenAI. Consult the project's applicable provider data controls. The app stores its own conversation history.
- Refusals, malformed/incomplete outputs, unexpected tool calls, network failures, and provider errors leave drafts intact and return sanitized messages. API keys, raw provider responses, and conversation bodies are not logged by the adapter.

## Verification

Run `pnpm check-types`, `pnpm test`, and `pnpm --filter server test:integration` from the repository root for the existing repository checks. Existing database integration tests use an isolated local MongoDB. Medaa-specific automated provider and persistence tests have not yet been added; their test boundary is awaiting confirmation. Proposed tests will replace only the external model/HTTP boundary; production never returns fixture suggestions.

Automated persistence tests do not establish real-model answer quality or account/model access. After adding a key, manually verify a vague request, a specific habit, goal refinement, insufficient Base RDM, repeated Set taps, navigation/reload, and a connection interruption. Live OpenAI calls incur provider usage; no live paid call was made during the keyless implementation.
