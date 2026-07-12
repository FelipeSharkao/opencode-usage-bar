import type { TuiPlugin, TuiPluginModule, TuiThemeCurrent } from "@opencode-ai/plugin/tui"
import type { OpencodeClient } from "@opencode-ai/sdk/v2"
import type { BoxRenderable } from "@opentui/core"
import {
    createContext,
    createSignal,
    For,
    onCleanup,
    onMount,
    useContext,
} from "solid-js"
import { createStore, reconcile } from "solid-js/store"
import { startUsages } from "./usage"
import type { LogFn, Usage } from "./types"

// NOTE: OpenCode replaces the solid-js dependency with its own version, but only for the
// plugin entry point. Splitting the UI code into a separate file is thus only possible if
// we bundle the code. Keeping everything on the same file is easier.

const PluginContext = createContext<{
    theme: TuiThemeCurrent
    client: OpencodeClient
    log: LogFn
}>()

const tui: TuiPlugin = async (api) => {
    const log: LogFn = (message, extra) =>
        api.client.app.log({
            service: "opencode-usage-bar",
            level: "info",
            message: `[opencode-usage-bar] ${message}`,
            extra,
        })

    api.slots.register({
        order: 100,
        slots: {
            sidebar_content: () => (
                // NOTE: OpenCode don't like for reactive elements to be in the top level
                // of the slot, and will make the whole slot remount when it changes. This
                // box-wrapping is absolutely necessary for keeping our internal state.
                <box width="100%" rowGap={1}>
                    <PluginContext.Provider
                        value={{ theme: api.theme.current, client: api.client, log }}
                    >
                        <SidebarUsage />
                    </PluginContext.Provider>
                </box>
            ),
        },
    })
}

export default {
    id: "opencode-usage-bar",
    tui,
} satisfies TuiPluginModule

function SidebarUsage() {
    const { theme } = useContext(PluginContext)!

    const usages = useUsages()

    return (
        <For each={usages}>
            {(usage) => (
                <box width="100%">
                    <text width="100%" fg={theme.text}>
                        <b>{usage.provider} Usage</b>
                    </text>
                    <For each={usage.items}>
                        {(item) => (
                            <ProgressBar
                                label={item.name}
                                progress={item.percent}
                                resets={item.resets}
                            />
                        )}
                    </For>
                </box>
            )}
        </For>
    )
}

function useUsages() {
    const { log } = useContext(PluginContext)!

    const [store, setStore] = createStore<Usage[]>([{ provider: "Loading", items: [] }])

    onMount(() => {
        const controller = new AbortController()

        void startUsages({
            abortController: controller,
            onResult: (usages) => {
                log("Polled usages", { usages })
                setStore(reconcile(usages))
            },
            log,
        }).catch((e) => log("Failed to start usages", { error: e }))

        onCleanup(() => controller.abort())
    })

    return store
}

type ProgressBarProps = {
    label: string
    resets: string | undefined
    progress: number
}
function ProgressBar(props: ProgressBarProps) {
    const { theme } = useContext(PluginContext)!

    let ref!: BoxRenderable

    const [width, setWidth] = createSignal(0)

    const color = () => {
        if (props.progress > 0.9) return theme.error
        if (props.progress > 0.7) return theme.warning
        return theme.text
    }

    const handleResize = () => {
        setImmediate(() => {
            setWidth(ref.getLayoutNode().getComputedWidth())
        })
    }

    onMount(() => {
        handleResize()
    })

    const bar = () => {
        const filled = Math.floor(width() * props.progress)
        const remaining = width() - filled
        return (
            <>
                <text fg={color()} width={filled}>
                    {"━".repeat(filled)}
                </text>
                <text fg={theme.border} width={remaining}>
                    {"─".repeat(remaining)}
                </text>
            </>
        )
    }

    return (
        <box width="100%">
            <box width="100%" flexDirection="row" justifyContent="space-between" gap={1}>
                <text fg={theme.textMuted}>{props.label}</text>
                <text fg={theme.textMuted}>
                    {props.resets && <>resets {props.resets}</>}
                </text>
            </box>
            <box width="100%" flexDirection="row" gap={2}>
                <box
                    height={1}
                    flexGrow={1}
                    ref={ref}
                    flexDirection="row"
                    onSizeChange={handleResize}
                >
                    {bar()}
                </box>
                <text fg={theme.textMuted}>
                    {(props.progress * 100).toFixed(0).padStart(3)}%
                </text>
            </box>
        </box>
    )
}
