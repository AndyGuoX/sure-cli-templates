import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { env } from '../config/env.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { EmailCode } from './entities/email-code.entity.js';
import { User } from './entities/user.entity.js';
import { EmailService } from './email.service.js';
import { JwtStrategy } from './jwt.strategy.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, EmailCode]),
    PassportModule,
    // registerAsync：secret 在**建容器时**才求值，模块文件被导入的那一刻不读环境变量
    // （否则 e2e 用例连 import AppModule 都过不去）。「缺密钥启动即失败」由 main.ts 保证。
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: env.jwtSecret,
        signOptions: { expiresIn: '7d' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, EmailService, JwtStrategy],
})
export class AuthModule {}
