import {
  Controller,
  Get,
  Put,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { ProfileService } from './profile.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import {
  UpdateRespondentProfileSchema,
  UpdateRespondentProfileDto,
} from './dto/update-respondent-profile.dto';
import {
  UpdateSurveyorProfileSchema,
  UpdateSurveyorProfileDto,
} from './dto/update-surveyor-profile.dto';

@Controller('profile')
@UseGuards(JwtAuthGuard)
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get('me')
  getMe(@Req() req: Request) {
    const user = req.user as AuthenticatedUser;
    return this.profileService.getMyProfile(user.id, user.role);
  }

  @Put('respondent')
  updateRespondent(
    @Req() req: Request,
    @Body(new ZodValidationPipe(UpdateRespondentProfileSchema)) dto: UpdateRespondentProfileDto,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.profileService.upsertRespondentProfile(user.id, dto);
  }

  @Put('surveyor')
  updateSurveyor(
    @Req() req: Request,
    @Body(new ZodValidationPipe(UpdateSurveyorProfileSchema)) dto: UpdateSurveyorProfileDto,
  ) {
    const user = req.user as AuthenticatedUser;
    return this.profileService.upsertSurveyorProfile(user.id, dto);
  }
}
