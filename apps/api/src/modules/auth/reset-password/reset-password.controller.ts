import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UsePipes,
  ValidationPipe,
} from "@nestjs/common";
import { Public } from "../session/public.decorator";
import { ResetPasswordDto } from "./reset-password.dto";
import { ResetPasswordService } from "./reset-password.service";

const MISMATCH_MESSAGE = "Passwords do not match.";
const SUCCESS_MESSAGE = "Your password has been reset. You can now sign in.";

@Controller("auth")
@Public()
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class ResetPasswordController {
  constructor(private readonly resetPasswordService: ResetPasswordService) {}

  @Post("reset-password")
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<{ message: string }> {
    if (dto.password !== dto.confirm_password) {
      throw new BadRequestException(MISMATCH_MESSAGE);
    }
    await this.resetPasswordService.resetPassword(dto.token, dto.password);
    return { message: SUCCESS_MESSAGE };
  }
}
