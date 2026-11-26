import { Module } from '@nestjs/common';
import { ArchiveController } from './archive.controller';
import { ArchiveRepository } from './archive.repository';
import { ArchiveGuard } from './archive-auth';
@Module({
  controllers: [ArchiveController],
  providers: [ArchiveRepository, ArchiveGuard],
})
export class ArchiveModule {}
