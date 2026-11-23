import { Module } from "@nestjs/common";
import { ChatController } from "./chat.controller";
import { ChatService } from "./chat.service";
import { AgentsClient } from "./agents.client";

@Module({
  controllers: [ChatController],
  providers: [ChatService, AgentsClient],
})
export class ChatModule {}
