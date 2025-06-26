import { Controller, Get, Post, Body, Param, Put, Query, UseGuards, Req, ForbiddenException, Logger, InternalServerErrorException } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enums';
import { UserDocument } from './schemas/user.schema';

@Controller('users')
export class UsersController {
    private readonly logger = new Logger(UsersController.name);

  constructor(private readonly usersService: UsersService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  async getAllUsers(@Req() req) {
    try {
      this.logger.log(`User ${req.user?.userId} requesting all users`);
      return await this.usersService.getAllUsers();
    } catch (error) {
      this.logger.error(`Error fetching all users: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to retrieve users');
    }
  }
  
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async findOne(@Param('id') id: string, @Req() req) {
    // Allow users to get their own profile or admins to get any profile
    if (req.user.userId !== id && req.user.role !== Role.ADMIN) {
      throw new ForbiddenException('You do not have permission to access this user profile');
    }
    return this.usersService.findById(id);
  }
  
  @Put(':id')
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('id') id: string, 
    @Body() updateData: Partial<UserDocument>,
    @Req() req
  ) {
    return this.usersService.updateUser(
      id,
      updateData,
      req.user.userId,
      req.user.role
    );
  }
}