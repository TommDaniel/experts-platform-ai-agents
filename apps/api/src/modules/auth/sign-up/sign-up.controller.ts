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
import { SignUpDto } from "./sign-up.dto";
import { SignUpService } from "./sign-up.service";

const GENERIC_RESPONSE_MESSAGE = "Check your email to confirm your account";

@Controller("auth")
@Public()
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class SignUpController {
  constructor(private readonly signUpService: SignUpService) {}

  @Post("sign-up")
  @HttpCode(HttpStatus.CREATED)
  async signUp(@Body() dto: SignUpDto): Promise<{ message: string }> {
    await this.signUpService.signUp(dto);
    return { message: GENERIC_RESPONSE_MESSAGE };
  }
}
