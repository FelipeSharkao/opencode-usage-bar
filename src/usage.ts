import fs from "node:fs/promises"
import net from "node:net"
import os from "node:os"
import path from "node:path"

import { pollClaudeUsage } from "./claude-usage"
import type { LogFn, Usage } from "./types"
import { abortableTimeout, disposeIfAborted } from "./abort"

const PIPE_NAME = "opencode-usage-bar"
const LOCK_PATH = path.join(os.tmpdir(), `${PIPE_NAME}.lock`)
const PIPE_PATH =
    os.platform() === "win32"
        ? `\\\\.\\pipe\\${PIPE_NAME}`
        : path.join(os.tmpdir(), `${PIPE_NAME}.sock`)
const RE_ELECTION_JITTER = 1000

type ErrorWithCode = Error & { code?: string }

type UsageArgs = {
    abortController: AbortController
    onResult: (usages: Usage[]) => void
    log: LogFn
}

export async function startUsages(args: UsageArgs): Promise<void> {
    args.log("Starting usages client")

    while (true) {
        // Try starting as a client of an existing server first
        try {
            await startUsagesClient(args)
            return
        } catch (error) {
            if (
                (error as ErrorWithCode).code !== "ECONNREFUSED" &&
                (error as ErrorWithCode).code !== "ENOENT"
            ) {
                args.abortController.abort()
                throw error
            }
        }

        args.log("There's no one running, starting as a server")

        // Try starting as server then
        try {
            // Lock atomically to make sure two servers don't run at the same time
            const lock = await fs.open(LOCK_PATH, "wx")
            const unlock = async () => {
                await lock.close()
                await fs.unlink(LOCK_PATH).catch(() => {})
            }
            if (disposeIfAborted(args.abortController.signal, unlock)) return

            try {
                await fs.unlink(PIPE_PATH).catch(() => {})
                await startUsagesServer(args)
                return
            } finally {
                unlock()
            }
        } catch (error) {
            if (
                (error as ErrorWithCode).code !== "EADDRINUSE" ||
                (error as ErrorWithCode).code !== "EEXIST"
            ) {
                args.abortController.abort()
                throw error
            }
        }

        args.log("Another server beat us to it, starting as a client")
    }
}

async function startUsagesServer(args: UsageArgs) {
    let usages: Usage[] = []
    const socks = new Set<net.Socket>()

    const server = net.createServer((socket) => {
        socks.add(socket)
        socket.write(JSON.stringify(usages))
        socket.on("close", () => socks.delete(socket))
        socket.on("error", () => socks.delete(socket))
    })
    if (disposeIfAborted(args.abortController.signal, server)) return

    await new Promise<void>((res, rej) => {
        server.once("error", rej)
        server.once("listening", () => {
            server.off("error", rej)
            res()
        })
        server.listen(PIPE_PATH)
    })

    const claudeUsageIdx = usages.length
    usages.push({ provider: "Claude", items: [] })

    pollClaudeUsage({
        ...args,
        onResult: (items) => {
            usages[claudeUsageIdx]!.items = items
            args.onResult(structuredClone(usages))
            for (const sock of socks) {
                sock.write(JSON.stringify(usages))
            }
        },
    })

    args.log("Started as a server")
}

async function startUsagesClient(args: UsageArgs) {
    const conn = await new Promise<net.Socket>((res, rej) => {
        const conn = net.createConnection({ path: PIPE_PATH })
        conn.once("error", rej)
        conn.once("connect", () => {
            conn.off("error", rej)
            res(conn)
        })
    })

    if (disposeIfAborted(args.abortController.signal, conn)) return

    for (const ev in ["close", "error"] as const) {
        conn.on(ev, () => {
            abortableTimeout(
                args.abortController.signal,
                () => startUsagesClient(args),
                Math.random() * RE_ELECTION_JITTER,
            )
        })
    }

    conn.on("data", (data) => {
        const usages = JSON.parse(data.toString()) as Usage[]
        args.onResult(usages)
    })

    args.log("Connected to server")
}
