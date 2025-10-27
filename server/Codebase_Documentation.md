# Codebase Documentation

This document provides a detailed explanation of the files in the `src` directory of the Memorae server.

## Main Application Files

### `src/app.ts`

**Purpose:** This is the core file for the Fastify web server. It creates and configures the Fastify instance, including middleware, routes, and error handling.

**Key functionalities:**

- Initializes the Fastify server with logging.
- Registers middleware for security (`helmet`), CORS (`cors`), and rate limiting (`rate-limit`).
- Defines a `/health` endpoint for health checks.
- Defines a base `/api/v1` endpoint.
- Defines an endpoint for sending WhatsApp messages (`/api/v1/whatsapp/send`).
- Defines an endpoint to get the WhatsApp connection status (`/api/v1/whatsapp/status`).
- Registers notification-related routes.
- Sets a global error handler.

### `src/index.ts`

**Purpose:** This is the main entry point of the application. It starts the server and initializes the messaging platform managers (WhatsApp and/or Telegram).

**Key functionalities:**

- Loads environment variables from `.env` file.
- Builds and starts the Fastify application.
- Initializes `WhatsAppManager` and/or `TelegramManager` based on the `MESSAGING_PLATFORM` environment variable.
- Handles graceful shutdown on `SIGINT` and `SIGTERM` signals.

## Configuration

### `src/config/env.ts`

**Purpose:** This file is responsible for validating and exporting all environment variables used in the application.

**Key functionalities:**

- Validates the presence of required environment variables like `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`.
- Ensures that at least one AI provider API key is configured.
- Validates the `PORT` and `MESSAGING_PLATFORM` environment variables.
- Exports a `config` object with all the environment variables, providing a single source of truth for configuration.

## Controllers

### `src/controllers/message-handler.ts`

**Purpose:** This is the main controller for handling incoming messages from different platforms. It orchestrates the processing of messages, user management, and interaction with the AI service.

**Key functionalities:**

- Handles incoming messages of different types (text, image, audio).
- Manages user and conversation context, including caching and cleanup.
- Interacts with the `OnboardingHandler` for new users.
- Uses the `AIService` to process messages and execute tools.
- Formats the AI response using `ResponseFormatter`.
- Interacts with `MediaHandler` for media messages.

### `src/controllers/notification-controller.ts`

**Purpose:** This file defines the API routes related to notifications.

**Key functionalities:**

- Registers the following routes:
  - `POST /api/v1/notifications/send-reminder-to-contact`: Sends a reminder to a contact.
  - `GET /api/v1/notifications/history`: Retrieves the notification history.
  - `POST /api/v1/notifications/send-custom`: Sends a custom message.

### `src/controllers/handlers/`

This directory contains handlers for specific message types and functionalities.

- **`media-handler.ts`**: Handles image and audio messages, including OCR, transcription, and interaction with the AI service.
- **`onboarding-handler.ts`**: Manages the onboarding flow for new users, collecting their preferences.
- **`response-formatter.ts`**: Formats the results from the AI and tool executions into user-friendly messages.

## Library

### `src/lib/supabase.ts`

**Purpose:** This file provides a singleton instance of the Supabase client.

**Key functionalities:**

- Initializes the Supabase client using the `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` from the environment variables.
- Exports a `getSupabaseClient` function to get the singleton instance.

## Middleware

### `src/middleware/validation.ts`

**Purpose:** This file contains middleware for input validation and rate limiting.

**Key functionalities:**

- Provides Zod schemas for validating request bodies and queries.
- Includes middleware functions (`validateBody`, `validateQuery`) to perform validation.
- Implements a user-based rate limiting middleware (`rateLimitByUser`).
- Contains various utility functions for validation (e.g., `validatePhoneNumber`, `validateDateTime`).

## Models

### `src/models/types.ts`

**Purpose:** This file defines the TypeScript interfaces for the database tables, providing type safety for data models.

**Key functionalities:**

- Defines interfaces for `User`, `Reminder`, `List`, `ListItem`, `CalendarConnection`, `NotificationHistory`, `ConversationContext`, and `MediaAttachment`.

## Services

This is the largest part of the application, containing the business logic for various features.

### `src/services/`

- **`activity-service.ts`**: Provides a service to get a feed of user activities (reminders, lists, notes).
- **`ai-service.ts`**: The core of the AI interaction. It initializes the AI models, selects the appropriate tool based on user input, and processes messages with the AI. It acts as a facade, delegating logic to modules in `src/services/ai/`.
- **`media-attachment-service.ts`**: Manages media attachments, including saving, retrieving, and linking them to other entities.
- **`message-batch-service.ts`**: Batches incoming image messages to be processed together.
- **`notification-retry.ts`**: A service to retry sending failed notifications with exponential backoff.
- **`notification-service.ts`**: Handles sending notifications, such as reminders to contacts.
- **`ocr-service.ts`**: Provides an OCR (Optical Character Recognition) service to extract text from images.
- **`pending-action-service.ts`**: Manages pending actions that require user confirmation.
- **`reminder-scheduler.ts`**: A scheduler that periodically checks for due reminders and triggers notifications.
- **`runtime.ts`**: A simple module to hold global instances of the `WhatsAppManager` and `TelegramManager`.
- **`telegram-manager.ts`**: Manages the Telegram bot, including initialization, message handling, and sending notifications.
- **`tools-registry.ts`**: A central registry for all the tools that the AI can use. It acts as a facade, delegating logic to `tool-definitions.ts`, `tool-executor.ts`, and `tool-selector.ts`.
- **`tool-definitions.ts`**: Defines the tools available to the AI.
- **`tool-executor.ts`**: Executes tools by name.
- **`tool-selector.ts`**: Contains the logic for selecting the appropriate tool based on user input.
- **`transcription-service.ts`**: Provides an audio transcription service.
- **`translation-service.ts`**: Provides a service to translate text to English.
- **`user-service.ts`**: Manages user-related operations, such as creating, finding, and updating users and their settings.
- **`utility-service.ts`**: A facade that provides a collection of utility functions, delegating logic to modules in `src/services/utils/`.
- **`whatsapp-manager.ts`**: Manages the WhatsApp client, including initialization, message handling, and sending notifications.

### `src/services/ai/`

This directory contains the refactored modules from `ai-service.ts`.

- **`model-manager.ts`**: Handles the initialization and management of AI models.
- **`message-processor.ts`**: Responsible for pre-processing user messages.
- **`response-handler.ts`**: Manages post-processing of AI responses, including fallbacks.
- **`tool-utils.ts`**: Contains utility functions related to AI tools.
- **`prompts.ts`**: Stores the large system prompt strings for better readability.

### `src/services/utils/`

This directory contains the refactored modules from `utility-service.ts`.

- **`time.ts`**: Contains all the date/time related utility functions.
- **`text.ts`**: Contains all the text/NLP related utility functions.
- **`search.ts`**: Contains the `globalSearch` function.

### `src/services/list/`

- **`item.service.ts`**: Manages list items, including adding, removing, and updating them.
- **`list.service.ts`**: Manages lists, including creating, deleting, and archiving them.
- **`query.service.ts`**: Provides services for querying lists and list items.
- **`types.ts`**: Defines the TypeScript types for the list-related services.

### `src/services/notes/`

- **`notes.service.ts`**: Manages notes, including creating, updating, and deleting them.
- **`query.service.ts`**: Provides services for querying notes.
- **`types.ts`**: Defines the TypeScript types for the notes-related services.

### `src/services/reminders/`

- **`actions.service.ts`**: Manages actions on reminders, such as snoozing and completing them.
- **`query.service.ts`**: Provides services for querying reminders.
- **`reminder.service.ts`**: Manages reminders, including creating, updating, and deleting them.
- **`types.ts`**: Defines the TypeScript types for the reminders-related services.

### `src/services/telegram/`

- **`connection.ts`**: Manages the connection to the Telegram bot API.
- **`index.ts`**: The main entry point for the Telegram service, which initializes the connection and message handling.
- **`message-handler.ts`**: Parses incoming Telegram messages into a common `MessageContext` format.
- **`sender.ts`**: A class for sending messages and other actions to Telegram.
- **`types.ts`**: Defines the TypeScript types for the Telegram service.

### `src/services/tools/`

- **`tool-deduplication.ts`**: A wrapper to prevent duplicate tool executions with the same parameters.
- **`tool-definitions.ts`**: Defines the AI tools by combining the services from the `services` directory.
- **`tool-router.ts`**: A service that uses an AI model to select the most appropriate tool for a given user query.

### `src/services/tools/definitions/`

This directory contains the definitions of the AI tools, categorized by functionality. Each file creates a set of tools related to a specific domain (e.g., `activity.ts`, `list.ts`, `reminder.ts`).

### `src/services/whatsapp/`

- **`connection.ts`**: Manages the connection to the WhatsApp client using Baileys.
- **`index.ts`**: The main entry point for the WhatsApp service, which initializes the connection and message handling.
- **`message-handler.ts`**: Parses incoming WhatsApp messages into a common `MessageContext` format.
- **`sender.ts`**: A class for sending messages and other actions to WhatsApp.
- **`types.ts`**: Defines the TypeScript types for the WhatsApp service.

## Types

### `src/types/conversation.ts`

**Purpose:** This file defines the TypeScript interfaces for managing conversation context.

**Key functionalities:**

- Defines interfaces for `ConversationMessage` and `ConversationContext`.

## Utilities

### `src/utils/`

- **`error-handler.ts`**: Provides a global error handler for the Fastify application and other utility functions for error handling.
- **`errors.ts`**: Defines custom error classes for the application.
- **`logger.ts`**: Configures the Pino logger for the application.
- **`time-utils.ts`**: A collection of utility functions for handling time and timezones.
- **`validators.ts`**: Contains Zod schemas for validating data models and other utility functions for validation.
