import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Sse,
  UsePipes,
  ValidationPipe,
} from "@nestjs/common";
import type { MessageEvent } from "@nestjs/common";
import { Observable } from "rxjs";
import { CurrentUser } from "../auth/session/current-user.decorator";
import type { SessionUser } from "../auth/session/auth.types";
import { ChatService } from "./chat.service";
import { CreateConversationDto, SendMessageDto } from "./chat.dto";

@Controller("chat")
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post("conversations")
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  createConversation(@Body() dto: CreateConversationDto, @CurrentUser() user: SessionUser) {
    return this.chatService.createConversation(user.id, dto.expertSlug);
  }

  @Get("conversations")
  listConversations(@CurrentUser() user: SessionUser) {
    return this.chatService.listConversations(user.id);
  }

  @Get("conversations/:id/messages")
  getMessages(@Param("id", ParseIntPipe) id: number, @CurrentUser() user: SessionUser) {
    return this.chatService.getMessages(user.id, id);
  }

  @Post("conversations/:id/messages")
  @Sse()
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  stream(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: SendMessageDto,
    @CurrentUser() user: SessionUser,
  ): Observable<MessageEvent> {
    return this.chatService.streamMessage(user.id, id, dto.content);
  }
}
