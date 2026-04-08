/**
 * Structured output via forced tool use — works with all SDK versions.
 * Claude is forced to call a named tool, which guarantees JSON matching the schema.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

/** Build an Anthropic Tool definition from a Zod schema. */
export function zodTool<T extends z.ZodType>(
  name: string,
  description: string,
  schema: T
): Anthropic.Tool {
  const jsonSchema = zodToJsonSchema(schema, { $refStrategy: "none" });
  const { $schema, ...inputSchema } = jsonSchema as Record<string, unknown>;
  return {
    name,
    description,
    input_schema: inputSchema as Anthropic.Tool["input_schema"],
  };
}

/** Extract and validate the input from a forced tool call response. */
export function extractToolInput<T extends z.ZodType>(
  content: Anthropic.ContentBlock[],
  schema: T,
  toolName: string
): z.infer<T> {
  const block = content.find(
    (b): b is Anthropic.ToolUseBlock =>
      b.type === "tool_use" && b.name === toolName
  );
  if (!block) throw new Error(`Tool '${toolName}' not found in response`);
  return schema.parse(block.input);
}
