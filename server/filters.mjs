import { z } from "zod";
import { providers } from "./catalog.mjs";
import { workloadTypes, scenarioIds, validScenario } from "./workloads.mjs";

export const providerIds = providers.map((p) => p.id);
export const searchParams = z
  .object({
    q: z.string().max(400).default(""),
    type: z.enum(["all", "hosting", "vps", "dedicated"]).default("all"),
    workload: z.enum(["all", ...Object.keys(workloadTypes)]).default("all"),
    scenario: z.enum(["general", ...scenarioIds]).default("general"),
    resourceMode: z.enum(["exact", "minimum"]).default("exact"),
    minDisk: z.coerce.number().min(0).max(100000).optional(),
    minRam: z.coerce.number().min(0).max(4096).optional(),
    minCpu: z.coerce.number().min(0).max(1024).optional(),
    dataGB: z.coerce.number().min(0).max(100000).optional(),
    growthGB: z.coerce.number().min(0).max(100000).optional(),
    backupCopies: z.coerce.number().int().min(0).max(30).optional(),
    gpu: z.enum(["true", "false"]).default("false"),
    region: z.enum(["all", "ir", "eu", "unknown"]).default("all"),
    provider: z
      .preprocess(
        (value) => (typeof value === "string" ? value.split(",") : value),
        z
          .array(z.enum(providerIds))
          .max(providerIds.length)
          .transform((ids) => [...new Set(ids)]),
      )
      .optional(),
    cpu: z
      .union([z.literal("all"), z.coerce.number().min(0).max(64)])
      .optional(),
    ram: z
      .union([z.literal("all"), z.coerce.number().min(0).max(256)])
      .optional(),
    disk: z
      .union([z.literal("all"), z.coerce.number().min(0).max(2000)])
      .optional(),
    maxPrice: z.coerce.number().min(0).max(1000000000).optional(),
    traffic: z.coerce.number().min(0).max(10000).default(200),
    ip: z.enum(["true", "false"]).default("true"),
    // Legacy links keep their ordering; the interface exposes price only.
    sort: z.enum(["price", "price-desc", "providers", "ram"]).default("price"),
    saved: z.enum(["true", "false"]).optional(),
  })
  .superRefine((p, ctx) => {
    if (!validScenario(p.workload, p.scenario))
      ctx.addIssue({
        code: "custom",
        path: ["scenario"],
        message: "Scenario does not match workload",
      });
  });
