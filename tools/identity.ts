import type { Plugin } from "@opencode/plugin"
import type { Resolver } from "./session_store.ts"

type ModelSelection = { providerID: string; id: string; variant?: string }
type ModelResolver = Resolver & { model?: (id: string) => Promise<ModelSelection | undefined> }

// Call only after session_work has verified the assignment. No arbitrary session input or change channel.
export async function workModel(get: ModelResolver, sessionID: string, now = Date.now) {
  const model = await get.model?.(sessionID)
  return { session_id: sessionID, estado: model ? "observado" : "no_disponible",
    procedencia: "session.get", alcance: "siguientes_solicitudes", comprobado_en: now(), ...(model ? { modelo: model } : {}) }
}

export function makeIdentity(ctx: Pick<Plugin.Context, "session">): ModelResolver {
  const resolver: Resolver = async (id, messageID) => {
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
  resolver.messages = async id => (await ctx.session.context({ sessionID: id })).map(message => ({
    id: message.id, type: message.type,
    ...(message.type === "user" ? { text: message.text } : {}),
    ...(message.type === "assistant" ? { agent: message.agent, finish: message.finish,
      completed: message.time.completed,
      text: message.content.filter(part => part.type === "text").map(part => part.text).join("\n"),
      active: message.content.some(part => part.type === "tool" && ["pending", "running"].includes(part.state.status)) } : {}),
  }))
  const identity: ModelResolver = resolver
  identity.model = async id => {
    const session = await ctx.session.get({ sessionID: id })
    if (session.id !== id) throw new Error("Selección de otra sesión OpenCode")
    // An absent selection is not the parent's model, the default, or the last request's model.
    return session.model ? { providerID: session.model.providerID, id: session.model.id,
      ...(session.model.variant ? { variant: session.model.variant } : {}) } : undefined
  }
  return identity
}
