# Study Lamp — User-Owned AI Integration Roadmap

## Purpose

Build AI features for Study Lamp without locking the application to a single AI provider or a developer-owned API key.

### Core product direction

The long-term architecture is:

Application
→ AI Service
→ AI Router
→ Provider Adapter
→ User's AI Connection
→ AI Provider

The first implementation should support **Gemini only**, using a **user-provided Gemini API key**.

The architecture should remain provider-agnostic so OpenAI, Anthropic, or other providers can be added later without rewriting the application's AI features.

---

# Guiding Principles

1. **User-owned AI keys from day one**
   - The user provides their own API key.
   - Study Lamp does not need to pay for users' AI usage.
   - Do not hardcode a developer-owned AI key as the foundation.

2. **Gemini first, not Gemini forever**
   - Implement Gemini initially because it is the first intended provider.
   - Do not make application code directly dependent on Gemini.
   - Keep a clean AI abstraction seam.

3. **Server-side secrets only**
   - Raw API keys must never be exposed to browser/client code.
   - Never store AI keys in `localStorage` or `sessionStorage`.
   - Never use a `NEXT_PUBLIC_*` environment variable for a user API key.
   - Never log raw API keys.

4. **Design for multiple connections, implement incrementally**
   - The data model should support multiple connections.
   - The MVP can initially expose one connection if that keeps the implementation simple.
   - Multiple-key fallback comes later.

5. **Do not overbuild**
   - Do not implement multiple providers, quota prediction, embeddings, AI agents, or complex analytics before the first AI feature works.
   - Add infrastructure only when the application actually needs it.

6. **Preserve existing application behavior**
   - AI should integrate with existing video/summary functionality.
   - Do not create a parallel summary system unnecessarily.
   - Existing manual summary editing and saving must continue to work.

---

# Phase 0 — Repository Inspection and Architecture Decisions

**No code changes.**

This phase is not about finding existing Gemini code because Study Lamp currently has no AI integration.

## Inspect the existing application

Review:

- Next.js/TypeScript structure
- Firebase authentication
- Firebase Admin usage
- existing API route conventions
- Firestore structure and security rules
- `/settings` structure
- video pages
- existing Summary tab
- summary/note persistence
- `AuthProvider` and ID-token retrieval
- existing Button/loading/toast conventions
- environment-variable conventions
- existing server/client boundaries

Pay particular attention to existing patterns rather than inventing new ones.

Relevant existing areas include:

- `src/app/api/youtube-duration/route.ts`
- `src/app/api/find-user/route.ts`
- `src/lib/server/firebase-admin.ts`
- `src/lib/firestore/notes.ts`
- `src/app/video/[videoId]/page.tsx`
- `src/app/playlists/[playlistId]/[videoId]/page.tsx`
- `src/app/settings/`

## Confirm the first AI feature

The first feature should be:

> **Generate starter summary**

The feature belongs in the existing Summary tab.

Expected flow:

Video
→ Summary tab
→ Generate starter summary
→ AI service
→ user's Gemini connection
→ Gemini
→ draft returned
→ existing summary textarea/state
→ user edits
→ existing save/autosave behavior

Do not create a new summary storage system.

## Confirm initial AI input

Study Lamp currently does not store a video transcript/caption system.

Therefore the initial AI request should use only:

- video title
- optional video description

The first feature should be described as a **starter draft**, not a transcript-based summary.

Transcript/caption integration is a separate future feature.

## Decide provider

Initial provider:

**Gemini**

Do not choose a provider because the coding assistant itself is Claude/GPT/etc.

Provider selection should be based on Study Lamp's requirements, API availability, limits, cost, quality, and user experience.

## Confirm long-term architecture

Current:

AI Service
→ Gemini Adapter
→ Gemini

Future:

AI Service
→ AI Router
→ Gemini / OpenAI / Anthropic / other adapters

## Explicitly out of scope for Phase 0

Do not implement:

- Gemini integration
- OpenAI integration
- Anthropic integration
- API-key storage
- encryption code
- settings UI
- fallback
- cooldown
- quota prediction
- embeddings
- AI agents

### Phase 0 Copilot prompt

```text
I am about to add AI functionality to Study Lamp.

There is currently NO AI integration in this repository.

Before changing any code, inspect the existing repository and confirm the architecture for the first AI feature.

The intended product direction is:

1. Users should eventually provide their own AI API keys/connections.
2. Gemini is the first provider.
3. The application must not become tightly coupled to Gemini.
4. The long-term architecture should support multiple providers and multiple user connections.
5. AI API keys must remain server-side and must never be exposed to the browser.
6. The first AI feature will be "Generate starter summary" in the existing Summary tab.
7. The first version should use only the video's title and optional description because there is currently no transcript system.
8. Do not build OpenAI, Anthropic, multiple-key fallback, quota monitoring, embeddings, or other advanced AI infrastructure yet.

Inspect and report:

- the existing API/auth pattern
- Firebase Admin usage
- Firestore conventions
- existing Summary tab implementation
- existing summary persistence
- AuthProvider/token retrieval
- settings-page structure
- existing UI/loading/toast conventions
- where the AI service should live
- where the provider abstraction should live
- where user AI connections should eventually live
- which exact files should be created or modified in later phases

Do NOT modify any files in this phase.

Do NOT choose Anthropic simply because you are Claude.

End with a concrete, repository-specific implementation plan for the next phases.
```

---

# Phase 1 — Design the User AI Connection Model

**Goal:** Define the data/security contract before implementing the UI or AI calls.

Recommended Firestore structure:

```text
users/{uid}/aiConnections/{connectionId}
```

This follows the application's existing private-user-data convention.

Recommended conceptual document:

```ts
{
  provider: "gemini",
  encryptedApiKey: string,
  model: string,
  label: string,

  priority: number,
  isActive: boolean,

  status: "active" | "invalid" | "cooldown",

  cooldownUntil: Timestamp | null,

  lastUsedAt: Timestamp | null,
  lastSuccessAt: Timestamp | null,
  lastFailureAt: Timestamp | null,

  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

Do not expose `encryptedApiKey` to the client.

## Important MVP decision

The schema should support multiple connections, but the first UI does not need to implement the complete multi-key management experience.

The implementation should avoid creating unnecessary complexity before the first AI request works.

## Security design

Preferred flow:

User enters API key
→ authenticated server endpoint
→ validate
→ encrypt
→ Firestore

AI request:

Authenticated request
→ server
→ load connection
→ decrypt key
→ Gemini API

The browser never receives the decrypted key.

---

# Phase 2 — Secure AI Connection API

Create server-side API endpoints using the same authentication conventions already used by the application.

Potential API surface:

```text
POST   /api/ai/connections
GET    /api/ai/connections
PATCH  /api/ai/connections/:id
DELETE /api/ai/connections/:id
POST   /api/ai/connections/:id/test
```

The exact route structure should follow the repository's conventions after Phase 0 inspection.

## Requirements

- authenticate the Firebase user
- verify ownership
- validate provider/model/label
- encrypt API key before storage
- never return the raw key
- never log the raw key
- return masked key information only
- prevent one user from accessing another user's connections

Example safe response:

```ts
{
  id,
  provider,
  model,
  label,
  status,
  maskedKey
}
```

Never return:

```ts
apiKey
decryptedApiKey
```

---

# Phase 3 — AI Settings UI

Use the existing `/settings` architecture if appropriate.

The UI should allow the user to add a Gemini connection.

Example:

```text
AI Settings

[ Add AI Connection ]

Provider
[ Gemini ]

API Key
[ **************** ]

Model
[ Gemini model ]

Label
[ My Gemini ]

[ Test Connection ]
[ Save ]
```

Connection display:

```text
Gemini
My Gemini
Model: ...
Status: Active
Key: ••••••••abcd

[Test] [Edit] [Disable] [Delete]
```

Do not display the complete API key after saving.

## UX requirements

- clear explanation that the user is providing their own API key
- clear indication that AI requests are sent to the selected provider
- loading state during save/test
- friendly error messages
- no raw key in error messages
- no silent failure

---

# Phase 4 — AI Abstraction + Gemini Adapter

Create the first provider implementation.

Conceptually:

```text
AI Service
    ↓
Gemini Adapter
    ↓
Gemini API
```

The application should not import or call a Gemini SDK directly from video components.

Use an abstraction such as:

```ts
generateText(...)
```

or, preferably for the application domain:

```ts
generateVideoSummary(...)
```

The exact naming should follow the repository after inspection.

## Responsibilities

### AI service

- application-facing API
- provider-independent behavior

### Gemini adapter

- Gemini request format
- Gemini authentication
- Gemini model handling
- Gemini response parsing
- Gemini-specific error translation

---

# Phase 5 — Generate Starter Video Summary

Now connect the first real AI feature.

Existing video Summary tab:

```text
Summary

[ Generate starter summary ]

[ existing textarea ]
```

Flow:

```text
User clicks button
      ↓
authenticated request
      ↓
AI summary API
      ↓
load user's Gemini connection
      ↓
decrypt key server-side
      ↓
Gemini
      ↓
draft text
      ↓
existing summary textarea/state
```

The generated draft should behave like normal summary text.

The user can:

- edit it
- delete it
- replace it
- save it

Do not create a separate AI-summary Firestore field unless a future requirement explicitly needs one.

If existing summary content exists, ask for confirmation before overwriting it.

Prevent duplicate requests while a request is pending.

---

# Phase 6 — Multiple Gemini Connections

After one connection works reliably, support multiple Gemini connections.

Example:

```text
Priority 1 — Gemini Main
Priority 2 — Gemini Backup
Priority 3 — Gemini Another Backup
```

Each connection has:

```text
priority
isActive
status
```

The user can enable/disable and reorder connections.

The application should choose the highest-priority usable connection.

Do not add multiple providers yet.

---

# Phase 7 — Fallback and Cooldown

Implement automatic fallback across the user's Gemini connections.

Example:

```text
Gemini Key A
    ↓
429
    ↓
cooldown A
    ↓
Gemini Key B
    ↓
success
```

## Error classification

Fallback should generally be considered for:

- invalid/unauthorized key
- rate limit
- temporary timeout
- temporary provider/server errors

Do not blindly fallback for every error.

For example:

- malformed request
- invalid input
- unsupported model
- application bug

should not consume every configured key.

## Cooldown

When a connection is rate limited:

```text
status = "cooldown"
cooldownUntil = ...
```

The router skips that connection until it becomes usable again.

Do not build fake "remaining quota" calculations.

Use actual provider responses and conservative cooldown/backoff behavior.

---

# Phase 8 — Add OpenAI Provider

Only after Gemini + multiple-key fallback works.

Add:

```text
OpenAI Adapter
```

The application remains unchanged:

```text
generateVideoSummary(...)
```

The router chooses the provider.

Do not duplicate video-summary logic for OpenAI.

---

# Phase 9 — Add Anthropic Provider

Add:

```text
Anthropic Adapter
```

Again, the application should not need to know which provider is being used.

The architecture becomes:

```text
AI Service
    ↓
AI Router
    ├── Gemini Adapter
    ├── OpenAI Adapter
    └── Anthropic Adapter
```

---

# Phase 10 — Cross-Provider Fallback

Now support a complete priority chain.

Example:

```text
1. Gemini Main
2. Gemini Backup
3. OpenAI Backup
4. Anthropic Backup
```

Possible execution:

```text
Gemini Main
    ↓ 429
Gemini Backup
    ↓ 429
OpenAI Backup
    ↓ success
```

The application still simply asks:

```text
generateVideoSummary(...)
```

It does not know which connection eventually handled the request.

---

# Phase 11 — Security and Regression Audit

Before considering the system complete, test:

## Browser

Check Network tab:

- raw API key never appears
- decrypted key never appears
- AI requests contain only necessary input and auth information

## Storage

Check:

- no raw API key in Firestore
- no raw API key in localStorage
- no raw API key in sessionStorage

## Logs

Check:

- no API key in server logs
- no authorization headers containing keys
- no provider secret in error messages

## Authorization

Verify:

```text
User A cannot read User B's AI connections.
```

## Existing features

Verify:

- manual summary editing still works
- autosave still works
- video pages still work
- personal playlist video pages still work
- authentication still works
- existing API routes are unaffected

---

# Phase 12 — Optional Future AI Features

Only after the first AI feature is stable.

Possible future features:

## Smart search

Potentially use embeddings to improve video search.

Do not build a vector database automatically. Evaluate the simplest solution that fits the actual dataset size.

## Auto-tagging

During admin import:

```text
Video
 ↓
AI suggests tags
 ↓
Admin reviews
 ↓
Admin approves
 ↓
Tags saved
```

AI should suggest, not silently modify the library.

## Transcript-based summaries

Future flow:

```text
Video
 ↓
Transcript
 ↓
AI
 ↓
Detailed summary
```

This is separate from the initial title/description-based starter summary.

---

# What NOT to Build Early

Do not implement these before the first AI feature proves useful:

- all AI providers
- complex provider routing
- quota prediction
- token-cost optimization
- AI agents
- vector databases
- embeddings
- autonomous tagging
- large analytics dashboards
- complicated health monitoring
- automatic model benchmarking

Build the smallest useful system first.

---

# Final Architecture

## Initial version

```text
                    Study Lamp
                        │
                        ▼
                   AI Service
                        │
                        ▼
                  Gemini Adapter
                        │
                        ▼
              User AI Connection
                        │
                  encrypted key
                        │
                        ▼
                    Gemini API
```

## Future version

```text
                    Study Lamp
                        │
                        ▼
                   AI Service
                        │
                        ▼
                    AI Router
                        │
          ┌─────────────┼─────────────┐
          ▼             ▼             ▼
       Gemini         OpenAI       Anthropic
       Adapter        Adapter       Adapter
          │             │             │
          └─────────────┼─────────────┘
                        │
                User connections
                        │
              ┌─────────┼─────────┐
              ▼         ▼         ▼
          Key #1     Key #2     Key #3
```

---

# Recommended Implementation Order

```text
Phase 0
Repository inspection + decisions
        ↓
Phase 1
AI connection/security design
        ↓
Phase 2
Secure connection API
        ↓
Phase 3
AI Settings UI
        ↓
Phase 4
AI abstraction + Gemini adapter
        ↓
Phase 5
First AI feature: starter summary
        ↓
Phase 6
Multiple Gemini connections
        ↓
Phase 7
Fallback + cooldown
        ↓
Phase 8
OpenAI adapter
        ↓
Phase 9
Anthropic adapter
        ↓
Phase 10
Cross-provider fallback
        ↓
Phase 11
Security + regression audit
        ↓
Phase 12
Optional future AI features
```

---

# Important Copilot/Claude Working Rules

For every implementation phase:

1. Start a fresh AI chat.
2. Attach only the files explicitly requested by that phase.
3. Do not let the agent modify unrelated files.
4. Do not combine multiple phases into one implementation.
5. Review the diff after every phase.
6. Run the project's tests/build before moving to the next phase.
7. Commit a working phase before starting the next phase.
8. If the agent discovers that the repository differs from the roadmap, stop and report the discrepancy before making architectural changes.
9. Never expose or paste a real API key into AI chat.
10. Never commit API keys to Git.

The most important product decision is:

> **User-owned Gemini key from day one, Gemini only for the initial implementation, provider abstraction from the beginning, and multiple-provider/multiple-key fallback added incrementally.**

This avoids both extremes: being permanently tied to Gemini while also avoiding unnecessary multi-provider infrastructure before the first AI feature exists.
