import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { parseBearerToken } from "../../shared/tokens/interface/bearer-token.parser";
import { SessionService } from "./session.service";
import type { AuthenticatedRequest } from "./auth.types";

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly sessionService: SessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = parseBearerToken(request.headers.authorization);
    if (!token) throw new UnauthorizedException();

    const session = await this.sessionService.validateSession(token);
    if (!session) throw new UnauthorizedException();

    request.session = session;
    request.token = token;
    return true;
  }
}
