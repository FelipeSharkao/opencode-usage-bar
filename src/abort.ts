type Awaitable<T> = T | PromiseLike<T>

export type DisposableLike =
    | Disposable
    | AsyncDisposable
    | { stop(): Awaitable<void> }
    | { close(): Awaitable<void> }
    | { abort(): Awaitable<void> }
    | { destroy(): Awaitable<void> }
    | (() => Awaitable<void>)

export function dispose(v: DisposableLike) {
    if (Symbol.dispose in v) v[Symbol.dispose]()
    else if (Symbol.asyncDispose in v) v[Symbol.asyncDispose]()
    else if ("stop" in v) v.stop()
    else if ("close" in v) v.close()
    else if ("abort" in v) v.abort()
    else if ("destroy" in v) v.destroy()
    else v()
}

export function disposeIfAborted<T extends DisposableLike>(
    signal: AbortSignal,
    abortable: T,
): boolean {
    if (signal.aborted) {
        dispose(abortable)
        return true
    }
    const cb = () => dispose(abortable)
    signal.addEventListener("abort", cb)
    return false
}

export function abortableTimeout(
    signal: AbortSignal,
    callback: () => void,
    delay: number,
): (() => void) | undefined {
    if (signal.aborted) return
    const timeout = setTimeout(callback, delay)
    const clear = () => clearTimeout(timeout)
    signal.addEventListener("abort", clear)
    return () => {
        signal.removeEventListener("abort", clear)
        clear()
    }
}

export function abortableInterval(
    signal: AbortSignal,
    callback: () => void,
    delay: number,
): (() => void) | undefined {
    if (signal.aborted) return
    const interval = setInterval(callback, delay)
    const clear = () => clearInterval(interval)
    signal.addEventListener("abort", clear)
    return () => {
        signal.removeEventListener("abort", clear)
        clear()
    }
}
