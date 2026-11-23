import { Controller, Get } from "@nestjs/common";
import { Public } from "./session/public.decorator";

@Controller("auth")
@Public()
export class AuthController {
  @Get()
  getHealth(): { status: string } {
    return { status: "ok" };
  }
}
