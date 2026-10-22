import { Plugin } from "@opencode/plugin"

export default Plugin.define({
  id: "ai-assisted-planning.markitdown-utf8",
  async setup(ctx) {
    await ctx.shell.hook("create.before", (event) => {
      event.env.PYTHONIOENCODING = "utf-8"
    })
  },
})
