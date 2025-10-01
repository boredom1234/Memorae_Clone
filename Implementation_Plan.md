# WhatsApp-Based Memorae Clone - Implementation Plan

## Architecture Overview

**Core Components:**

- **WhatsApp Interface**: Baileys library for WhatsApp Web connection
- **Backend**: Node.js + Fastify API
- **Database**: Supabase (PostgreSQL)
- **Job Scheduler**: BullMQ for reminder execution
- **AI Layer**: Vercel AI SDK + Groq Whisper + Mistral OCR
- **Calendar APIs**: Google, Outlook, Apple integrations

## Detailed Implementation Plan

### 1. **Project Setup & Architecture** (In Progress)

- Initialize Node.js project with TypeScript
- Set up project structure:
  ```
  /src
    /services (whatsapp, ai, calendar, scheduler)
    /controllers (message handler, tool executor)
    /models (database schemas)
    /utils (parsers, validators)
    /config
  ```
- Configure environment variables (API keys, DB credentials)
- Set up Fastify server with middleware

### 2. **WhatsApp Integration (Baileys)**

- Implement QR code authentication flow
- Handle incoming messages (text, voice, images)
- Message queue management
- Session persistence
- Multi-device support
- Error handling and reconnection logic

### 3. **Database Schema (Supabase)**

**Tables:**

- `users` (whatsapp_id, timezone, language, settings)
- `reminders` (id, user_id, title, time, recurrence, priority, status)
- `lists` (id, user_id, name, description)
- `list_items` (id, list_id, content, position, completed)
- `calendar_connections` (user_id, provider, tokens)
- `notification_history` (id, user_id, type, content, status)

### 4. **Core Reminder System + BullMQ**

- Implement all 7 reminder management tools from CSV
- BullMQ job creation for scheduled reminders
- Recurring reminder logic (cron patterns)
- Priority-based queue processing
- Timezone handling
- Snooze and completion workflows

### 5. **AI/NLP Integration**

- **Intent Detection**: Parse user messages to identify actions
  - "Remind me to..." → createReminder
  - "Add milk to shopping list" → addItemToList
  - "What's on my schedule?" → getUpcomingReminders
- **Natural Language Date Parsing**: Extract dates/times from text
- **Vercel AI SDK**: Tool calling for function execution
- **Context Management**: Maintain conversation state

### 6. **Voice & Image Processing**

- **Groq Whisper**: Transcribe voice notes to text
- **Mistral OCR**: Extract text from images
- **Image Analysis**: Detect tasks, dates, contacts from photos
- Auto-suggest reminders from extracted content

### 7. **List Management**

- Implement all 7 list management tools
- CRUD operations for lists and items
- Smart list detection (shopping, todo, etc.)
- Bulk operations support

### 8. **Calendar Integration**

- **Google Calendar**: OAuth2 flow + event sync
- **Outlook**: Microsoft Graph API integration
- **Apple Calendar**: CalDAV protocol
- Bidirectional sync (import events → create reminders)
- Event creation from reminders

### 9. **User Settings & Notifications**

- User preferences (timezone, language, quiet hours)
- Notification delivery via WhatsApp
- Reminder sharing with contacts
- Custom message formatting

### 10. **Testing & Deployment**

- Unit tests for core functions
- Integration tests for WhatsApp flow
- BullMQ job testing
- Deploy to Vercel (serverless functions)
- Redis setup for BullMQ (Upstash/Railway)
- Monitoring and logging

## Key Technical Decisions

### Message Flow

```
User WhatsApp Message → Baileys → Fastify Handler →
AI Intent Detection → Tool Selection → Tool Execution →
Response Generation → WhatsApp Reply
```

### Tool Execution Pattern

- Use Vercel AI SDK's tool calling feature
- Map CSV tools to TypeScript functions
- Validate parameters with Zod schemas
- Return structured responses

### Scheduler Architecture

- BullMQ with Redis backend
- Separate queues for different priorities
- Retry logic for failed notifications
- Recurring job management with cron

### Security Considerations

- End-to-end encryption (WhatsApp native)
- Secure OAuth token storage (Supabase encrypted fields)
- API key management via environment variables
- Rate limiting on endpoints
