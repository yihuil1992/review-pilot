import { Body, Controller, Get, Inject, Param, Post, Query, UseGuards } from "@nestjs/common";
import {
  PublishReplyBodySchema,
  RegenerateReviewBodySchema,
  ReviewListQuerySchema
} from "@review-pilot/shared";
import { OwnerAuthGuard } from "../auth/owner-auth.guard.js";
import { parseBody } from "../validation.js";
import { ReviewsService } from "./reviews.service.js";

@Controller("reviews")
export class ReviewsController {
  constructor(@Inject(ReviewsService) private readonly reviews: ReviewsService) {}

  @Get()
  @UseGuards(OwnerAuthGuard)
  list(@Query() query: unknown) {
    return this.reviews.list(ReviewListQuerySchema.parse(query));
  }

  @Get(":reviewId")
  @UseGuards(OwnerAuthGuard)
  get(@Param("reviewId") reviewId: string) {
    return this.reviews.get(reviewId);
  }

  @Get(":reviewId/signed")
  getBySignedLink(@Param("reviewId") reviewId: string, @Query("link") link?: string) {
    return this.reviews.getBySignedLink(reviewId, link);
  }

  @Post(":reviewId/generate")
  @UseGuards(OwnerAuthGuard)
  generate(@Param("reviewId") reviewId: string) {
    return this.reviews.generate(reviewId);
  }

  @Post(":reviewId/regenerate")
  @UseGuards(OwnerAuthGuard)
  regenerate(@Param("reviewId") reviewId: string, @Body() body: unknown) {
    const input = parseBody(RegenerateReviewBodySchema, body);
    return this.reviews.regenerate(reviewId, input.instruction);
  }

  @Post(":reviewId/publish")
  @UseGuards(OwnerAuthGuard)
  publish(@Param("reviewId") reviewId: string, @Body() body: unknown) {
    const input = parseBody(PublishReplyBodySchema, body);
    return this.reviews.publish(reviewId, input.body);
  }

  @Post(":reviewId/manual-handled")
  @UseGuards(OwnerAuthGuard)
  manualHandled(@Param("reviewId") reviewId: string) {
    return this.reviews.markManualHandled(reviewId);
  }

  @Post("notifications/send-due")
  @UseGuards(OwnerAuthGuard)
  sendDueNotifications() {
    return this.reviews.sendDueNotifications();
  }
}
