# Codebase Documentation

This document provides a detailed explanation of the files in the `src` directory of the Memorae server.

## Main Application Files

### `src/app.ts`

**Purpose:** This is the core file for the Fastify web server. It creates and configures the Fastify instance, including middleware, routes, and error handling.

**Key functionalities:**

- Initializes the Fastify server with logging (using pino-pretty in development).
- Registers middleware for security (`helmet`), CORS (`cors`), and global rate limiting.
- Defines a `/health` endpoint for health checks and a base `/api/v1` endpoint.
- Defines an endpoint for sending WhatsApp messages (`/api/v1/whatsapp/send`) with user-based rate limiting.
- Defines an endpoint to get the WhatsApp connection status (`/api/v1/whatsapp/status`).
- Registers notification-related routes from `notification-controller`.
- Sets a global error handler to standardize error responses.

### `src/index.ts`

**Purpose:** This is the main entry point of the application. It starts the server and initializes the messaging platform managers (WhatsApp and/or Telegram) and other background services.

**Key functionalities:**

- Loads environment variables from `.env` file.
- Builds and starts the Fastify application.
- Initializes `WhatsAppManager` and/or `TelegramManager` based on the `MESSAGING_PLATFORM` environment variable.
- Starts the `ReminderCleanupService` to periodically clean up completed reminders.
- Handles graceful shutdown on `SIGINT` and `SIGTERM` signals to ensure all services are stopped correctly.

## Configuration

### `src/config/env.ts`

**Purpose:** This file is responsible for validating and exporting all environment variables used in the application.

**Key functionalities:**

- Validates the presence of required environment variables like `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`.
- Ensures that at least one AI provider API key is configured and that the key for the selected `AI_PROVIDER` is present.
- Validates the `PORT` and `MESSAGING_PLATFORM` environment variables.
- Validates that `TELEGRAM_BOT_TOKEN` is present if the messaging platform is `telegram` or `both`.
- Exits the process with a descriptive error message if validation fails.
- Exports a `config` object with all the environment variables, providing a single source of truth for configuration.

## Controllers

### `src/controllers/message-handler.ts`

**Purpose:** This is the main controller for handling incoming messages from different platforms. It orchestrates the processing of messages, user management, and interaction with the AI service.

**Key functionalities:**

- Handles incoming messages of different types (text, image, audio/voice).
- Manages user and conversation context, including caching and cleanup, to maintain conversation state.
- Interacts with the `OnboardingHandler` for new users.
- Uses the `AIService` to process messages and execute tools based on user intent.
- Formats the AI response using `ResponseFormatter`.
- Interacts with `MediaHandler` for media messages.
- Implements logic for handling user selections from a list of candidates and confirming actions.

### `src/controllers/notification-controller.ts`

**Purpose:** This file defines the API routes related to notifications.

**Key functionalities:**

- Registers the following routes under `/api/v1/notifications`:
  - `POST /send-reminder-to-contact`: Sends a reminder to a contact on behalf of a user.
  - `GET /history`: Retrieves the notification history for a user.
  - `POST /send-custom`: Sends a custom message to a user.

### `src/controllers/handlers/`

This directory contains handlers for specific message types and functionalities.

- **`media-handler.ts`**: Handles image and audio messages. For images, it performs OCR to extract text and can process the image with user instructions. For audio, it transcribes the voice message to text. It then uses the extracted text to interact with the `AIService`. It also handles saving media attachments to storage and linking them to created entities like reminders or notes.
- **`onboarding-handler.ts`**: Manages the onboarding flow for new users, collecting their preferences for name, timezone, reminder times, and notification settings.
- **`response-formatter.ts`**: Formats the results from the AI and tool executions into user-friendly, human-readable messages, stripping markdown and presenting data in a clean way.

## Library

### `src/lib/supabase.ts`

**Purpose:** This file provides a singleton instance of the Supabase client.

**Key functionalities:**

- Initializes the Supabase client using the `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` from the environment variables.
- Exports a `getSupabaseClient` function to get the singleton instance, ensuring a single connection is used throughout the application.

## Middleware

### `src/middleware/validation.ts`

**Purpose:** This file contains middleware for input validation and rate limiting.

**Key functionalities:**

- Provides Zod schemas for validating request bodies and queries (e.g., `whatsappMessageSchema`, `reminderSchema`).
- Includes middleware functions (`validateBody`, `validateQuery`) to perform validation and return structured error messages.
- Implements a user-based rate limiting middleware (`rateLimitByUser`) to prevent abuse.
- Contains various utility functions for validation (e.g., `validatePhoneNumber`, `validateDateTime`, `sanitizeInput`).

## Models

### `src/models/types.ts`

**Purpose:** This file defines the TypeScript interfaces for the database tables, providing type safety for data models.

**Key functionalities:**

- Defines interfaces for `User`, `Reminder`, `List`, `ListItem`, `CalendarConnection`, `NotificationHistory`, `ConversationContext`, and `MediaAttachment`.

## Services

This is the largest part of the application, containing the business logic for various features.

### `src/services/`

- **`activity-service.ts`**: Provides a service to get a feed of user activities (reminders, lists, notes) to show a history of actions.
- **`ai-service.ts`**: The core of the AI interaction. It initializes the AI models, selects the appropriate tool based on user input, and processes messages with the AI. It acts as a facade, delegating logic to modules in `src/services/ai/`. It also includes a self-healing mechanism to retry failed tool calls.
- **`media-attachment-service.ts`**: Manages media attachments, including saving, retrieving, and linking them to other entities like reminders, list items, or notes.
- **`message-batch-service.ts`**: Batches incoming image messages to be processed together, allowing for more context when a user sends multiple images with a single instruction.
- **`notification-retry.ts`**: A service to retry sending failed notifications with exponential backoff.
- **`notification-service.ts`**: Handles sending notifications, such as reminders to contacts, and records the history of sent notifications.
- **`ocr-service.ts`**: Provides an OCR (Optical Character Recognition) service to extract text from images using the Mistral Pixtral model.
- **`pending-action-service.ts`**: Manages pending actions that require user confirmation before execution.
- **`reminder-cleanup.service.ts`**: A background service that periodically deletes completed reminders from the database to keep it clean.
- **`reminder-scheduler.ts`**: A scheduler that periodically checks for due reminders and triggers notifications via the appropriate messaging platform.
- **`runtime.ts`**: A simple module to hold global singleton instances of the `WhatsAppManager` and `TelegramManager`.
- **`telegram-manager.ts`**: Manages the Telegram bot, including initialization, message handling, and sending notifications.
- **`tool-definitions.ts`**: Defines the tools available to the AI by mapping them to the corresponding service methods.
- **`tool-executor.ts`**: Executes a specified tool by name with the given parameters.
- **`tool-selector.ts`**: Contains logic for selecting the most relevant group of tools for a given user query to provide to the AI.
- **`tools-registry.ts`**: A central registry for all the tools that the AI can use. It acts as a facade, delegating logic to `tool-definitions.ts`, `tool-executor.ts`, and `tool-selector.ts`.
- **`transcription-service.ts`**: Provides an audio transcription service using the Groq API with the Whisper model.
- **`translation-service.ts`**: Provides a service to translate text to English, used to normalize user input before processing.
- **`user-service.ts`**: Manages user-related operations, such as creating, finding, and updating users and their settings.
- **`utility-service.ts`**: A facade that provides a collection of utility functions, delegating logic to modules in `src/services/utils/`.
- **`whatsapp-manager.ts`**: Manages the WhatsApp client, including initialization, message handling, and sending notifications.

### `src/services/ai/`

This directory contains the refactored modules from `ai-service.ts`.

- **`message-processor.ts`**: Responsible for pre-processing user messages, enriching them with context, and performing heuristic tool selection.
- **`model-manager.ts`**: Handles the initialization and management of AI models, including the primary model and fallback models.
- **`prompts.ts`**: Stores the large system prompt strings for better readability and maintainability.
- **`response-handler.ts`**: Manages post-processing of AI responses, including deterministic fallbacks for common queries like "time left".
- **`tool-utils.ts`**: Contains utility functions related to AI tools, such as identifying if a tool is state-changing.

### `src/services/list/`

- **`item.service.ts`**: Manages list items, including adding, removing, updating, and completing them.
- **`list.service.ts`**: Manages lists, including creating, deleting, archiving, and duplicating them.
- **`query.service.ts`**: Provides services for querying lists and list items, including searching and getting stats.
- **`types.ts`**: Defines the TypeScript types for the list-related services.

### `src/services/notes/`

- **`notes.service.ts`**: Manages notes, including creating, updating, deleting, pinning, and archiving them.
- **`query.service.ts`**: Provides services for querying notes, including searching and listing them.
- **`types.ts`**: Defines the TypeScript types for the notes-related services.

### `src/services/reminders/`

- **`actions.service.ts`**: Manages actions on reminders, such as snoozing and completing them.
- **`query.service.ts`**: Provides services for querying reminders, including searching and listing upcoming or overdue reminders.
- **`reminder.service.ts`**: Manages reminders, including creating, updating, deleting, and archiving them.
- **`types.ts`**: Defines the TypeScript types for the reminders-related services.

### `src/services/telegram/`

- **`connection.ts`**: Manages the connection to the Telegram bot API using `node-telegram-bot-api`.
- **`index.ts`**: The main entry point for the Telegram service, which initializes the connection and message handling.
- **`message-handler.ts`**: Parses incoming Telegram messages into a common `MessageContext` format and handles media downloads.
- **`sender.ts`**: A class for sending messages and other actions (like typing indicators) to Telegram.
- **`types.ts`**: Defines the TypeScript types for the Telegram service.

### `src/services/tools/`

- **`tool-deduplication.ts`**: A wrapper to prevent duplicate tool executions with the same parameters within a single AI turn.
- **`tool-definitions.ts`**: Defines the AI tools by combining the services from the `services` directory into a format consumable by the AI SDK.
- **`tool-router.ts`**: A service that uses an AI model to select the most appropriate tool for a given user query, improving efficiency and accuracy.

### `src/services/tools/definitions/`

This directory contains the definitions of the AI tools, categorized by functionality. Each file creates a set of tools related to a specific domain (e.g., `activity.ts`, `list.ts`, `reminder.ts`).

### `src/services/utils/`

This directory contains the refactored modules from `utility-service.ts`.

- **`search.ts`**: Contains the `globalSearch` function to search across multiple database tables.
- **`text.ts`**: Contains all the text/NLP related utility functions, such as parsing list items and detecting user intent.
- **`time.ts`**: Contains all the date/time related utility functions, such as parsing natural language dates and calculating time differences.

### `src/services/whatsapp/`

- **`connection.ts`**: Manages the connection to the WhatsApp client using Baileys.
- **`index.ts`**: The main entry point for the WhatsApp service, which initializes the connection and message handling.
- **`message-handler.ts`**: Parses incoming WhatsApp messages into a common `MessageContext` format and handles media downloads.
- **`sender.ts`**: A class for sending messages and other actions (like typing indicators and reactions) to WhatsApp.
- **`types.ts`**: Defines the TypeScript types for the WhatsApp service.

## Types

### `src/types/conversation.ts`

**Purpose:** This file defines the TypeScript interfaces for managing conversation context.

**Key functionalities:**

- Defines interfaces for `ConversationMessage` and `ConversationContext`, which includes messages, onboarding state, pending actions, and more.

## Utilities

### `src/utils/`

- **`error-handler.ts`**: Provides a global error handler for the Fastify application and other utility functions for handling errors, such as `asyncHandler` and `withRetry`.
- **`errors.ts`**: Defines custom error classes for the application (e.g., `AppError`, `ValidationError`, `NotFoundError`).
- **`logger.ts`**: Configures the Pino logger for the application with pretty-printing for development.
- **`time-utils.ts`**: A collection of utility functions for handling time and timezones using `luxon`.
- **`validators.ts`**: Contains Zod schemas for validating data models and other utility functions for validation.
