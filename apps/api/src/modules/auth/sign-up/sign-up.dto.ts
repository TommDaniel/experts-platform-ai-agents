import { Transform } from "class-transformer";
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from "class-validator";

function Match(property: string, validationOptions?: ValidationOptions) {
  return function matchDecorator(object: object, propertyName: string) {
    registerDecorator({
      name: "match",
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [property],
      validator: {
        validate(value: unknown, args: ValidationArguments): boolean {
          const [relatedPropertyName] = args.constraints;
          const relatedValue = (args.object as Record<string, unknown>)[relatedPropertyName];
          return value === relatedValue;
        },
      },
    });
  };
}

export class SignUpDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  first_name!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  last_name!: string;

  @IsEmail()
  @MaxLength(255)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value,
  )
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(72)
  password!: string;

  @IsString()
  @IsNotEmpty()
  @Match("password", { message: "confirm_password must match password" })
  confirm_password!: string;
}
