import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { pollClaudeUsage } from "./claude-usage"
import type { LogFn, Usage } from "./types"
import { disposeIfAborted } from "./abort"

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
    const socks = new Set<Bun.Socket>()

    const server = Bun.listen({
        unix: PIPE_PATH,
        socket: {
            open(socket) {
                socks.add(socket)
                socket.write(JSON.stringify(usages))
            },
            close(socket) {
                socks.delete(socket)
            },
            error(socket) {
                socks.delete(socket)
            },
            data() {
                // This is required by Bun, bu we will not handle any data from the client
            },
        },
    })
    if (disposeIfAborted(args.abortController.signal, server)) return

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
    const conn = await Bun.connect({
        unix: PIPE_PATH,
        socket: {
            data(_, data) {
                const usages = JSON.parse(data.toString()) as Usage[]
                args.onResult(usages)
            },
            async close() {
                await Bun.sleep(Math.random() * RE_ELECTION_JITTER)
                if (args.abortController.signal.aborted) return
                startUsagesClient(args)
            },
        },
    })
    if (disposeIfAborted(args.abortController.signal, conn)) return

    args.log("Connected to server")
}
