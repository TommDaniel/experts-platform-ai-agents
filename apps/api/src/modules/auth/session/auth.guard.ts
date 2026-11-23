import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { parseBearerToken } from "../../shared/tokens/interface/bearer-token.parser";
import { IS_PUBLIC_KEY } from "./public.decorator";
import { SessionService } from "./session.service";
import type { AuthenticatedRequest } from "./auth.types";

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly sessionService: SessionService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

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
