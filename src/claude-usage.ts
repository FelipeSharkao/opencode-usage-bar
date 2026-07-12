import { $ } from "bun"

import type { LogFn, UsageItem } from "./types"
import { abortableTimeout } from "./abort"

const CLAUDE_POLL_INTERVAL = 2 * 60_000 // 5 minutes

type PollArgs = {
    abortController: AbortController
    onResult: (usage: UsageItem[]) => void
    log: LogFn
}

export function pollClaudeUsage(args: PollArgs) {
    fetchUsage(args)
    abortableTimeout(
        args.abortController.signal,
        () => fetchUsage(args),
        CLAUDE_POLL_INTERVAL,
    )
}

export async function parseUsage(text: string) {
    const result: UsageItem[] = []

    const re = /^Current ([^:]+): (\d+)% used(?: · resets (.+) \(.+\))?$/gm
    for (let match; (match = re.exec(text)); ) {
        let [, name, percent, resets] = match
        if (!name || !percent) continue

        // parses groups like "Current week (all models)" and "Current week (Fable)"
        const weekGroupMatch = name.match(/^week \((.+)\)$/)
        if (weekGroupMatch?.[1]) {
            name = weekGroupMatch[1]
        }

        name = name.slice(0, 1).toUpperCase() + name.slice(1).toLowerCase()

        result.push({
            name,
            percent: parseInt(percent) / 100,
            resets,
        })
    }

    return result
}

async function fetchUsage(args: PollArgs) {
    try {
        const text = await $`claude -p /usage`.text().catch(() => null)
        if (!text) return

        const usage = await parseUsage(text)
        args.log("Parsed claude usage", { usage })

        if (usage.length || !args.abortController.signal.aborted) args.onResult(usage)
    } catch (error) {
        args.log("Failed to fetch claude usage", { error })
    }
}
