import { Controller, Get, Inject, Param, Post, Query, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { OwnerAuthGuard } from "../auth/owner-auth.guard.js";
import { NotificationsService } from "./notifications.service.js";

const notificationListQuerySchema = z.object({
  status: z.enum(["pending", "sent", "failed", "canceled", "none"]).optional()
});

@Controller("notifications")
@UseGuards(OwnerAuthGuard)
export class NotificationsController {
  constructor(@Inject(NotificationsService) private readonly notifications: NotificationsService) {}

  @Get("tasks")
  listTasks(@Query() query: unknown) {
    return this.notifications.listTasks(notificationListQuerySchema.parse(query));
  }

  @Post("run-due")
  runDue() {
    return this.notifications.sendDueNotifications("manual");
  }

  @Post("tasks/:reviewId/send-now")
  sendNow(@Param("reviewId") reviewId: string) {
    return this.notifications.sendNow(reviewId);
  }

  @Post("tasks/:reviewId/cancel")
  cancel(@Param("reviewId") reviewId: string) {
    return this.notifications.cancel(reviewId);
  }

  @Post("tasks/:reviewId/rerun")
  rerun(@Param("reviewId") reviewId: string) {
    return this.notifications.rerun(reviewId);
  }
}
