import { tool as legacyTool, type ToolContext as LegacyToolContext } from "@opencode-ai/plugin"
import type { Resolver } from "./session_store.ts"

export type ToolContext = Pick<LegacyToolContext, "sessionID" | "messageID" | "agent"> & { resolver: Resolver }

// Keep the existing schemas, but require a resolver supplied by the registering plugin.
export function tool<Args extends legacyTool.schema.ZodRawShape>(definition: {
  description: string
  args: Args
  execute(args: legacyTool.schema.infer<legacyTool.schema.ZodObject<Args>>, context: ToolContext): Promise<string>
}) {
  return definition
}
tool.schema = legacyTool.schema
