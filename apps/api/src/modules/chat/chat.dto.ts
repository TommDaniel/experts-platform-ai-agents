import { IsIn, IsNotEmpty, IsString, MaxLength } from "class-validator";
import { EXPERT_SLUGS } from "@repo/experts";

export class CreateConversationDto {
  @IsString()
  @IsIn(EXPERT_SLUGS as readonly string[])
  expertSlug!: string;
}

export class SendMessageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  content!: string;
}
