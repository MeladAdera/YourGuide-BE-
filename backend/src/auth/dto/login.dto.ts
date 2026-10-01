import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  // No "at least 8 characters" rule here: login only checks the password
  // against the stored hash. The upper limit stops someone sending a huge
  // password to keep the server busy hashing it.
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;
}
