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

## License

MIT
