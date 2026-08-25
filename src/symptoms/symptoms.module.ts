import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SymptomSuggestionTb } from './symptom-suggestion.entity';
import { SymptomsService } from './symptoms.service';
import { SymptomsController } from './symptoms.controller';
import { SymptomsRepository } from './symptoms.repository';

@Module({
  imports: [TypeOrmModule.forFeature([SymptomSuggestionTb])],
  controllers: [SymptomsController],
  providers: [SymptomsRepository, SymptomsService],
  exports: [SymptomsService],
})
export class SymptomsModule {}
