// Live-connect smoke gate for the web client: dial a REAL `--web` engine
// through the REAL `loreweaver-protocol` WsClient and verify the join
// handshake lands on protocol 2.x. The web-repo analogue of the studio's
// `check_live_connect.sh` — the static conformance suites (visible_when
// vectors, panel template goldens) can't prove the two processes still talk.
//
//   bun scripts/live_join.ts <ws-url> <key> [name]
//
// Exit 0 on a clean handshake, 1 otherwise.

import { WsClient } from "@loreweaver/protocol"

const [, , url, key, name] = process.argv

if (!url || !key) {
  console.error("usage: bun scripts/live_join.ts <ws-url> <key> [name]")
  process.exit(2)
}

const client = new WsClient({
  // The app itself refuses a major mismatch on `welcome`; here we assert it.
  onProtocolMismatch: () => {},
  // Browser semantics; in Bun the global WebSocket already delivers
  // Uint8Array, but the binaryType knob keeps the script browser-true.
  webSocketFactory: (target) => {
    const socket = new WebSocket(target)
    socket.binaryType = "arraybuffer"
    return socket as unknown as ConstructorParameters<typeof WsClient>[0] extends {
      webSocketFactory: infer F
    }
      ? F extends (u: string) => infer R
        ? R
        : never
      : never
  },
})

const timeout = setTimeout(() => {
  console.error("live join timed out")
  process.exit(1)
}, 15_000)

client.on("welcome", (frame) => {
  clearTimeout(timeout)
  const major = frame.protocol.split(".")[0]
  console.log(
    `welcome: protocol=${frame.protocol} room=${frame.room} you=${frame.you.name} role=${frame.you.role}`,
  )
  if (major !== "2") {
    console.error(`live join FAILED: protocol major ${major} != 2`)
    process.exit(1)
  }
  console.log("live join OK")
  client.close()
  process.exit(0)
})

client.on("error", (frame) => {
  clearTimeout(timeout)
  console.error(`live join FAILED: ${frame.code}: ${frame.message}`)
  process.exit(1)
})

await client.connect(url)
client.join(key, name)
