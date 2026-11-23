import { Module } from "@nestjs/common";
import { ConnectionsController } from "./connections.controller";
import { ConnectionsService } from "./connections.service";
import { IngestionService } from "./ingestion.service";

@Module({
  controllers: [ConnectionsController],
  providers: [ConnectionsService, IngestionService],
  exports: [ConnectionsService],
})
export class ConnectionsModule {}
