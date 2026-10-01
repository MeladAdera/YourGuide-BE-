import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'you@example.com', maxLength: 254 })
  @IsEmail()
  @MaxLength(254)
  email!: string;

  // No "at least 8 characters" rule here: login only checks the password
  // against the stored hash. The upper limit stops someone sending a huge
  // password to keep the server busy hashing it.
  @ApiProperty({ example: 'correct horse battery', maxLength: 128 })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;
}
