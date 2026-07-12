export type Usage = {
    provider: string
    items: UsageItem[]
}

export type UsageItem = {
    /** The name of the item */
    name: string
    /** The current usage [0, 1] */
    percent: number
    /** The formatted time when the usage resets */
    resets: string | undefined
}

export type LogFn = (message: string, extra?: Record<string, unknown>) => void
