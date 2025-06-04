import { Injectable, UnauthorizedException, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import * as argon2 from 'argon2';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { log } from 'console';
import { Role } from './enums/role.enums';

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private usersService: UsersService,
  ) {}

  private async validateUser(email: string, password: string) {
    try {
      const user = await this.usersService.findByEmail(email);
      if (!user) {
        throw new UnauthorizedException('Invalid credentials');
      }
  
      const isPasswordValid = await argon2.verify(user.password, password);
      console.log('Password validation:', {
        password,
        hashedPassword: user.password,
        isValid: isPasswordValid
      });
  
      if (!isPasswordValid) {
        throw new UnauthorizedException('Invalid credentials');
      }
  
      const { password: _, ...result } = user.toObject();
      return result;
    } catch (error) {
      console.error('Authentication error:', error);
      throw new UnauthorizedException('Invalid credentials');
    }
  }
 
  async register(registerDto: RegisterDto) {
    try {
      // Check existing user
      const existingUser = await this.usersService.findByEmail(registerDto.email);
      if (existingUser) {
        throw new BadRequestException('User already exists');
      }
  
      // Generate hash
      const hashedPassword = await argon2.hash(registerDto.password);
  
      // Create user
      const newUser = await this.usersService.create(
        registerDto.username,
        registerDto.email,
        hashedPassword
      );
  
      // Generate tokens
      const tokens = await this.getTokens(newUser._id.toString(), newUser.email, newUser.role);
  
      // Return user data
      const { password, ...userWithoutPassword } = newUser.toObject();
      return {
        user: userWithoutPassword,
        ...tokens
      };
    } catch (error) {
      console.error('Registration error:', error);
      throw new BadRequestException('Registration failed');
    }
  }



  async login(loginDto: LoginDto) {
    try {
      // Find user
      const user = await this.usersService.findByEmail(loginDto.email);
      if (!user) {
        throw new UnauthorizedException('Invalid credentials');
      }
  
      // Verify password
      const isPasswordValid = await argon2.verify(user.password, loginDto.password);
  
      if (!isPasswordValid) {
        throw new UnauthorizedException('Invalid credentials');
      }
  
      // Generate tokens
      const tokens = await this.getTokens(user._id.toString(), user.email, user.role);
  
      // Return user data
      const { password, ...userWithoutPassword } = user.toObject();
      return {
        user: {
          ...userWithoutPassword,
          role: user.role // Explicitly include role in response
        },
        ...tokens
      };
    } catch (error) {
      console.error('Login error:', error);
      throw new UnauthorizedException('Invalid credentials');
    }
  }

  async changePassword(userId: string, oldPassword: string, newPassword: string) {
    if (!userId) {
      throw new UnauthorizedException('User ID is required');
    }
  
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
  
    const isOldPasswordValid = await argon2.verify(user.password, oldPassword);
    if (!isOldPasswordValid) {
      throw new BadRequestException('Old password is incorrect');
    }
  
    const hashedPassword = await argon2.hash(newPassword);
    // await this.usersService.updatePassword(userId, hashedPassword);
  
    return { message: 'Password changed successfully' };
  }

  async logout(userId: string) {
    return this.usersService.updateRefreshToken(userId, null);
  }

  async refresh(refreshToken: string) {
    try {
      const payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET
      });
      const user = await this.usersService.findById(payload.sub);
      if (!user) {
        throw new UnauthorizedException('User not found');
      }
      const tokens = await this.getTokens(user._id.toString(), user.email, user.role);
      await this.usersService.updateRefreshToken(user._id.toString(), tokens.refreshToken);
      return tokens;
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  private async getTokens(userId: string, email: string, role: Role) {
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(
        { sub: userId, email, role },
        {
          secret: process.env.JWT_SECRET,
         expiresIn: '15m'
        }
      ),
      this.jwtService.signAsync(
        { sub: userId, email, role },
        {
          secret: process.env.JWT_REFRESH_SECRET,
          expiresIn: '7d'
        }
      )
    ]);

    return {
      accessToken,
      refreshToken
    };
  }
}