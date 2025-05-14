import {  IsNotEmpty, IsString } from 'class-validator';

export class RegisterDto {

  @IsString()
  @IsNotEmpty()
  username: string;
  email: string;
  password: string;
  }