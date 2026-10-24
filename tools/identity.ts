import type { Plugin } from "@opencode/plugin"
import type { Resolver } from "./session_store.ts"

export function makeIdentity(ctx: Pick<Plugin.Context, "session">): Resolver {
  return async (id, messageID) => {
    const session = await ctx.session.get({ sessionID: id })
    if (!session || session.id !== id) throw new Error("Sesión OpenCode no verificable")
    let agent = session.agent
    if (messageID) {
      const messages = await ctx.session.context({ sessionID: id })
      const message = messages.find((message) => message.id === messageID)
      if (!message || message.type !== "assistant") throw new Error("No hay mensaje de agente atribuible")
      agent = message.agent
    }
    if (!agent) throw new Error("Agente OpenCode no verificable")
    return { id: session.id, parentID: session.parentID, agent,
      title: session.title ?? "", created: session.time.created, directory: session.location.directory }
  }
}
