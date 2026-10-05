import type { Plugin } from "@opencode-ai/plugin"

export default (async () => ({
  "shell.env": async (_input, output) => {
    output.env.PYTHONIOENCODING = "utf-8"
  },
})) satisfies Plugin
