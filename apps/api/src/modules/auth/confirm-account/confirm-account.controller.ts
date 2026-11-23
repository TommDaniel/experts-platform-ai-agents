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
import { ConfirmAccountDto } from "./confirm-account.dto";
import { ConfirmAccountService } from "./confirm-account.service";

@Controller("auth")
@Public()
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class ConfirmAccountController {
  constructor(private readonly confirmAccountService: ConfirmAccountService) {}

  @Post("confirm-account")
  @HttpCode(HttpStatus.OK)
  async confirmAccount(@Body() dto: ConfirmAccountDto): Promise<{ token: string }> {
    const token = await this.confirmAccountService.confirmAccount(dto.token);
    return { token };
  }
}
