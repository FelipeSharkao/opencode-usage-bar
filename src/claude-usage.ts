import { $ } from "bun"

export type UsageItem = {
    /** The name of the item */
    name: string
    /** The current usage [0, 1] */
    percent: number
    /** The formatted time when the usage resets */
    resets: string | undefined
}

type LogFn = (message: string, extra?: Record<string, unknown>) => void

type PollArgs = {
    onResult: (usage: UsageItem[]) => void
    pollMinutes: number
    log: LogFn
}

export function pollClaudeUsage(args: PollArgs) {
    fetchUsage(args)
    const interval = setInterval(() => fetchUsage(args), args.pollMinutes * 1000)
    return () => {
        clearInterval(interval)
    }
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
    const text = await $`claude -p /usage`.text().catch(() => null)
    if (!text) return

    const usage = await parseUsage(text)
    if (!usage.length) return

    args.log("Parsed claude usage", { usage })
    args.onResult(usage)
}
