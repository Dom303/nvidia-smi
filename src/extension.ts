// The module 'vscode' contains the VS Code extensibility API
// Import the necessary extensibility types to use in your code below
import { window, commands, Disposable, ExtensionContext, StatusBarAlignment, StatusBarItem, workspace } from "vscode"
import { platform } from "os"
const exec = require("child-process-promise").exec

const cmd_gpu_usage = `nvidia-smi -q -d UTILIZATION | grep Gpu | sed 's/[Gpu%: ]//g'`
const cmd_total_memory = `nvidia-smi -q -d MEMORY | grep "FB Memory Usage" -A 3 | grep "Total" | sed 's/[Total%: %MiB]//g'`
const cmd_used_memory = `nvidia-smi -q -d MEMORY | grep "FB Memory Usage" -A 3 | grep "Used" | sed 's/[Used%: ]//g'`

// This method is called when your extension is activated. Activation is
// controlled by the activation events defined in package.json.
export async function activate(context: ExtensionContext) {
    // Use the console to output diagnostic information (console.log) and errors (console.error).
    // This line of code will only be executed once when your extension is activated.
    console.log('Congratulations, your extension "nvidia-smi" is now active!')

    // create a new word counter
    let nvidiasmi = new NvidiaSmi(0)
    try {
        var gpu_usage = await exec(cmd_gpu_usage, { timeout: 999 })
        var nCard = gpu_usage.stdout.split("\n").filter(val => val).length
        if (nCard > 0) {
            nvidiasmi.nCard = nCard
            nvidiasmi.startNvidiaSmi()
        }
    } catch (e) {
        console.log(e)
        nvidiasmi.nCard = 0
    }

    let updateCmd = commands.registerCommand("extension.nvidia-smi", () => {
        nvidiasmi.updateNvidiaSmi()
    })

    let stopCmd = commands.registerCommand("extension.stop_nvidia-smi", () => {
        nvidiasmi.stopNvidiaSmi()
    })

    let startCmd = commands.registerCommand("extension.start_nvidia-smi", () => {
        nvidiasmi.startNvidiaSmi()
    })

    context.subscriptions.push(
        workspace.onDidChangeConfiguration(() => {
            nvidiasmi.updateDrawtype()
        })
    )

    // Add to a list of disposables which are disposed when this extension is deactivated.
    context.subscriptions.push(nvidiasmi)
    context.subscriptions.push(updateCmd)
    context.subscriptions.push(startCmd)
    context.subscriptions.push(stopCmd)
}

class NvidiaSmi {
    private _statusBarItem: StatusBarItem
    private _interval: NodeJS.Timer
    private _nCard: number
    private _indicator: string[]
    private _patience: number
    public lock: boolean

    constructor(numCard: number) {
        this.lock = false
        this.resetPatience()
        this.nCard = numCard
        this.updateDrawtype()
    }

    get hasPatience(): boolean {
        return this._patience > 0
    }

    get nCard(): number {
        return this._nCard
    }

    set nCard(numCard: number) {
        if (numCard >= 0) {
            this._nCard = numCard
        } else {
            console.log("Error: bad value of numCard!")
        }
    }

    get indicator(): string[] {
        return this._indicator
    }

    set indicator(ind: string[]) {
        this._indicator = ind
    }

    public decPatience() {
        if (this.hasPatience) {
            this._patience -= 1
        }
    }

    public resetPatience() {
        this._patience = 5
    }

    public updateDrawtype() {
        var drawtype = workspace.getConfiguration("nvidia-smi").drawtype
        this.indicator = drawtypes[drawtype]
    }

    public async updateNvidiaSmi() {
        if (this.nCard == 0) return
        if (this.lock) return

        // Create as needed
        if (!this._statusBarItem) {
            this._statusBarItem = window.createStatusBarItem(StatusBarAlignment.Left, 1)
            this._statusBarItem.show()
        }

        try {
            this.lock = true
            var gpu_usage = await exec(cmd_gpu_usage, { timeout: 999 })
            var used_memory = await exec(cmd_used_memory, { timeout: 999 })
            var total_memory = await exec(cmd_total_memory, { timeout: 999 })
            this.lock = false
        } catch (e) {
            console.log(e)
            this.lock = true
        }

        // Update the status bar
        this._statusBarItem.text = "NVIDIA: " + gpu_usage + "% - " + used_memory + "/" + total_memory
        this._statusBarItem.tooltip = this._statusBarItem.text

    }

    public async stopNvidiaSmi() {
        if (this._interval) {
            clearInterval(this._interval)
        }
        if (this._statusBarItem) {
            this._statusBarItem.text = ""
            this._statusBarItem.tooltip = ""
        }
    }

    public async startNvidiaSmi() {
        if (this.nCard == 0) return

        this._interval = setInterval(() => {
            this.updateNvidiaSmi()
        }, 2000)
    }

    dispose() {
        this._statusBarItem.dispose()
        if (this._interval) {
            clearInterval(this._interval)
        }
    }
}
