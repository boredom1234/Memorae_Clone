![][image1]

Memorae Clone Planning Document

**Features existing in Memorae:**

* WhatsApp Integration: All interactions, from setting reminders to managing lists, occur directly within WhatsApp, ensuring ease of access and reducing app fatigue.

* Unlimited and Recurring Reminders: Users can set an unlimited number of reminders, including options for daily, weekly, or custom recurring schedules.

* Voice and Image Recognition: The service can transcribe voice notes into text for reminder creation and utilize image recognition for task management, offering versatile input methods.

* Calendar Synchronization: Memorae.ai integrates with popular calendar services such as Google, Outlook, and Apple Calendar, allowing for automatic event addition and synchronization.

* Custom List Management: Users can create and manage custom lists efficiently with simple messages.

* Batch Reminder Scheduling: The platform supports scheduling multiple reminders simultaneously, enhancing productivity.

* Reminders for Others: Users have the capability to send reminders to friends or colleagues directly through Memorae.

* Integrated ChatGPT: An embedded ChatGPT provides intelligent assistance and suggestions, further enhancing the user's organizational capabilities.

* Advanced Dashboard: A dedicated dashboard allows users to review and manage all their reminders and tasks comprehensively \].

* Global Support & Security: Memorae.ai offers 24/7 support in over 100 languages, features real-time synchronization, and ensures data privacy and security through end-to-end encryption.

* Customization and Updates: The service provides complete customization options for lists and reminders and benefits from automatic updates that introduce new features.

* Advanced Search: Users can perform advanced searches across their notes and reminders using text, voice, and image inputs.

**Technical Stack Recommendations:**

* WhatsApp Integration

  * Baileys (Unofficial, Open Source) \- TypeScript/Node.js library that connects to WhatsApp Web

* Backend Framework

  * Node.js \+ Fastify

* Database

  * Supabase

* Job Scheduler

  * Bull MQ Js Library

* AI & NLP Components

  * Vercel AI SDK (Support of Most Providers out there)

  * Groq Whisper

* Image Recognition

  * Mistral OCR

* Calendar Integration

  * Google Calendar API \- OAuth2 authentication

  * Microsoft Graph API \- For Outlook

  * CalDAV \- Standard protocol for Apple Calendar, etc.

  * ical.js \- Parse/generate iCalendar format

* Hosting (For us **INTERSERVER** \- (✿◡‿◡) )

  * Vercel (Backend)

**Architecture Diagram**

**![][image2]**

**Tool Documentation**

[Tools](https://docs.google.com/spreadsheets/d/1WG0YMoNsDRpnZ8X9v5_tTOSTPnERW3KlU9QZ2K1SDmI/edit?usp=sharing)

**IDEAS**

* SuperMemory Integration
[SuperMemory.ai](https://github.com/supermemoryai/supermemorys)