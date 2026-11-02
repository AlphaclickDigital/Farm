import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Resolves the caller's vendor profile from their JWT and pins it to
 * `req.vendorId`. Vendor analytics endpoints never accept a vendor id from
 * the client, so one vendor can't request another vendor's figures.
 */
@Injectable()
export class VendorGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId: string | undefined = request.user?.userId;
    if (!userId) throw new UnauthorizedException();

    const vendor = await this.prisma.vendor.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!vendor) throw new ForbiddenException('Vendor access required');

    request.vendorId = vendor.id;
    return true;
  }
}
