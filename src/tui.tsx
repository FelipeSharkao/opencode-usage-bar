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
import { pollClaudeUsage, type UsageItem } from "./claude-usage"
import { createStore, reconcile } from "solid-js/store"

const PluginContext = createContext<{
    theme: TuiThemeCurrent
    client: OpencodeClient
}>()

const tui: TuiPlugin = async (api) => {
    api.slots.register({
        order: 100,
        slots: {
            sidebar_content: () => (
                <PluginContext.Provider
                    value={{ theme: api.theme.current, client: api.client }}
                >
                    <SidebarUsage />
                </PluginContext.Provider>
            ),
        },
    })
}

export default {
    id: "opencode-claude-usage",
    tui,
} satisfies TuiPluginModule

function SidebarUsage() {
    const { theme } = useContext(PluginContext)!

    const usage = useClaudeUsage()

    return (
        <box width="100%">
            <text width="100%" fg={theme.text}>
                <b>Claude Usage</b>
            </text>
            <For each={usage}>
                {(item) => (
                    <ProgressBar
                        label={item.name}
                        progress={item.percent}
                        resets={item.resets}
                    />
                )}
            </For>
        </box>
    )
}

function useClaudeUsage() {
    const { client } = useContext(PluginContext)!

    const [store, setStore] = createStore<UsageItem[]>([])

    onMount(() => {
        const stop = pollClaudeUsage({
            onResult: (usage) => setStore(reconcile(usage)),
            pollSeconds: 60,
            log: (message, extra) =>
                client.app.log({
                    service: "opencode-claude-usage",
                    level: "info",
                    message,
                    extra,
                }),
        })

        onCleanup(() => stop())
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

    const color = () => theme.text

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
