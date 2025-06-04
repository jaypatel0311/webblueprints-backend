// filepath: src/users/users.service.ts
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UserDocument } from './schemas/user.schema';
import * as argon2 from 'argon2';
import { Role } from 'src/auth/enums/role.enums';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel('User') private readonly userModel: Model<UserDocument>
  ) {}

  async findOne(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email }).exec();
  }

  async create(username: string, email: string, hashedPassword: string, role: Role = Role.USER): Promise<UserDocument> {
    const newUser = new this.userModel({
      username,
      email,
      password: hashedPassword,
      role
    });
    return newUser.save();
  }

  async findByEmail(email: string): Promise<UserDocument | null> {
    const user = await this.userModel.findOne({ email }).exec();
    return user;
  }

  

  async updateRefreshToken(userId: string, refreshToken: string | null): Promise<UserDocument> {
    const user = await this.userModel
      .findByIdAndUpdate(
        userId,
        { refreshToken },
        { new: true }
      )
      .exec();
    
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async findById(id: string): Promise<UserDocument> {
    const user = await this.userModel.findById(id).exec();
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async updateRole(userId: string, role: Role): Promise<UserDocument> {
    const updatedUser = await this.userModel.findByIdAndUpdate(
      userId,
      { role },
      { new: true }
    ).exec();

    if (!updatedUser) {
      throw new NotFoundException('User not found');
    }

    return updatedUser;
  }

  async hasRole(userId: string, role: Role): Promise<boolean> {
    const user = await this.userModel.findById(userId).exec();
    return user?.role === role;
  }
}