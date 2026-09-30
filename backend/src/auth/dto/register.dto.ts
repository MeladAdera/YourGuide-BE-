import {
  IsEmail,
  IsString,
  IsTimeZone,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  // The upper limit stops someone sending a huge password to keep the
  // server busy hashing it.
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  // An IANA name such as "Asia/Dubai", checked with Intl.DateTimeFormat.
  @IsTimeZone()
  timezone!: string;
}
