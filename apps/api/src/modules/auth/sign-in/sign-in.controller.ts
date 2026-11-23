import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UsePipes,
  ValidationPipe,
} from "@nestjs/common";
import { Public } from "../session/public.decorator";
import { SignInDto } from "./sign-in.dto";
import { SignInService } from "./sign-in.service";

@Controller("auth")
@Public()
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class SignInController {
  constructor(private readonly signInService: SignInService) {}

  @Post("sign-in")
  @HttpCode(HttpStatus.OK)
  async signIn(@Body() dto: SignInDto): Promise<{ token: string }> {
    const token = await this.signInService.signIn(dto.email, dto.password);
    return { token };
  }
}
