import { Controller, Get, Headers, HttpCode, Post, UseGuards } from "@nestjs/common";
import { parseBearerToken } from "../../shared/tokens/interface/bearer-token.parser";
import { CurrentUser } from "./current-user.decorator";
import { Public } from "./public.decorator";
import { SessionGuard } from "./session.guard";
import { SessionService } from "./session.service";
import type { SessionUser } from "./auth.types";

@Controller("auth")
@Public()
export class SessionController {
  constructor(private readonly sessionService: SessionService) {}

  @Get("me")
  @UseGuards(SessionGuard)
  me(@CurrentUser() user: SessionUser): SessionUser {
    return user;
  }

  @Post("logout")
  @HttpCode(200)
  async logout(@Headers("authorization") authorization?: string): Promise<{ success: true }> {
    const token = parseBearerToken(authorization);
    if (token) await this.sessionService.revokeSession(token);
    return { success: true };
  }
}
