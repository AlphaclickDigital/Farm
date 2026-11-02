import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Query,
  Request,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { NotificationsService } from './notifications.service';
import { ListNotificationsDto } from './dto/list-notifications.dto';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  list(@Request() req: any, @Query() query: ListNotificationsDto) {
    return this.notificationsService.list(req.user.userId, {
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 20,
      unreadOnly: query.unreadOnly === 'true',
    });
  }

  @Get('unread-count')
  async unreadCount(@Request() req: any) {
    return {
      count: await this.notificationsService.unreadCount(req.user.userId),
    };
  }

  @Post('read-all')
  markAllRead(@Request() req: any) {
    return this.notificationsService.markAllRead(req.user.userId);
  }

  @Patch(':id/read')
  markRead(@Request() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.notificationsService.markRead(req.user.userId, id);
  }
}
