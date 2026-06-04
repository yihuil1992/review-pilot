import { Body, Controller, Get, Inject, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { AuthService, ownerSessionCookieName } from "./auth.service.js";
import { parseBody } from "../validation.js";

export const csrfCookieName = "rp_csrf";
const ownerSessionMaxAgeMs = 1000 * 60 * 60 * 24 * 180;

const setupSchema = z.object({
  email: z.string().email().optional().or(z.literal("")),
  password: z.string().min(12)
});

const loginSchema = z.object({
  password: z.string().min(1)
});

@Controller("auth")
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Get("me")
  async me(@Req() request: Request) {
    const token = parseCookie(request.headers.cookie ?? "")[ownerSessionCookieName];
    const session = await this.auth.verifyToken(token);
    return {
      authenticated: Boolean(session),
      ownerId: session?.ownerId ?? null
    };
  }

  @Post("setup-owner")
  async setupOwner(@Body() body: unknown, @Res({ passthrough: true }) response: Response) {
    const input = parseBody(setupSchema, body);
    const owner = await this.auth.setupOwner(input.password, input.email || null);
    const { token } = await this.auth.login(input.password);
    setSessionCookie(response, token);
    return { ok: true, ownerConfigured: true, ownerId: owner.ownerId };
  }

  @Post("login")
  async login(@Body() body: unknown, @Res({ passthrough: true }) response: Response) {
    const input = parseBody(loginSchema, body);
    const { token } = await this.auth.login(input.password);
    setSessionCookie(response, token);
    return { ok: true };
  }

  @Post("logout")
  logout(@Res({ passthrough: true }) response: Response) {
    response.clearCookie(ownerSessionCookieName, cookieOptions());
    response.clearCookie(csrfCookieName, {
      sameSite: "lax" as const,
      secure: process.env.NODE_ENV === "production",
      path: "/"
    });
    return { ok: true };
  }
}

function setSessionCookie(response: Response, token: string) {
  response.cookie(ownerSessionCookieName, token, cookieOptions());
    response.cookie(csrfCookieName, randomBytes(24).toString("base64url"), {
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ownerSessionMaxAgeMs
  });
}

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ownerSessionMaxAgeMs
  };
}

function parseCookie(header: string): Record<string, string> {
  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        if (index === -1) {
          return [part, ""];
        }
        return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      })
  );
}
