import { Controller, Get, Param } from "@nestjs/common";
import type { ExpertDefinition } from "@repo/experts";
import { ExpertsService } from "./experts.service";

@Controller("experts")
export class ExpertsController {
  constructor(private readonly expertsService: ExpertsService) {}

  @Get()
  list(): readonly ExpertDefinition[] {
    return this.expertsService.list();
  }

  @Get(":slug")
  find(@Param("slug") slug: string): ExpertDefinition | null {
    return this.expertsService.find(slug) ?? null;
  }
}
