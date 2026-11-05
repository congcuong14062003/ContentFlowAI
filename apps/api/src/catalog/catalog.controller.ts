import { Body, Controller, Delete, Get, Inject, Param, ParseUUIDPipe, Patch, Post, Query, Req, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { AuthGuard, AuthRateGuard, type AuthRequest } from '../identity/auth.guard';
import { BrandDto, CatalogQuery, LogoDto, ProductDto } from './catalog.dto';
import { CatalogService } from './catalog.service';
import { MAX_IMAGE_SIZE, type ImageUpload } from './image-validation';
@Controller('workspaces/:workspaceId') @UseGuards(AuthGuard)
export class CatalogController {
  constructor(@Inject(CatalogService) private readonly service: CatalogService) {}
  @Get('catalog-entitlement') allowance(@Req() r: AuthRequest, @Param('workspaceId', ParseUUIDPipe) w: string) { return this.service.allowance(w, r.principal.id); }
  @Get('brands') brands(@Req() r: AuthRequest, @Param('workspaceId', ParseUUIDPipe) w: string, @Query() q: CatalogQuery) { return this.service.list(w, r.principal.id, 'brands', q); }
  @Post('brands') createBrand(@Req() r: AuthRequest, @Param('workspaceId', ParseUUIDPipe) w: string, @Body() dto: BrandDto) { return this.service.saveBrand(w, r.principal.id, dto); }
  @Get('brands/:id') brand(@Req() r: AuthRequest, @Param('workspaceId', ParseUUIDPipe) w: string, @Param('id', ParseUUIDPipe) id: string) { return this.service.detail(w, r.principal.id, 'brands', id); }
  @Get('brands/:id/context') context(@Req() r: AuthRequest, @Param('workspaceId', ParseUUIDPipe) w: string, @Param('id', ParseUUIDPipe) id: string) { return this.service.brandContext(w, r.principal.id, id); }
  @Patch('brands/:id') updateBrand(@Req() r: AuthRequest, @Param('workspaceId', ParseUUIDPipe) w: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: BrandDto) { return this.service.saveBrand(w, r.principal.id, dto, id); }
  @Delete('brands/:id') deleteBrand(@Req() r: AuthRequest, @Param('workspaceId', ParseUUIDPipe) w: string, @Param('id', ParseUUIDPipe) id: string) { return this.service.remove(w, r.principal.id, 'brands', id); }
  @Post('brands/:id/default') defaultBrand(@Req() r: AuthRequest, @Param('workspaceId', ParseUUIDPipe) w: string, @Param('id', ParseUUIDPipe) id: string) { return this.service.defaultBrand(w, r.principal.id, id); }
  @Patch('brands/:id/logo') logo(@Req() r: AuthRequest, @Param('workspaceId', ParseUUIDPipe) w: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: LogoDto) { return this.service.logo(w, r.principal.id, id, dto.assetId); }
  @Get('products') products(@Req() r: AuthRequest, @Param('workspaceId', ParseUUIDPipe) w: string, @Query() q: CatalogQuery) { return this.service.list(w, r.principal.id, 'products', q); }
  @Post('products') createProduct(@Req() r: AuthRequest, @Param('workspaceId', ParseUUIDPipe) w: string, @Body() dto: ProductDto) { return this.service.saveProduct(w, r.principal.id, dto); }
  @Get('products/:id') product(@Req() r: AuthRequest, @Param('workspaceId', ParseUUIDPipe) w: string, @Param('id', ParseUUIDPipe) id: string) { return this.service.detail(w, r.principal.id, 'products', id); }
  @Patch('products/:id') updateProduct(@Req() r: AuthRequest, @Param('workspaceId', ParseUUIDPipe) w: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ProductDto) { return this.service.saveProduct(w, r.principal.id, dto, id); }
  @Delete('products/:id') deleteProduct(@Req() r: AuthRequest, @Param('workspaceId', ParseUUIDPipe) w: string, @Param('id', ParseUUIDPipe) id: string) { return this.service.remove(w, r.principal.id, 'products', id); }
  @Post('brands/:id/assets') @UseGuards(AuthRateGuard) @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMAGE_SIZE, files: 1, fields: 0, parts: 1 } }))
  uploadBrand(@Req() r: AuthRequest, @Param('workspaceId', ParseUUIDPipe) w: string, @Param('id', ParseUUIDPipe) id: string, @UploadedFile() file?: ImageUpload) { return this.service.upload(w, r.principal.id, 'brands', id, file); }
  @Post('products/:id/assets') @UseGuards(AuthRateGuard) @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMAGE_SIZE, files: 1, fields: 0, parts: 1 } }))
  uploadProduct(@Req() r: AuthRequest, @Param('workspaceId', ParseUUIDPipe) w: string, @Param('id', ParseUUIDPipe) id: string, @UploadedFile() file?: ImageUpload) { return this.service.upload(w, r.principal.id, 'products', id, file); }
  @Get('assets/:id') async asset(@Req() r: AuthRequest, @Res() response: Response, @Param('workspaceId', ParseUUIDPipe) w: string, @Param('id', ParseUUIDPipe) id: string) {
    const asset = await this.service.asset(w, r.principal.id, id);
    response.set({ 'Content-Type': asset.mimeType, 'Content-Length': String(asset.body.length), 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'inline' }).send(asset.body);
  }
  @Delete('assets/:id') deleteAsset(@Req() r: AuthRequest, @Param('workspaceId', ParseUUIDPipe) w: string, @Param('id', ParseUUIDPipe) id: string) { return this.service.removeAsset(w, r.principal.id, id); }
}
