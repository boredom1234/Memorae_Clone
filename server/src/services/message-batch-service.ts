import { MessageContext } from "./whatsapp";
import pino from "pino";
interface BatchedMessage {
  context: MessageContext;
  timestamp: number;
  userId: string;
}
interface MessageBatch {
  messages: BatchedMessage[];
  userId: string;
  firstMessageTime: number;
  timeout: NodeJS.Timeout;
}
export class MessageBatchService {
  private logger = pino({ level: "info" });
  private batches = new Map<string, MessageBatch>();
  private readonly BATCH_WINDOW_MS = 2000;
  private readonly MAX_BATCH_SIZE = 10;
  async addMessage(
    context: MessageContext,
    userId: string,
    processor: (contexts: MessageContext[]) => Promise<any>,
  ): Promise<any> {
    if (context.messageType !== "image") {
      return await processor([context]);
    }
    const now = Date.now();
    const batchKey = `${userId}_images`;
    const existingBatch = this.batches.get(batchKey);
    if (existingBatch) {
      if (now - existingBatch.firstMessageTime <= this.BATCH_WINDOW_MS) {
        existingBatch.messages.push({
          context,
          timestamp: now,
          userId,
        });
        this.logger.info(
          `Added image to batch for user ${userId}. Batch size: ${existingBatch.messages.length}`,
        );
        if (existingBatch.messages.length >= this.MAX_BATCH_SIZE) {
          return await this.processBatch(batchKey, processor);
        }
        return new Promise((resolve, reject) => {
          const originalTimeout = existingBatch.timeout;
          clearTimeout(originalTimeout);
          existingBatch.timeout = setTimeout(
            async () => {
              try {
                const result = await this.processBatch(batchKey, processor);
                resolve(result);
              } catch (error) {
                reject(error);
              }
            },
            this.BATCH_WINDOW_MS - (now - existingBatch.firstMessageTime),
          );
        });
      } else {
        await this.processBatch(batchKey, processor);
        return this.createNewBatch(batchKey, context, userId, processor);
      }
    } else {
      return this.createNewBatch(batchKey, context, userId, processor);
    }
  }
  private createNewBatch(
    batchKey: string,
    context: MessageContext,
    userId: string,
    processor: (contexts: MessageContext[]) => Promise<any>,
  ): Promise<any> {
    const now = Date.now();
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(async () => {
        try {
          const result = await this.processBatch(batchKey, processor);
          resolve(result);
        } catch (error) {
          reject(error);
        }
      }, this.BATCH_WINDOW_MS);
      const batch: MessageBatch = {
        messages: [
          {
            context,
            timestamp: now,
            userId,
          },
        ],
        userId,
        firstMessageTime: now,
        timeout,
      };
      this.batches.set(batchKey, batch);
      this.logger.info(`Created new image batch for user ${userId}`);
    });
  }
  private async processBatch(
    batchKey: string,
    processor: (contexts: MessageContext[]) => Promise<any>,
  ): Promise<any> {
    const batch = this.batches.get(batchKey);
    if (!batch) {
      throw new Error(`Batch ${batchKey} not found`);
    }
    clearTimeout(batch.timeout);
    this.batches.delete(batchKey);
    const contexts = batch.messages.map((m) => m.context);
    this.logger.info(
      `Processing batch of ${contexts.length} images for user ${batch.userId}`,
    );
    try {
      if (contexts.length === 1) {
        return await processor(contexts);
      }
      const messageWithCaption = contexts.find(
        (ctx) => ctx.text && ctx.text.trim().length > 0,
      );
      if (messageWithCaption) {
        this.logger.info(
          `Found message with caption: "${messageWithCaption.text}". Processing ${contexts.length} images together.`,
        );
        return await processor(contexts);
      } else {
        this.logger.info(
          `No caption found. Processing ${contexts.length} images individually with rate limiting.`,
        );
        const results = [];
        for (let i = 0; i < contexts.length; i++) {
          if (i > 0) {
            await this.delay(1000);
          }
          const result = await processor([contexts[i]]);
          results.push(result);
        }
        return results[results.length - 1];
      }
    } catch (error) {
      this.logger.error({ error }, `Error processing batch ${batchKey}`);
      throw error;
    }
  }
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  cleanup(): void {
    const now = Date.now();
    const expiredBatches: string[] = [];
    for (const [key, batch] of this.batches.entries()) {
      if (now - batch.firstMessageTime > this.BATCH_WINDOW_MS * 2) {
        expiredBatches.push(key);
        clearTimeout(batch.timeout);
      }
    }
    expiredBatches.forEach((key) => {
      this.batches.delete(key);
      this.logger.warn(`Cleaned up expired batch: ${key}`);
    });
  }
  getStats(): {
    activeBatches: number;
    totalMessages: number;
  } {
    let totalMessages = 0;
    for (const batch of this.batches.values()) {
      totalMessages += batch.messages.length;
    }
    return {
      activeBatches: this.batches.size,
      totalMessages,
    };
  }
}
