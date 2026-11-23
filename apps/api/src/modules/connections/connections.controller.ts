import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  UploadedFile,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { CurrentUser } from "../auth/session/current-user.decorator";
import type { SessionUser } from "../auth/session/auth.types";
import { ConnectionsService } from "./connections.service";
import { ConnectUrlDto } from "./connections.dto";
import { isAllowedUpload, type UploadedFileData } from "./uploads.util";

const MAX_UPLOAD_SIZE_BYTES = Number(process.env.MAX_UPLOAD_SIZE_MB ?? 50) * 1024 * 1024;

@Controller("connections")
export class ConnectionsController {
  constructor(private readonly connectionsService: ConnectionsService) {}

  @Get()
  list(@CurrentUser() user: SessionUser) {
    return this.connectionsService.list(user.id);
  }

  @Post("url")
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  connectUrl(@Body() dto: ConnectUrlDto, @CurrentUser() user: SessionUser) {
    return this.connectionsService.connectUrl(user.id, dto.url);
  }

  @Post("upload")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: MAX_UPLOAD_SIZE_BYTES },
      fileFilter: (_req, file, callback) => {
        if (!isAllowedUpload(file.originalname, file.mimetype)) {
          callback(
            new BadRequestException(
              "File type not supported. Allowed: PDF, TXT, Markdown, JPG/PNG, MP4, MP3.",
            ),
            false,
          );
          return;
        }
        callback(null, true);
      },
    }),
  )
  upload(@UploadedFile() file: UploadedFileData | undefined, @CurrentUser() user: SessionUser) {
    if (!file) throw new BadRequestException("file field is required");
    return this.connectionsService.upload(user.id, file);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.OK)
  remove(@Param("id", ParseIntPipe) id: number, @CurrentUser() user: SessionUser) {
    return this.connectionsService.remove(user.id, id);
  }
}
