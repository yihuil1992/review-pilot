import { Controller, Get } from "@nestjs/common";

@Controller()
export class HealthController {
  @Get("health")
  health() {
    return {
      ok: true,
      service: "review-pilot-api",
      timestamp: new Date().toISOString()
    };
  }

  @Get("ready")
  ready() {
    return {
      ok: true,
      checks: {
        api: "ready"
      }
    };
  }
}

