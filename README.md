# Memorae Clone (Server)

Fastify + TypeScript backend for a WhatsApp-based AI reminder/notification assistant.

## Quick Start

Run these inside `server/`:

```bash
npm install
cp .env.example .env   # or copy manually on Windows
npm run dev
```

## Env (minimal)

- `PORT`, `HOST`
- `AI_PROVIDER` and the matching API key (e.g., `OPENAI_API_KEY`, `GROQ_API_KEY`)
- `WHATSAPP_SESSION_PATH`
- `WHATSAPP_ALLOWED_NUMBERS`

See `server/.env.example` for all options.

## Scripts (server/)

- `npm run dev` – watch & run `src/index.ts`
- `npm run build` – compile TypeScript
- `npm start` – run built server
- `npm run lint` – lint sources

## API (overview)

- `GET /health`
- `GET /api/v1`
- `POST /api/v1/whatsapp/send`
- `GET /api/v1/whatsapp/status`
- `POST /api/v1/notifications/send-reminder-to-contact`
- `GET /api/v1/notifications/history`
- `POST /api/v1/notifications/send-custom`

## Tech

- Fastify, TypeScript, Baileys (WhatsApp), Vercel AI SDK, Supabase client
- Mistral AI Pixtral (OCR/Vision)

## Features

### 📸 Image OCR Support

Send images via WhatsApp to extract text using Mistral AI's vision model:

- **Simple extraction**: Send image without caption to extract all text
- **Smart processing**: Send image with caption (e.g., "Create reminders from this list") to process extracted content
- **Supported formats**: JPEG, PNG, WebP, GIF, BMP
- **Use cases**: Shopping lists, to-do items, receipts, business cards, meeting notes

See [OCR_FEATURE.md](./OCR_FEATURE.md) for detailed documentation.

**Setup**: Add `MISTRAL_API_KEY` to your `.env` file.

## AI Tool-Calling Architecture

### Hallucination Prevention

The system implements multiple layers to ensure precise tool-calling and prevent AI hallucinations:

#### 1. **Tool-Calling Guarantees**

- **No action claims without tool results**: If an action intent is detected but no tools are executed, the system asks for clarification instead of trusting the AI's text response.
- **Server-side time parsing**: All time/date parsing happens server-side using the user's timezone as the single source of truth. The AI can provide `naturalTimeText` (e.g., "tomorrow at 3pm") which is parsed by `UtilityService.parseNaturalLanguageDate()`.
- **Automatic future-time enforcement**: Times that have passed are automatically rolled forward (e.g., "3pm" when it's 4pm becomes "tomorrow at 3pm").

#### 2. **Disambiguation Flow**

When multiple items match a search query:

- Tools return `{ needsSelection: true, candidates: [...] }`
- System presents a numbered list to the user
- User replies with a number (e.g., "1", "2") to select
- Selection state is stored in `ConversationContext.candidateItems`

Example:

```
User: "Delete my reminder"
AI: "I found multiple reminders. Which one do you want to delete?

1. Call dentist - 2025-10-05 3:00 PM
2. Team meeting - 2025-10-06 10:00 AM

Reply with the number of your choice."
User: "1"
AI: [Deletes reminder #1]
```

#### 3. **Confirmation Flow**

For destructive actions (especially recurring reminders):

- Tools return `{ needsConfirmation: true, message: "...", action: "...", targetId: "..." }`
- System asks user to confirm with "yes" or "no"
- Confirmation state is stored in `ConversationContext.needsConfirmation`

Example:

```
User: "Delete my daily standup reminder"
AI: "This is a recurring reminder. Are you sure you want to delete it? Reply 'yes' to confirm."
User: "yes"
AI: [Deletes recurring reminder]
```

#### 4. **Intent-Based Tool Restriction**

- `UtilityService.detectIntent()` pre-classifies user intent
- `ToolsRegistry.getAISDKToolsSubset()` provides only relevant tools for that intent
- Prevents the model from choosing wrong tools or hallucinating capabilities

#### 5. **Semantic Validation**

- Titles are normalized (trim, collapse whitespace)
- Empty or meaningless updates are rejected
- Deduplication prevents identical tool calls within the same request

### Time Parsing Flow

```typescript
// Client sends natural language
User: "Remind me to call mom tomorrow at 3pm";

// AI extracts intent and calls createReminder with naturalTimeText
createReminder({
  title: "call mom",
  naturalTimeText: "tomorrow at 3pm", // or reminderTime as ISO
});

// Server parses using user's timezone
const parsed = utilityService.parseNaturalLanguageDate({
  text: "tomorrow at 3pm",
  timezone: "America/New_York", // from user settings
});

// Server picks best date (highest confidence, soonest future)
const bestDate = utilityService.pickBestDate(parsed.extractedDates);

// Server ensures future time
const finalTime = utilityService.ensureFuture(bestDate, timezone);

// Reminder created with server-parsed time
```

### Observability

The system logs:

- Tool usage per turn (`__stats` on tool objects)
- Disambiguation and confirmation prompts
- Failure reasons (tools missing, invalid time, not found)
- Intent detection results with confidence scores

## License

MIT
