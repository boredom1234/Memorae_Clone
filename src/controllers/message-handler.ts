import { MessageContext } from '../services/whatsapp';
import pino from 'pino';

export class MessageController {
  private logger = pino({ level: 'info' });

  async handleMessage(context: MessageContext): Promise<void> {
    try {
      const { fromName, messageType } = context;

      this.logger.info(`Processing message from ${fromName}`);

      // Handle different message types
      switch (messageType) {
        case 'text':
          await this.handleTextMessage(context);
          break;
        case 'image':
          await this.handleImageMessage(context);
          break;
        case 'audio':
          await this.handleAudioMessage(context);
          break;
        default:
          this.logger.info(`Unsupported message type: ${messageType}`);
      }
    } catch (error) {
      this.logger.error({ error }, 'Error in message controller');
    }
  }

  private async handleTextMessage(context: MessageContext): Promise<void> {
    const { text } = context;
    
    if (!text) return;

    this.logger.info(`Text message: "${text}"`);

    // TODO: Implement AI intent detection and tool calling
    // For now, just log the message
    
    // Example patterns to detect:
    // - "Remind me to..." -> createReminder
    // - "Add ... to my list" -> addItemToList
    // - "What's on my schedule?" -> getUpcomingReminders
    // - "Show my lists" -> getLists
  }

  private async handleImageMessage(_context: MessageContext): Promise<void> {
    this.logger.info('Image message received');
    
    // TODO: Implement image OCR processing
    // - Download image
    // - Extract text using Mistral OCR
    // - Analyze for tasks/dates
    // - Suggest reminders
  }

  private async handleAudioMessage(_context: MessageContext): Promise<void> {
    this.logger.info('Audio message received');
    
    // TODO: Implement voice transcription
    // - Download audio
    // - Transcribe using Groq Whisper
    // - Process as text message
  }
}
