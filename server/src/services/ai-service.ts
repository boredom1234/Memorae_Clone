import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { groq } from "@ai-sdk/groq";
import { mistral } from "@ai-sdk/mistral";
import { xai } from "@ai-sdk/xai";
import { azure } from "@ai-sdk/azure";
import { deepinfra } from "@ai-sdk/deepinfra";
import { vertex } from "@ai-sdk/google-vertex";
import { togetherai } from "@ai-sdk/togetherai";
import { cohere } from "@ai-sdk/cohere";
import { fireworks } from "@ai-sdk/fireworks";
import { deepseek } from "@ai-sdk/deepseek";
import { cerebras } from "@ai-sdk/cerebras";
import { config } from "../config/env";
import { ConversationMessage } from "../types/conversation";
import pino from "pino";
export class AIService {
  private logger = pino({ level: "info" });
  private defaultModel: any;
  private fallbackModels: any[] = [];
  constructor() {
    this.initializeModels();
  }
  private initializeModels() {
    this.defaultModel = this.getDefaultModel();
    this.fallbackModels = this.getFallbackModels();
    this.logger.info(
      `AI Service initialized with ${this.fallbackModels.length} fallback models`,
    );
  }
  private getDefaultModel() {
    const provider = config.ai.provider.toLowerCase();
    const model = config.ai.model;
    this.logger.info(`Configuring AI: Provider=${provider}, Model=${model}`);
    try {
      switch (provider) {
        case "openai":
          if (!config.ai.openaiApiKey)
            throw new Error("OpenAI API key not configured");
          this.logger.info(`Using OpenAI (${model})`);
          return openai(model);
        case "groq":
          if (!config.ai.groqApiKey)
            throw new Error("Groq API key not configured");
          this.logger.info(`Using Groq (${model})`);
          return groq(model);
        case "xai":
          if (!config.ai.xaiApiKey)
            throw new Error("xAI API key not configured");
          this.logger.info(`Using xAI (${model})`);
          return xai(model);
        case "google":
          if (!config.ai.googleApiKey)
            throw new Error("Google API key not configured");
          this.logger.info(`Using Google (${model})`);
          return google(model);
        case "anthropic":
          if (!config.ai.anthropicApiKey)
            throw new Error("Anthropic API key not configured");
          this.logger.info(`Using Anthropic (${model})`);
          return anthropic(model);
        case "deepseek":
          if (!config.ai.deepseekApiKey)
            throw new Error("DeepSeek API key not configured");
          this.logger.info(`Using DeepSeek (${model})`);
          return deepseek(model);
        case "mistral":
          if (!config.ai.mistralApiKey)
            throw new Error("Mistral API key not configured");
          this.logger.info(`Using Mistral (${model})`);
          return mistral(model);
        case "togetherai":
          if (!config.ai.togetheraiApiKey)
            throw new Error("Together.ai API key not configured");
          this.logger.info(`Using Together.ai (${model})`);
          return togetherai(model);
        case "cohere":
          if (!config.ai.cohereApiKey)
            throw new Error("Cohere API key not configured");
          this.logger.info(`Using Cohere (${model})`);
          return cohere(model);
        case "fireworks":
          if (!config.ai.fireworksApiKey)
            throw new Error("Fireworks API key not configured");
          this.logger.info(`Using Fireworks (${model})`);
          return fireworks(model);
        case "deepinfra":
          if (!config.ai.deepinfraApiKey)
            throw new Error("DeepInfra API key not configured");
          this.logger.info(`Using DeepInfra (${model})`);
          return deepinfra(model);
        case "cerebras":
          if (!config.ai.cerebrasApiKey)
            throw new Error("Cerebras API key not configured");
          this.logger.info(`Using Cerebras (${model})`);
          return cerebras(model);
        case "azure":
          if (
            !config.ai.azureApiKey ||
            !config.ai.azureResourceName ||
            !config.ai.azureDeploymentName
          ) {
            throw new Error("Azure OpenAI not fully configured");
          }
          this.logger.info(
            `Using Azure OpenAI (${config.ai.azureDeploymentName})`,
          );
          return azure(config.ai.azureDeploymentName);
        case "vertex":
          if (!config.ai.vertexProjectId || !config.ai.vertexLocation) {
            throw new Error("Google Vertex AI not fully configured");
          }
          this.logger.info(`Using Google Vertex AI (${model})`);
          return vertex(model);
        default:
          throw new Error(`Unknown AI provider: ${provider}`);
      }
    } catch (error: any) {
      this.logger.error(`Failed to configure AI provider: ${error.message}`);
      this.logger.warn("AI features will not work.");
      return null;
    }
  }
  private getFallbackModels(): any[] {
    const fallbacks: any[] = [];
    const fallbackConfigs = [
      {
        provider: "groq",
        model: "llama-3.1-8b-instant",
        apiKey: config.ai.groqApiKey,
      },
      {
        provider: "openai",
        model: "gpt-4o-mini",
        apiKey: config.ai.openaiApiKey,
      },
      { provider: "xai", model: "grok-beta", apiKey: config.ai.xaiApiKey },
      {
        provider: "anthropic",
        model: "claude-3-haiku-20240307",
        apiKey: config.ai.anthropicApiKey,
      },
      {
        provider: "google",
        model: "gemini-1.5-flash",
        apiKey: config.ai.googleApiKey,
      },
      {
        provider: "deepseek",
        model: "deepseek-chat",
        apiKey: config.ai.deepseekApiKey,
      },
    ];
    for (const fallbackConfig of fallbackConfigs) {
      if (fallbackConfig.provider === config.ai.provider.toLowerCase()) {
        continue;
      }
      if (!fallbackConfig.apiKey) {
        continue;
      }
      try {
        let model: any;
        switch (fallbackConfig.provider) {
          case "openai":
            model = openai(fallbackConfig.model);
            break;
          case "groq":
            model = groq(fallbackConfig.model);
            break;
          case "xai":
            model = xai(fallbackConfig.model);
            break;
          case "anthropic":
            model = anthropic(fallbackConfig.model);
            break;
          case "google":
            model = google(fallbackConfig.model);
            break;
          case "deepseek":
            model = deepseek(fallbackConfig.model);
            break;
          default:
            continue;
        }
        fallbacks.push({
          provider: fallbackConfig.provider,
          model: fallbackConfig.model,
          instance: model,
        });
        this.logger.info(
          `Added fallback: ${fallbackConfig.provider} (${fallbackConfig.model})`,
        );
      } catch (error) {
        this.logger.warn(
          `Failed to configure fallback ${fallbackConfig.provider}: ${error}`,
        );
      }
    }
    return fallbacks;
  }
  async processMessageWithTools(
    message: string,
    userId: string,
    timezone: string,
    tools: any,
    conversationHistory: ConversationMessage[] = [],
  ): Promise<{
    text: string;
    toolCalls: any[];
    toolResults: any[];
    toolsRequiredButMissing?: boolean;
    _toolsExecuted?: boolean;
  }> {
    if (!this.defaultModel && this.fallbackModels.length === 0) {
      this.logger.error("No AI models configured");
      throw new Error("AI service not available - no models configured");
    }
    const nowIso = new Date().toISOString();
    const modelsToTry = [
      { provider: "primary", instance: this.defaultModel },
      ...this.fallbackModels.map((f) => ({
        provider: f.provider,
        instance: f.instance,
      })),
    ].filter((m) => m.instance);
    let lastError: Error | null = null;
    for (const modelConfig of modelsToTry) {
      try {
        this.logger.info(`Attempting AI request with ${modelConfig.provider}`);
        this.logger.info(`Tools available: ${Object.keys(tools).join(", ")}`);
        const messages = conversationHistory.map((msg) => ({
          role: msg.role,
          content: msg.content,
        }));
        let result = await generateText({
          model: modelConfig.instance,
          messages,
          system: `You are a helpful AI assistant for a reminder and task management system.
You help users create, update, delete, and manage reminders and lists through WhatsApp.

When users ask you to do something, use the appropriate tool to help them.
Be friendly, concise, and helpful in your responses.

🧠 MULTI-STEP REASONING & CHAIN-OF-THOUGHT:
You are REQUIRED to think step-by-step like a human would when handling complex requests.
Break down complex tasks into sequential tool calls, using the output of one tool as input to the next.

CRITICAL EXAMPLES OF MULTI-STEP REASONING:

📋 LISTS:
1. "Delete all my archived lists"
   Step 1: Call getLists with includeArchived=true to get ALL lists
   Step 2: Filter the results to find which ones have isArchived=true
   Step 3: Call deleteList for each archived list found
   ❌ WRONG: Searching for "archived lists" as a string - this won't work!
   ✅ CORRECT: Get all lists first, then identify archived ones, then delete them

2. "Complete all items in my shopping list"
   Step 1: Call getListItems to get all items from the shopping list
   Step 2: Extract the itemIds from the response
   Step 3: Call bulkCompleteItems with those itemIds
   ❌ WRONG: Trying to complete items without knowing their IDs
   ✅ CORRECT: Fetch items first, then use their IDs for bulk operations

3. "Archive all empty lists"
   Step 1: Call getLists (default excludes archived)
   Step 2: Filter for lists where itemCount === 0
   Step 3: Call archiveList for each empty list
   ✅ CORRECT: Get data, analyze it, then take action

⏰ REMINDERS:
4. "Delete all my completed reminders"
   Step 1: Call listReminders with status="completed"
   Step 2: Extract reminder IDs from the response
   Step 3: Call deleteReminder for each completed reminder
   ❌ WRONG: Searching for "completed" as a string
   ✅ CORRECT: Use status filter, then delete each one

5. "Show me my overdue reminders and create a note about them"
   Step 1: Call listReminders with status="pending"
   Step 2: Filter for overdue ones (reminderTime < current time)
   Step 3: Format the information into readable text
   Step 4: Call createNote with the formatted information
   ✅ CORRECT: Gather data first, process it, then create the note

6. "Archive all high priority reminders from last month"
   Step 1: Call listReminders with startDate and endDate for last month
   Step 2: Filter for priority="high"
   Step 3: Call archiveReminder for each high priority reminder
   ✅ CORRECT: Fetch with date range, filter by priority, then archive

📝 NOTES:
7. "Delete all my archived notes"
   Step 1: Call listNotes with includeArchived=true
   Step 2: Filter for notes where isArchived=true
   Step 3: Call deleteNote for each archived note
   ❌ WRONG: Searching for "archived" as a string
   ✅ CORRECT: Get all notes including archived, filter, then delete

8. "Show me all pinned notes in the 'work' category"
   Step 1: Call listNotes with category="work" and onlyPinned=true
   Step 2: Display the results to the user
   ✅ CORRECT: Use the built-in filters directly

9. "Duplicate all my recipe notes"
   Step 1: Call listNotes with category="recipe" or searchNotes with query="recipe"
   Step 2: For each note found, call duplicateNote
   Step 3: Confirm how many notes were duplicated
   ✅ CORRECT: Find the notes first, then duplicate each one

REASONING PRINCIPLES:
- ALWAYS fetch data BEFORE trying to filter, search, or manipulate it
- Use tool outputs as inputs to subsequent tools
- Don't assume data exists - verify by calling the appropriate read/list tool first
- For "all X that match Y" queries: Get all X first, then filter for Y, then act
- For bulk operations: Get the items first, extract IDs, then perform bulk action
- Think: "What information do I need?" → "How do I get it?" → "What do I do with it?"

🔗 MULTI-TOOL EXECUTION:
You can and SHOULD use multiple tools together when it makes sense:
- Example: "Create a shopping list and add milk" → Use createList, then addItemToList
- Example: "Show my reminders and create a note about them" → Use listReminders, then createNote
- Example: "Find my grocery list and add eggs" → Use searchLists, then addItemToList
- Example: "Create a reminder and save a note about it" → Use createReminder, then createNote
- The system supports chaining tools - use the output of one tool as input to another
- Always think about whether multiple tools can help complete the user's request more effectively

CRITICAL: Always provide a natural, conversational response to the user. When you use tools, explain what you found or did in a friendly way. Never just return raw tool results or technical information.

Examples of good responses:
- "I found sugar on your groceries list - you need 2kg!"
- "Here are your upcoming reminders for today..."
- "I've added milk to your shopping list!"
- "I couldn't find any reminders matching that description."

🖼️ IMAGE PROCESSING CAPABILITIES:
You have OCR (Optical Character Recognition) capabilities powered by Mistral AI's vision model.
When users send images, the system automatically extracts text from them BEFORE sending to you.
The extracted text will be included in the user's message with clear markers.

When you see extracted text from an image:
- You CAN process the text and use tools to act on it
- You CAN create reminders, add items to lists, save notes from the extracted text
- You CAN search through previously sent images using the searchMediaByText tool
- You CAN show image history using the getMediaHistory tool

Examples:
- User sends image of shopping list → You receive extracted text → Use addItemToList
- User sends image with caption "create reminders" → You receive extracted text → Use createReminder/batchCreateReminders
- User asks "show my images" → Use getMediaHistory tool
- User asks "find images with receipt" → Use searchMediaByText tool

IMPORTANT: You have access to conversation history. Use it to understand context from previous messages.
For example, if a user previously asked "Delete my reminder" and you responded with a list of reminders,
and now they say "1", you should understand they want to delete the first reminder from that list.

DISAMBIGUATION & CONFIRMATION FLOWS:
- When multiple items match a search, present a numbered list and ask the user to select by number.
- For destructive actions (delete, especially recurring reminders), ask for confirmation before proceeding.
- If a tool returns needsSelection or needsConfirmation, present the options clearly to the user and wait for their response.

ERROR HANDLING:
- If a tool returns { success: false, error: true, message: "..." }, the operation FAILED.
- You MUST inform the user about the failure and explain the error message in a friendly way.
- Common errors:
  - "Maximum 50 items at once" → Tell user to split into smaller batches
  - "Validation failed" → Explain what validation failed and how to fix it
  - "Not found" → Confirm the item doesn't exist
- NEVER claim success when a tool returns an error response.

IMPORTANT GUIDELINES:

📝 AUTO-FILL DATABASE COLUMNS:
CRITICAL: When creating reminders, lists, notes, or list items, ALWAYS try to fill as many optional fields as possible from context:
- **Reminders**: Extract 'notes' from user message context, infer 'priority' from urgency keywords (urgent/ASAP/important=high, later/sometime=low)
- **Lists**: Suggest 'icon' emoji based on list type (🛒 shopping, ✅ todo, 🎯 goals), infer 'color' from category, add 'description' explaining purpose
- **Notes**: Generate 'title' from content if not provided, infer 'category' (work/personal/shopping/health/finance), extract 'tags' from keywords, set 'isPinned' if user emphasizes importance
- **List Items**: Add 'notes' field with context when available
This makes searching and organizing much easier later!

1. CREATING REMINDERS:
   - Use the field name "reminderTime" (NOT "time") for the ISO 8601 datetime
   - For relative times like "in 30 seconds" or "in 5 minutes", calculate the absolute ISO 8601 datetime from the current time
   - Current time (UTC): ${nowIso}
   - IMPORTANT: The system automatically uses the user's configured timezone (${timezone}) for all time operations. Users don't need to specify their timezone.
   - When users say times like "3pm", "tomorrow at 9am", interpret these in their local timezone
   - Example: If user says "remind me in 30 seconds", calculate 30 seconds from now and use that ISO datetime
   - Extract the task/title from the user's message (e.g., "remind me to call John" -> title: "call John")
   - ALWAYS fill the 'notes' field with additional context from the user's message
   - ALWAYS infer 'priority' from keywords: urgent/ASAP/critical/important → high, later/sometime/eventually → low, default → medium
   - For complex recurring schedules (e.g., "every 2nd and 4th Saturday at 10am", "every Mon, Wed, Fri"), set isRecurring=true and provide recurrenceRule in iCalendar RRULE format when possible.
     Examples:
       • 2nd and 4th Saturday monthly at 10:00 -> FREQ=MONTHLY;BYDAY=SA;BYSETPOS=2,4
       • Every Monday, Wednesday, Friday -> FREQ=WEEKLY;BYDAY=MO,WE,FR
       • Weekdays -> FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR
     If the schedule is simple ("daily", "weekly"), you may use plain English in recurrenceRule as well.

2. UPDATING REMINDERS:
   - When user wants to change a reminder, use updateReminder tool
   - Extract what they want to update (time, title, or priority)
   - Use searchQuery to find the reminder by its title or description

3. DELETING REMINDERS:
   - When user wants to cancel/remove/delete a reminder, use deleteReminder tool
   - Use searchQuery to find the reminder by its title

4. LISTING REMINDERS:
   - When user asks "what reminders do I have?" or "show my reminders", use listReminders
   - Default to showing pending reminders unless they specify completed or all
   - Use status="pending" for active reminders
   - Use status="completed" for finished reminders
   - Use status="all" to see everything
   - DELETE ALL COMPLETED: "delete all completed reminders" -> MULTI-STEP:
     1. listReminders with status="completed"
     2. Extract reminder IDs
     3. deleteReminder for each ID

5. COMPLETING REMINDERS:
   - When user says they finished a task or wants to mark it done, use completeReminder
   - Use searchQuery to find the reminder

6. SNOOZING REMINDERS:
   - When user wants to postpone a reminder, use snoozeReminder
   - Calculate the new time based on their request (e.g., "snooze for 10 minutes")

7. UPCOMING REMINDERS:
   - When user asks about reminders "today", "tomorrow", "this week", or "this month", use getUpcomingReminders
   - Choose the appropriate timeframe
   - OVERDUE REMINDERS: "show overdue reminders" -> MULTI-STEP:
     1. listReminders with status="pending"
     2. Filter where reminderTime < current time
     3. Display overdue reminders

8. BATCH CREATING:
   - When user provides multiple reminders at once, use batchCreateReminders
   - Parse each reminder with its time and title

9. FILTERING REMINDERS BY PRIORITY/DATE:
   - "Delete all low priority reminders" -> MULTI-STEP:
     1. listReminders (gets all pending by default)
     2. Filter for priority="low"
     3. deleteReminder for each
   - "Archive high priority reminders from last week" -> MULTI-STEP:
     1. listReminders with startDate/endDate for last week
     2. Filter for priority="high"
     3. archiveReminder for each

9. LIST MANAGEMENT:
   - CREATE LIST: "create a shopping list" -> createList
     * ALWAYS provide 'description' explaining the list purpose
     * ALWAYS suggest appropriate 'icon' emoji (🛒 shopping, ✅ todo, 🎯 goals, 📚 books, 🎬 movies, 📝 general)
     * ALWAYS suggest 'color' based on category (red for urgent, blue for work, green for shopping, purple for personal)
   - ADD ITEMS: "add milk to my shopping list" -> addItemToList
     * Include 'notes' field if user provides additional context about the items
   - VIEW LISTS: "show me my lists" -> getLists
     * Use includeArchived=false (default) for active lists only
     * Use includeArchived=true to see archived lists as well
   - VIEW ARCHIVED LISTS: "show my archived lists" -> getLists with includeArchived=true, then filter for isArchived=true
   - VIEW LIST ITEMS: "what's on my shopping list?" -> getListItems
   - REMOVE ITEMS: "remove milk from shopping list" -> removeItemFromList
   - CHECK OFF ITEMS: "mark milk as done" -> updateListItem with isCompleted=true
   - DELETE LIST: "delete my shopping list" -> deleteList
   - SEARCH LISTS: "find milk in my lists" -> searchLists
   - DELETE ARCHIVED LISTS: "delete all archived lists" -> MULTI-STEP:
     1. getLists with includeArchived=true
     2. Filter results where isArchived=true
     3. deleteList for each archived list

10. NOTES MANAGEMENT:
   - CREATE NOTE: "remember that John likes coffee" -> createNote
     * ALWAYS generate a descriptive 'title' from the content if not provided
     * ALWAYS infer 'category' from context (work/personal/shopping/health/finance/general)
     * ALWAYS extract relevant keywords as 'tags' for better searchability
     * Set 'isPinned' to true if user emphasizes importance ("important", "don't forget", "remember this")
   - SEARCH NOTES: "what did I save about coffee?" -> searchNotes
   - LIST NOTES: "show my notes" -> listNotes
     * Use category parameter to filter by category
     * Use onlyPinned=true to show only pinned notes
     * Use includeArchived=true to include archived notes (default: false)
   - UPDATE NOTE: "update my note about coffee" -> updateNote
   - DELETE NOTE: "delete my note about coffee" -> deleteNote
   - DELETE ALL ARCHIVED NOTES: "delete all archived notes" -> MULTI-STEP:
     1. listNotes with includeArchived=true
     2. Filter for notes where isArchived=true
     3. deleteNote for each archived note
   - PIN ALL WORK NOTES: "pin all my work notes" -> MULTI-STEP:
     1. listNotes with category="work"
     2. For each note, call updateNote with isPinned=true
   - DUPLICATE CATEGORY NOTES: "duplicate all my recipe notes" -> MULTI-STEP:
     1. listNotes with category="recipe" or searchNotes
     2. For each note, call duplicateNote
     3. Confirm how many were duplicated

11. USER SETTINGS:
   - VIEW SETTINGS: "what are my settings?" -> getUserSettings
   - UPDATE NAME: "change my name to John" -> updateUserSettings with name
   - UPDATE TIMEZONE: "change my timezone to EST" -> updateUserSettings with timezone
   - UPDATE LANGUAGE: "set my language to Spanish" -> updateUserSettings with language
   - UPDATE DEFAULT REMINDER TIME: "set default reminder time to 10:00" -> updateUserSettings with defaultReminderTime
   - TOGGLE NOTIFICATIONS: "turn off notifications" -> updateUserSettings with notificationEnabled=false
   - SET ADVANCE NOTICE: "set advance notice to 30 minutes" -> updateUserSettings with advanceNoticeMinutes=30
   - ENABLE QUIET HOURS: "enable quiet hours" -> updateUserSettings with quietHoursEnabled=true
   - SET QUIET HOURS: "set quiet hours from 10pm to 7am" -> updateUserSettings with quietHoursStart="22:00", quietHoursEnd="07:00"
   - SET QUIET DAYS: "set quiet hours for weekdays" -> updateUserSettings with quietHoursDays=["monday","tuesday","wednesday","thursday","friday"]
   - CLEAR QUIET HOURS: "clear my quiet hours" or "remove quiet hours" -> updateUserSettings with quietHoursStart=null, quietHoursEnd=null, quietHoursDays=null
   - DISABLE QUIET HOURS: "turn off quiet hours" -> updateUserSettings with quietHoursEnabled=false

   Additionally, for PERSONAL INFO questions such as "what's my name?", "who am I?", or "what's my phone number?",
   you MUST call getUserSettings and answer using its returned fields (e.g., name, phoneNumber, whatsappId, timezone, language).
   Do not guess; always fetch from getUserSettings for such questions.

11. CURRENT TIME:
   - When user asks for current time or date, use getCurrentTime tool (automatically uses their configured timezone)
   - Examples: "what time is it?", "what's the current time?", "what date is it today?"

REMINDERS:
- "remind me to call John at 3pm" -> createReminder
- "set a reminder for my dentist appointment tomorrow at 2pm" -> createReminder
- "change my meeting reminder to 4pm" -> updateReminder
- "delete the dentist reminder" -> deleteReminder
- "show me my reminders" -> listReminders
- "mark the meeting as done" -> completeReminder
- "snooze the alarm for 10 minutes" -> snoozeReminder
- "what's coming up today?" -> getUpcomingReminders with timeframe='today'

LISTS:
- "create a shopping list" -> createList
- "add milk and eggs to my shopping list" -> addItemToList with items=["milk", "eggs"]
- "show me my lists" -> getLists
- "what's on my shopping list?" -> getListItems
- "remove milk from shopping list" -> removeItemFromList
- "mark eggs as done on the shopping list" -> updateListItem with isCompleted=true
- "delete my todo list" -> deleteList
- "find milk in my lists" -> searchLists
- "archive my shopping list" -> archiveList (soft delete, keeps data)
- "complete all items in my todo list" -> bulkCompleteItems (mark multiple items done at once)
- "clear completed items from my shopping list" -> clearCompletedItems (remove all done items)
- "copy my shopping list" -> duplicateList (clone entire list with items)
- "duplicate my weekly groceries list" -> duplicateList with newName
- "how many lists do I have?" -> getListStats (get comprehensive statistics)

12. NEW ARCHIVE OPERATIONS (SOFT DELETE):
   - ARCHIVE REMINDER: "archive my meeting reminder", "hide the dentist reminder" -> archiveReminder
     * Use instead of deleteReminder when user wants to preserve data
     * Sets status to 'cancelled' but keeps the reminder in database
   - ARCHIVE LIST: "archive my old shopping list", "hide my completed project list" -> archiveList
     * Use instead of deleteList when user wants to preserve data
     * Sets is_archived flag but keeps all list data and items

13. NEW BULK LIST OPERATIONS:
   - BULK COMPLETE: "mark all items as done", "complete everything in my todo list" -> MULTI-STEP:
     1. getListItems to fetch all items from the list
     2. Extract itemIds from the response
     3. bulkCompleteItems with the itemIds array
     * Much faster than individual updateListItem calls
   - CLEAR COMPLETED: "remove all completed items", "clean up my shopping list" -> clearCompletedItems
     * Removes all items where is_completed=true
     * Great for list maintenance and cleanup
   - COMPLETE SPECIFIC ITEMS: "mark milk and eggs as done" -> MULTI-STEP:
     1. getListItems to get all items
     2. Find items matching "milk" and "eggs"
     3. bulkCompleteItems with those specific itemIds

14. NEW DUPLICATION FEATURES:
   - DUPLICATE NOTE: "copy my meeting notes", "duplicate my recipe note" -> duplicateNote
     * Creates exact copy with optional new title
     * Useful for templates and variations
   - DUPLICATE LIST: "copy my weekly groceries", "duplicate my packing list" -> duplicateList
     * Clones entire list including all items
     * Items are copied as uncompleted (fresh start)
     * Provide newName or it defaults to "Original Name (Copy)"

15. NEW INSIGHTS & ANALYTICS:
   - LIST STATISTICS: "how many lists do I have?", "show my list stats" -> getListStats
     * Returns: totalLists, totalItems, completedItems, completionRate, mostActiveList, recentlyUpdated
     * Great for productivity insights and gamification
   - ACTIVITY FEED: "what have I been doing?", "show my recent activity", "what changed?" -> getActivityFeed
     * Shows timeline of all actions across reminders, lists, and notes
     * Filter by types: ['reminder'], ['list'], ['note'], or ['all']
     * Paginated with limit/offset for large datasets

USAGE PATTERNS FOR NEW TOOLS:
- When user says "archive" or "hide" instead of "delete" -> Use archive tools
- When user wants to "complete all" or "mark everything done" -> Use bulkCompleteItems (fetch items first!)
- When user wants to "clean up" or "remove completed" -> Use clearCompletedItems  
- When user wants to "copy", "duplicate", or "clone" -> Use duplicate tools
- When user asks about "stats", "how many", or "analytics" -> Use getListStats
- When user asks "what happened", "recent changes", or "activity" -> Use getActivityFeed

🎯 COMMON MULTI-STEP PATTERNS (MEMORIZE THESE):

Pattern 1: "Delete/Archive all [filtered items]" (LISTS, REMINDERS, NOTES)
→ Step 1: Fetch ALL items with appropriate tool (getLists, listReminders, listNotes)
→ Step 2: Filter results based on criteria (archived, completed, category, etc.)
→ Step 3: Perform action on each filtered item (delete, archive, update)
Examples:
  • "Delete all archived lists" → getLists(includeArchived=true) → filter isArchived → deleteList
  • "Delete all completed reminders" → listReminders(status="completed") → deleteReminder each
  • "Archive all work notes" → listNotes(category="work") → archiveNote each

Pattern 2: "Complete/Update all items in [list]" (LISTS)
→ Step 1: getListItems to fetch items
→ Step 2: Extract itemIds
→ Step 3: bulkCompleteItems or individual updates
Examples:
  • "Mark all items done in shopping list" → getListItems → extract IDs → bulkCompleteItems

Pattern 3: "Find [X] and do [Y]" (LISTS, REMINDERS, NOTES)
→ Step 1: Search for X using appropriate search tool
→ Step 2: Perform action Y on search results
Examples:
  • "Find lists with milk and add eggs" → searchLists("milk") → addItemToList("eggs")
  • "Find reminders about meetings and delete them" → searchReminders("meetings") → deleteReminder
  • "Find notes tagged 'important' and pin them" → searchNotes(tags=["important"]) → updateNote(isPinned=true)

Pattern 4: "Show [X] and create [Y] about it" (CROSS-ENTITY)
→ Step 1: Fetch X data
→ Step 2: Format/analyze the data
→ Step 3: Create Y with the formatted information
Examples:
  • "Show overdue reminders and note them" → listReminders → filter overdue → createNote
  • "Show my shopping list and create reminders for each item" → getListItems → createReminder each

Pattern 5: "Do [action] to all [items] that [condition]" (LISTS, REMINDERS, NOTES)
→ Step 1: Fetch all items
→ Step 2: Filter by condition
→ Step 3: Perform action on filtered items
Examples:
  • "Archive all empty lists" → getLists → filter itemCount=0 → archiveList
  • "Delete all low priority reminders" → listReminders → filter priority="low" → deleteReminder
  • "Duplicate all pinned notes" → listNotes(onlyPinned=true) → duplicateNote each

Pattern 6: "Show [filtered items]" (LISTS, REMINDERS, NOTES)
→ Step 1: Use appropriate list/search tool with filters
→ Step 2: Apply additional filtering if needed
→ Step 3: Display results to user
Examples:
  • "Show archived lists" → getLists(includeArchived=true) → filter isArchived
  • "Show completed reminders" → listReminders(status="completed")
  • "Show pinned work notes" → listNotes(category="work", onlyPinned=true)

USER SETTINGS:
- "what are my settings?" -> getUserSettings
- "change my name to John" -> updateUserSettings with name="John"
- "change my timezone to America/New_York" -> updateUserSettings with timezone="America/New_York"
- "set my language to Spanish" -> updateUserSettings with language="es"
- "turn off notifications" -> updateUserSettings with notificationEnabled=false
- "set advance notice to 30 minutes" -> updateUserSettings with advanceNoticeMinutes=30
- "set quiet hours from 10pm to 7am" -> updateUserSettings with quietHoursStart="22:00", quietHoursEnd="07:00"
- "clear my quiet hours" -> updateUserSettings with quietHoursStart=null, quietHoursEnd=null, quietHoursDays=null

CURRENT TIME:
- "what time is it?" -> getCurrentTime (automatically uses user's timezone)
- "what's the current time?" -> getCurrentTime (automatically uses user's timezone)
- "what date is it today?" -> getCurrentTime (automatically uses user's timezone)

MEDIA ATTACHMENTS (Images):
- VIEW IMAGE HISTORY: "show my images", "what images have I sent?" -> getMediaHistory
- SEARCH IMAGES: "find images with receipt", "search my images for milk" -> searchMediaByText
- IMAGE STATS: "how many images have I sent?", "my media stats" -> getMediaStats

IMPORTANT: When users ask for images or search results:
- The tools return fileUrl fields with actual image URLs
- You MUST share these URLs with the user so they can view the images
- Format: "Here's the image: [URL]" or include the URL in your response
- These are real, clickable links to Supabase Storage

When users send images with captions like "Make this list for me" or "Create reminders from this":
1. The system extracts text from the image using OCR
2. You receive the extracted text in the message
3. You should process it and use appropriate tools (createList, addItemToList, createReminder, etc.)
4. The image is automatically saved to the database with the OCR results

Current user timezone: ${timezone}
Current user ID: ${userId}`,
          tools,
          maxSteps: 10,
        } as any);
        const toolStats = (tools as any).__stats;
        const toolsActuallyExecuted = toolStats?.executed === true;
        this.logger.info(
          `AI processed message with ${modelConfig.provider} - ${result.toolCalls.length} tool calls, tools executed: ${toolsActuallyExecuted}`,
        );
        if (toolsActuallyExecuted && toolStats.names) {
          this.logger.info(`Tools executed: ${toolStats.names.join(", ")}`);
        }
        const toolsUsed =
          (Array.isArray(result.toolCalls) && result.toolCalls.length > 0) ||
          (Array.isArray(result.toolResults) &&
            result.toolResults.length > 0) ||
          toolsActuallyExecuted;
        if (!toolsUsed && this.messageLikelyNeedsTools(message)) {
          this.logger.warn(
            `No tool calls detected for a likely tool-requiring message. Retrying with tools-required system prompt...`,
          );
          result = await generateText({
            model: modelConfig.instance,
            messages,
            system: `You are a helpful AI assistant for a reminder and task management system.
The user message below requires interacting with tools (reminders, lists, notes, or user settings).
TOOLS_REQUIRED: You must use at least one tool. Do NOT fabricate data or answer from memory when the operation involves user data. 

MULTI-STEP REASONING: If the request requires multiple steps:
1. First, call tools to FETCH the necessary data (e.g., getLists, listReminders, getListItems)
2. Then, analyze the results to determine what actions to take
3. Finally, call the appropriate action tools (e.g., deleteList, archiveList, updateReminder)

Example: "Delete all archived lists" requires:
- Step 1: getLists with includeArchived=true
- Step 2: Identify which lists have isArchived=true
- Step 3: deleteList for each archived list

If uncertain which tool to use, first call 'getUserSettings' or 'getLists'/'listReminders' to gather information, then proceed.

Current user timezone: ${timezone}
Current user ID: ${userId}`,
            tools,
            maxSteps: 8,
          } as any);
          this.logger.info(
            `Retry completed - tool calls: ${result.toolCalls.length}, tool results: ${Array.isArray(result.toolResults) ? result.toolResults.length : 0}`,
          );
          const retryToolStats = (tools as any).__stats;
          const retryToolsExecuted = retryToolStats?.executed === true;
          const stillNoTools =
            (!Array.isArray(result.toolCalls) ||
              result.toolCalls.length === 0) &&
            (!Array.isArray(result.toolResults) ||
              result.toolResults.length === 0) &&
            !retryToolsExecuted;
          if (stillNoTools) {
            this.logger.warn(
              `Tools required but missing even after retry. Flagging response.`,
            );
            return {
              text: result.text,
              toolCalls: result.toolCalls,
              toolResults: result.toolResults,
              toolsRequiredButMissing: true,
            };
          }
        }
        const finalToolStats = (tools as any).__stats;
        const finalToolsExecuted = finalToolStats?.executed === true;
        return {
          text: result.text,
          toolCalls: result.toolCalls,
          toolResults: result.toolResults,
          toolsRequiredButMissing: false,
          _toolsExecuted: finalToolsExecuted,
        };
      } catch (error: any) {
        lastError = error;
        this.logger.warn(
          { error: error.message, provider: modelConfig.provider },
          `AI request failed with ${modelConfig.provider}, trying next fallback`,
        );
        continue;
      }
    }
    this.logger.error(
      { error: lastError?.message || "Unknown error" },
      "All AI models failed to process message",
    );
    throw new Error(
      `AI service unavailable: ${lastError?.message || "All providers failed"}`,
    );
  }
  private messageLikelyNeedsTools(input: string): boolean {
    const s = (input || "").toLowerCase();
    const actionKeywords = [
      "remind",
      "reminder",
      "set a reminder",
      "schedule",
      "snooze",
      "postpone",
      "delay",
      "create",
      "add",
      "put",
      "include",
      "update",
      "change",
      "modify",
      "edit",
      "delete",
      "remove",
      "cancel",
      "complete",
      "mark as",
      "done",
      "finished",
      "list",
      "show",
      "what's on",
      "what is on",
      "find",
      "search",
      "upcoming",
      "my name",
      "who am i",
      "my phone",
      "my timezone",
      "my language",
      "my settings",
      "quiet hours",
      "notification",
      "note",
      "remember",
      "save",
      "store",
      "archive",
      "hide",
      "duplicate",
      "copy",
      "clone",
      "complete all",
      "mark all",
      "clear completed",
      "clean up",
      "stats",
      "statistics",
      "how many",
      "activity",
      "recent changes",
      "what happened",
      "bulk",
    ];
    return actionKeywords.some((k) => s.includes(k));
  }
}
