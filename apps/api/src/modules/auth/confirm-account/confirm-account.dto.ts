import { IsNotEmpty, IsString, MaxLength } from "class-validator";

export class ConfirmAccountDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  token!: string;
}
