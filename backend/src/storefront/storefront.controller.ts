import { Controller, Get, Param, Query } from '@nestjs/common';
import { StorefrontService } from './storefront.service';
import { CatalogQueryDto, FarmsQueryDto, SuggestQueryDto } from './dto/storefront-query.dto';

/** Public, read-only endpoints behind the customer storefront. */
@Controller('storefront')
export class StorefrontController {
  constructor(private readonly storefrontService: StorefrontService) {}

  @Get('overview')
  overview() {
    return this.storefrontService.overview();
  }

  @Get('catalog')
  catalog(@Query() query: CatalogQueryDto) {
    return this.storefrontService.catalog(query);
  }

  @Get('suggest')
  suggest(@Query() query: SuggestQueryDto) {
    return this.storefrontService.suggest(query.q);
  }

  @Get('farms')
  farms(@Query() query: FarmsQueryDto) {
    return this.storefrontService.farms(query);
  }

  @Get('farms/:id')
  farm(@Param('id') id: string) {
    return this.storefrontService.farm(id);
  }
}
