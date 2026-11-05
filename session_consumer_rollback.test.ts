import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { cp, mkdir, mkdtemp, readFile, readdir, rename, writeFile } from "node:fs/promises"
import { dirname, join, relative } from "node:path"
import { pathToFileURL } from "node:url"
import test from "node:test"
import { prepareConsumer } from "./test-support/evidence-model/verify-model.mjs"

const source = import.meta.dirname
const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex")
const owned = ["plugin", "tools", "scripts", ".apm", "package.json", "agent-settings.example.json", "flujo-arquitectura.md"]

// Rollback is exercised only in an owned consumer. The baseline is a read-only
// export of the current HEAD, never a checkout or reintegration in the repository.
test("S14 consumidor: actualización y reversión con control compatible conservan JSONC, dependencias, personalizaciones y entregas nuevas", { timeout: 600_000 }, async () => {
  const root = await mkdtemp(join(process.env.LOCALAPPDATA!, "Temp/opencode/s14-rollback-"))
  const baseline = join(root, "previous-package"), backup = join(root, "backup")
  await mkdir(baseline); await mkdir(backup)
  const files = execFileSync("git", ["ls-tree", "-r", "--name-only", "HEAD", "--", ...owned], { cwd: source, encoding: "utf8" }).trim().split("\n")
  for (const file of files) {
    const path = join(baseline, file); await mkdir(dirname(path), { recursive: true })
    await writeFile(path, execFileSync("git", ["show", `HEAD:${file}`], { cwd: source, maxBuffer: 4 * 1024 * 1024 }))
  }
  const { host, config, env } = await prepareConsumer(root, { providerID: "fixture", id: "test" }, "")
  assert.deepEqual(JSON.parse(await readFile(join(baseline, "package.json"), "utf8")).dependencies,
    JSON.parse(await readFile(join(source, "package.json"), "utf8")).dependencies, "No dependency change is hidden in this rollback fixture")
  const deploy = async (packageRoot: string) => {
    await cp(join(packageRoot, "plugin"), join(config, "plugins"), { recursive: true })
    await cp(join(packageRoot, "tools"), join(config, "tools"), { recursive: true })
    await cp(join(packageRoot, ".apm", "skills"), join(host, ".agents", "skills"), { recursive: true })
    for (const agent of ["refinador", "investigador", "lector-codigo", "lector-documentacion", "revisor"])
      await cp(join(packageRoot, ".apm", "agents", `${agent}.agent.md`), join(config, "agents", `${agent}.md`))
  }
  await deploy(baseline)
  for (const [targetRoot, packageRoot] of [[join(config, "tools"), join(baseline, "tools")],
    [join(config, "plugins"), join(baseline, "plugin")], [join(host, ".agents", "skills"), join(baseline, ".apm", "skills")]]) {
    for (const file of await readdir(targetRoot, { recursive: true })) {
      const path = join(targetRoot, file)
      try { await readFile(path) } catch (error: any) { if (error.code === "EISDIR") continue; throw error }
      try { await readFile(join(packageRoot, file)) } catch (error: any) {
        if (error.code !== "ENOENT") throw error
        const saved = join(backup, "initial-current-only", relative(host, path))
        await mkdir(dirname(saved), { recursive: true }); await rename(path, saved)
      }
    }
  }
  const custom = join(config, "agents", "consumer-custom.md"), customText = "---\ndescription: Consumer owned\nmode: all\n---\nKeep me.\n"
  await writeFile(custom, customText)
  const configPath = join(config, "opencode.jsonc")
  await writeFile(configPath, '// Consumer comment must survive.\n{"experimental":{"subagent_depth":6}}\n')
  const packagePath = join(config, "package.json"), packageJSON = JSON.parse(await readFile(packagePath, "utf8"))
  packageJSON.consumerSetting = "untouched"
  await writeFile(packagePath, JSON.stringify(packageJSON))
  const dependenciesBefore = packageJSON.dependencies
  const oldFiles = new Map<string, Buffer>()
  for (const directory of ["tools", "plugins", "agents"]) for (const file of await readdir(join(config, directory), { recursive: true })) {
    const path = join(config, directory, file)
    try { oldFiles.set(path, await readFile(path)) } catch (error: any) { if (error.code !== "EISDIR") throw error }
  }
  for (const file of await readdir(join(host, ".agents", "skills"), { recursive: true })) {
    const path = join(host, ".agents", "skills", file)
    try { oldFiles.set(path, await readFile(path)) } catch (error: any) { if (error.code !== "EISDIR") throw error }
  }
  const settingsPath = join(config, "agent-settings.json"), settingsBefore = await readFile(settingsPath)
  const get = async (id: string) => ({ id, agent: "investigador", title: "S14 rollback", created: 1, directory: host })
  const options = { get, settingsPath }
  const actor = { sessionID: "consumer-producer", agent: "investigador" }
  const moduleURL = pathToFileURL(join(config, "tools", "session_store.ts")).href
  const previous = await import(moduleURL + "?previous")
  const first = await previous.publishSession({ ...actor, topic: "nota.md", publicationType: "publish_agent_deliverable",
    operationID: "before-update", files: { "nota.md": "# Nota\nVersión anterior.\n" } }, options)
  assert.equal(first.guardado, true)
  const controls = join(host, "informes-agente", "sesiones", ".control")
  const control = join(controls, (await readdir(controls))[0])
  await cp(control, join(backup, "previous-control"), { recursive: true })
  const oldState = await readFile(join(control, "state.json"))
  const oldIndex = await readFile(join(first.sesion, "indice.md"))
  await deploy(source)
  const setup = spawnSync(process.execPath, [join(source, "scripts", "setup-opencode.mjs")], { cwd: host, env,
    encoding: "utf8", timeout: 240_000, maxBuffer: 4 * 1024 * 1024 })
  assert.equal(setup.status, 0, setup.error?.message || setup.stderr + setup.stdout)
  assert.match(setup.stdout, /plugins verificados/)
  assert.ok((await readFile(configPath, "utf8")).includes("// Consumer comment must survive."))
  assert.equal(JSON.parse(await readFile(packagePath, "utf8")).consumerSetting, "untouched")
  assert.deepEqual(JSON.parse(await readFile(packagePath, "utf8")).dependencies, dependenciesBefore)
  assert.deepEqual(await readFile(settingsPath), settingsBefore)
  assert.equal(await readFile(custom, "utf8"), customText)
  const current = await import(moduleURL + "?updated")
  const firstPath = first.rutas["nota.md"], archivo = relative(first.sesion, firstPath).replaceAll("\\", "/")
  const origin = { artefacto_id: first.artefacto_id, archivo, sha256: digest(await readFile(firstPath)),
    transformaciones: [{ anterior: "Versión anterior.", nuevo: "Versión nueva.", coincidencias: 1 }] }
  const second = await current.publishSession({ ...actor, topic: "nota.md", publicationType: "publish_agent_deliverable",
    operationID: "after-update", files: { "nota.md": origin } }, options)
  assert.equal(second.guardado, true)
  assert.equal(await readFile(second.rutas["nota.md"], "utf8"), "# Nota\nVersión nueva.\n")
  const newFiles = new Map(await Promise.all([firstPath, second.rutas["nota.md"]].map(async path => [path, await readFile(path)] as const)))
  await cp(config, join(backup, "new-package"), { recursive: true, filter: path => !path.split(/[\\/]/).includes("node_modules") })
  await rename(control, join(backup, "new-control"))
  await cp(join(backup, "previous-control"), control, { recursive: true })
  await writeFile(join(backup, "new-index.md"), await readFile(join(first.sesion, "indice.md")))
  await writeFile(join(first.sesion, "indice.md"), oldIndex)
  for (const directory of [join(config, "tools"), join(config, "plugins"), join(config, "agents"), join(host, ".agents", "skills")]) {
    for (const file of await readdir(directory, { recursive: true })) {
      const path = join(directory, file)
      if (oldFiles.has(path)) continue
      let bytes: Buffer
      try { bytes = await readFile(path) } catch (error: any) { if (error.code === "EISDIR") continue; throw error }
      const target = join(backup, "new-only-files", relative(host, path)); await mkdir(dirname(target), { recursive: true })
      await rename(path, target)
      assert.deepEqual(await readFile(target), bytes)
    }
  }
  for (const [path, bytes] of oldFiles) { await writeFile(path, bytes); assert.equal(digest(await readFile(path)), digest(bytes)) }
  assert.deepEqual(await readFile(join(control, "state.json")), oldState, "Old package receives only its matching control backup")
  assert.notDeepEqual(await readFile(join(backup, "new-control", "state.json")), oldState)
  for (const [path, bytes] of newFiles) assert.deepEqual(await readFile(path), bytes, "Neither previous nor new deliverables are deleted to roll back")
  assert.equal(await readFile(custom, "utf8"), customText)
  await writeFile(join(root, "result.json"), JSON.stringify({ scope: "S14 private consumer compatibility and filesystem rollback",
    previousCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: source, encoding: "utf8" }).trim(),
    realModelCalls: 0, sharedServiceTouched: false, sharedCredentialsTouched: false,
    previousArtifactID: first.artefacto_id, newArtifactID: second.artefacto_id,
    oldPackageFilesRestored: oldFiles.size, newControlRetained: true, allDeliverablesRetained: true,
    limitation: "No old publisher is run against new control; later deliveries require manual reconciliation, as documented." }, null, 2))
  console.log("S14 rollback evidence: " + root)
})
