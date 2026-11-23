import { Injectable } from "@nestjs/common";
import { getExpert, listExperts } from "@repo/experts";
import type { ExpertDefinition, ExpertSlug } from "@repo/experts";

@Injectable()
export class ExpertsService {
  list(): readonly ExpertDefinition[] {
    return listExperts();
  }

  find(slug: string): ExpertDefinition | undefined {
    return getExpert(slug as ExpertSlug);
  }
}
