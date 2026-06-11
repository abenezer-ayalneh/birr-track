import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { User } from './entities/user.entity'
import { StaffController } from './staff.controller'
import { UsersService } from './users.service'

@Module({
	imports: [TypeOrmModule.forFeature([User])],
	controllers: [StaffController],
	providers: [UsersService],
	exports: [TypeOrmModule, UsersService],
})
export class UsersModule {}
