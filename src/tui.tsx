import type { TuiPlugin, TuiThemeCurrent } from "@opencode-ai/plugin/tui"
import type { BoxRenderable } from "@opentui/core"
import { createContext, createSignal, onMount, useContext } from "solid-js"

const tui: TuiPlugin = async (api) => {
    api.slots.register({
        order: 100,
        slots: {
            sidebar_content: (ctx) => (
                <Context.Provider value={{ theme: ctx.theme.current }}>
                    <SidebarUsage />
                </Context.Provider>
            ),
        },
    })
}

export default {
    id: "opencode-claude-usage",
    tui,
}

const Context = createContext<{
    theme: TuiThemeCurrent
}>()

function SidebarUsage() {
    const { theme } = useContext(Context)!
    return (
        <box width="100%">
            <text width="100%" fg={theme.text}>
                <b>Claude Usage</b>
            </text>
            <ProgressBar label="Current session" progress={0.7} resets="4:44pm" />
            <ProgressBar label="All models" progress={0.5} resets="4:44pm" />
            <ProgressBar label="Fable" progress={0.2} resets="4:44pm" />
        </box>
    )
}

type ProgressBarProps = {
    label: string
    resets: string
    progress: number
}
function ProgressBar(props: ProgressBarProps) {
    const { theme } = useContext(Context)!

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
