import { Schema } from "@livestore/livestore";

const cloudTargetSchema = Schema.Struct({
  source: Schema.Literal("cloud"),
  providerId: Schema.String,
  modelId: Schema.String,
  dimensions: Schema.optional(Schema.Number),
});
const modelTargetSchema = Schema.Union(
  cloudTargetSchema,
  Schema.Struct({ source: Schema.Literal("local"), modelId: Schema.String }),
);
const inheritedTargetSchema = Schema.Union(
  modelTargetSchema,
  Schema.Struct({ source: Schema.Literal("inherit"), featureId: Schema.Literal("assistant") }),
);

export const modelRoutingSchema = Schema.Struct({
  assistant: Schema.optional(cloudTargetSchema),
  transcription: Schema.optional(modelTargetSchema),
  personality: Schema.optional(inheritedTargetSchema),
  sessionTitle: Schema.optional(inheritedTargetSchema),
  memoryExtraction: Schema.optional(inheritedTargetSchema),
  imageExtraction: Schema.optional(modelTargetSchema),
  formulaRecognition: Schema.optional(modelTargetSchema),
  embedding: Schema.optional(modelTargetSchema),
});

export type StoredModelRouting = typeof modelRoutingSchema.Type;
