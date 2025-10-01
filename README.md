# Memorae Clone - WhatsApp AI Assistant

A WhatsApp-based AI assistant for reminders, task management, and calendar integration.

## Features

- 🤖 AI-powered natural language processing
- ⏰ Unlimited recurring reminders
- 📝 Custom list management
- 🎤 Voice note transcription
- 📸 Image text extraction
- 📅 Calendar synchronization (Google, Outlook, Apple)
- 🔒 End-to-end encryption

## Tech Stack

- **Backend**: Node.js + Fastify + TypeScript
- **Database**: Supabase (PostgreSQL)
- **WhatsApp**: Baileys
- **Job Scheduler**: BullMQ
- **AI**: Vercel AI SDK, Groq Whisper, Mistral OCR

## Getting Started

### Prerequisites

- Node.js 18+
- Redis (for BullMQ)
- Supabase account

### Installation

1. Clone the repository
2. Install dependencies:

   ```bash
   npm install
   ```

3. Copy `.env.example` to `.env` and fill in your credentials:

   ```bash
   cp .env.example .env
   ```

4. Start the development server:
   ```bash
   npm run dev
   ```

### Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run lint` - Run ESLint

## API Endpoints

- `GET /health` - Health check
- `GET /api/v1` - API information

## Project Structure

```
src/
├── services/       # Business logic services
│   ├── whatsapp/   # WhatsApp integration
│   ├── ai/         # AI and NLP services
│   ├── calendar/   # Calendar integrations
│   └── scheduler/  # BullMQ job scheduler
├── controllers/    # Request handlers
├── models/         # Database schemas
├── utils/          # Helper functions
└── config/         # Configuration files
```

## License

MIT
