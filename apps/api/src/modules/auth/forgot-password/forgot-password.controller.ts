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
import { ForgotPasswordDto } from "./forgot-password.dto";
import { ForgotPasswordService } from "./forgot-password.service";

const GENERIC_RESPONSE_MESSAGE = "If the account exists, we sent a link";

@Controller("auth")
@Public()
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class ForgotPasswordController {
  constructor(private readonly forgotPasswordService: ForgotPasswordService) {}

  @Post("forgot-password")
  @HttpCode(HttpStatus.ACCEPTED)
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<{ message: string }> {
    await this.forgotPasswordService.requestPasswordReset(dto.email);
    return { message: GENERIC_RESPONSE_MESSAGE };
  }
}
