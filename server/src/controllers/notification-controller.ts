import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
  validateBody,
  validateQuery,
  rateLimitByUser,
  sendReminderToContactSchema,
  getNotificationHistoryQuerySchema,
  sendCustomMessageSchema,
} from "../middleware/validation";
import { NotificationService } from "../services/notification-service";
export async function registerNotificationRoutes(app: FastifyInstance) {
  const service = new NotificationService();
  app.post(
    "/api/v1/notifications/send-reminder-to-contact",
    {
      preHandler: [
        rateLimitByUser(20, 60000),
        validateBody(sendReminderToContactSchema),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.headers["x-user-id"] as string;
      if (!userId) {
        return reply.status(400).send({
          error: "MISSING_USER_ID",
          message: "x-user-id header is required",
        });
      }
      const body = request.body as any;
      const result = await service.sendReminderToContact({
        senderUserId: userId,
        recipientNumber: body.recipientNumber,
        recipientName: body.recipientName,
        reminderText: body.reminderText,
        reminderTime: body.reminderTime,
        fromUserName: body.fromUserName,
      });
      return reply.send(result);
    },
  );
  app.get(
    "/api/v1/notifications/history",
    {
      preHandler: [
        rateLimitByUser(60, 60000),
        validateQuery(getNotificationHistoryQuerySchema),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = request.query as any;
      const userId = (request.headers["x-user-id"] as string) || undefined;
      const result = await service.getNotificationHistory({ ...query, userId });
      return reply.send(result);
    },
  );
  app.post(
    "/api/v1/notifications/send-custom",
    {
      preHandler: [
        rateLimitByUser(30, 60000),
        validateBody(sendCustomMessageSchema),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.headers["x-user-id"] as string;
      if (!userId) {
        return reply.status(400).send({
          error: "MISSING_USER_ID",
          message: "x-user-id header is required",
        });
      }
      const body = request.body as any;
      const result = await service.sendCustomMessage(userId, body);
      return reply.send(result);
    },
  );
}
