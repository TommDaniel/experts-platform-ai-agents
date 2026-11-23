import { createParamDecorator, ExecutionContext, UnauthorizedException } from "@nestjs/common";
import type { SessionUser } from "./auth.types";
import type { AuthenticatedRequest } from "./auth.types";

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): SessionUser => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.session) throw new UnauthorizedException();
    return request.session.user;
  },
);
