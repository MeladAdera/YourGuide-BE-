import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsString,
  IsTimeZone,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'you@example.com', maxLength: 254 })
  @IsEmail()
  @MaxLength(254)
  email!: string;

  // The upper limit stops someone sending a huge password to keep the
  // server busy hashing it.
  @ApiProperty({
    example: 'correct horse battery',
    minLength: 8,
    maxLength: 128,
  })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  // An IANA name such as "Asia/Dubai", checked with Intl.DateTimeFormat.
  @ApiProperty({
    example: 'Asia/Dubai',
    description:
      'An IANA timezone name. Progress is counted per day in this timezone.',
  })
  @IsTimeZone()
  timezone!: string;
}
