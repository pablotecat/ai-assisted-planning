import assert from "node:assert/strict"
import test from "node:test"
import { isTransientTransportFailure } from "../scripts/verify-opencode.mjs"

// Contrato del predicado compartido isTransientTransportFailure (R2-C3): el REAL de
// scripts/verify-opencode.mjs, que consumen tanto el reintento de transporte del bucle de
// verifyOpenCode como retryTransport de test-support/opencode.mjs. Este test versiona la
// sonda build/verify-campaign-r2c-probe-transient.mjs (no versionada, en build/ ignorado)
// y el descarte HTTP 4xx/5xx exigido por F5/F8 de la revisión independiente de 98cce13.
// Solo ejercita el predicado en aislamiento: NO simula bucles de reintento ni conductas de
// runtime como prueba de nada más allá del predicado. La causa subyacente de la familia de
// fallos transitorios PERMANECE INDETERMINADA (misma advertencia que 55d127e/98cce13).

// Las 5 firmas transitorias OBSERVADAS (S05/S12/S02 vía R1-F2/9322e78 y S08/55d127e):
// el predicado debe reconocerlas para que el reintento de transporte pueda actuar.
const observedSignatures = [
  "Could not reach server: Cannot fetch http://127.0.0.1:54321/api/plugin: Transport: The operation timed out",
  "Error: spawnSync cmd.exe ETIMEDOUT",
  "Error: spawnSync D:\\path\\opencode.exe ETIMEDOUT",
  'Aborted! listElement: [ { "entry": "..." } ] aborted due to timeout',
  "TimeoutError: The operation timed out",
]

// Los 14 errores de dominio y casos límite del sondeo: deben propagarse en firme
// (reintentarlos enmascararía fallos reales). Incluye cadenas, undefined y null.
const domainFailures: Array<() => unknown> = [
  () => undefined,
  () => null,
  () => new Error("HTTP 500: internal server error"),
  () => new Error("404 page not found"),
  () => new Error("connect ECONNREFUSED 127.0.0.1:5"),
  () => new Error("Server startup timeout: boom"),
  () => new Error("OpenCode terminó durante el arranque: boom"),
  () => new Error("Plugins que no cargan: plugin X: ReferenceError foo is not defined"),
  () => new Error("SyntaxError: Unexpected token < in JSON at position 0"),
  () => new Error(""),
  () => new Error("spawnSync node ENOENT"),
  () => ({}),
  () => "TimeoutError",
  () => { throw { code: "ETIMEDOUT" } },
]

// F5/F8: un mensaje HTTP 4xx/5xx que ADEMÁS contenga una firma transitoria debe
// descartarse ANTES del matching por subcadena y fallar en firme. El 502 es el caso
// demostrado por el revisor; 404/429/500 cubren el resto del rango identificado.
const httpDomainWithSignatures = [
  'HTTP 404 Not Found: Could not reach server: Cannot fetch http://127.0.0.1:54321/api/plugin',
  'HTTP 429 Too Many Requests: retry aborted due to timeout',
  'HTTP 500 Internal Server Error: TimeoutError: The operation timed out',
  'HTTP 502 Bad Gateway: upstream "aborted due to timeout"',
]

test("el predicado reconoce las 5 firmas transitorias observadas", () => {
  for (const signature of observedSignatures)
    assert.equal(isTransientTransportFailure(new Error(signature)), true, signature)
})

test("el predicado descarta en firme los errores de dominio, cadenas y ausencias", () => {
  for (const build of domainFailures) {
    let value: unknown
    try { value = build() } catch (error) { value = error }
    assert.equal(isTransientTransportFailure(value), false,
      `falso positivo sobre: ${String((value as Error)?.message ?? JSON.stringify(value) ?? value)}`)
  }
  // Entradas que no son Error nunca contienen .message: sin falsos positivos.
  assert.equal(isTransientTransportFailure("aborted due to timeout"), false)
  assert.equal(isTransientTransportFailure(undefined), false)
  assert.equal(isTransientTransportFailure(null), false)
})

test("el predicado descarta mensajes HTTP 4xx/5xx aunque contengan firmas (F5/F8)", () => {
  for (const message of httpDomainWithSignatures)
    assert.equal(isTransientTransportFailure(new Error(message)), false, message)
})
