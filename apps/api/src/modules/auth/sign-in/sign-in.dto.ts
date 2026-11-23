import { IsEmail, IsNotEmpty, IsString, MaxLength } from "class-validator";

export class SignInDto {
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(72)
  password!: string;
}
