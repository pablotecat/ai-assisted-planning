// OpenCode prefixes MCP tools with the configured server alias.
export function jiraAliasStatus(config) {
  // V2 returns ordered configuration sources, not one merged V1 document.
  if (Array.isArray(config)) {
    const servers = {}
    for (const entry of config) Object.assign(servers, entry.info?.mcp?.servers ?? {})
    config = { mcp: { servers } }
  }
  const aliases = ["jira", "atlassian"]
  const servers = Object.entries(config.mcp?.servers ?? config.mcp ?? {})
    .filter(([, server]) => server.enabled !== false && server.disabled !== true)
  for (const [name, server] of servers) {
    const connection = [server.url, ...(server.command ?? [])].filter((value) => typeof value === "string")
    if (!aliases.includes(name) && connection.some((value) => /https:\/\/mcp\.atlassian\.com(?:[/:?]|$)/i.test(value)))
      throw new Error(`Atlassian MCP usa el alias «${name}», sin permisos en estos agentes. Configúralo como «jira» o «atlassian» y vuelve a ejecutar la instalación.`)
  }
  const configured = servers.filter(([name]) => aliases.includes(name)).map(([name]) => name)
  return configured.length
    ? `Alias Jira admitidos configurados: ${configured.join(", ")}. Comprueba conexión y autenticación con «opencode mcp list».`
    : "Jira pendiente: conecta y autentica Atlassian MCP con el alias «jira» o «atlassian». Compruébalo con «opencode mcp list»."
}
