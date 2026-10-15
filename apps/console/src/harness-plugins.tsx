import { useState } from "react";
import { useI18n } from "./i18n.tsx";

export function HarnessPlugins({ origin }: { origin: string }) {
  const { locale } = useI18n();
  const copy = (en: string, zh: string) => (locale === "zh-CN" ? zh : en);
  const [host, setHost] = useState("zion");
  const hosts = [
    ["zion", "Zion"],
    ["claude", "Claude Code"],
    ["codex", "Codex"],
    ["cursor", "Cursor"],
    ["copilot", "Copilot / VS Code"],
    ["gemini", "Gemini CLI"],
    ["droid", "Factory Droid"],
    ["pi", "Pi"],
    ["cline", "Cline SDK / CLI"],
    ["opencode", "OpenCode"],
    ["portable", "Agent Plugins"]
  ];
  const commands: Record<string, string> = {
    claude:
      "claude plugin marketplace add /absolute/path/adc-plugins\nclaude plugin install agent-device-cloud@adc-plugins",
    codex:
      "codex plugin marketplace add /absolute/path/adc-plugins\ncodex plugin add agent-device-cloud@adc-plugins",
    gemini: "gemini extensions install /absolute/path/adc-plugins/packages/gemini",
    droid:
      "droid plugin marketplace add /absolute/path/adc-plugins\ndroid plugin install agent-device-cloud@adc-plugins",
    pi: "pi install /absolute/path/adc-plugins/packages/pi",
    cline: `cline plugin install ${origin}/downloads/plugins/agent-device-cloud-cline.mjs`,
    opencode:
      "cp /absolute/path/adc-plugins/packages/opencode/index.mjs .opencode/plugins/agent-device-cloud.js"
  };
  const guidance: Record<string, [string, string]> = {
    zion: [
      "Import the Zion ZIP in the plugin manager and install the complete package in your Runtime plugin root. Enable dev.agent-device-cloud with Plugin API v2 and the included host compatibility patch. Open a conversation, choose ADC → Connect ADC, sign in and select a device. The sidebar shows connection, folders, tasks and approval links.",
      "在插件管理器导入 Zion ZIP，并将完整包安装到 Runtime 插件目录。启用 dev.agent-device-cloud，使用 Plugin API v2 及包内宿主兼容补丁。打开会话，选择「ADC → 连接 ADC」，登录后选择设备。侧栏展示连接、目录、任务和审批入口。"
    ],
    cursor: [
      "Use a local/team plugin source supported by your Cursor version. The full archive includes .cursor-plugin/marketplace.json and packages/cursor. The ADC package has not been listed in Cursor's public store.",
      "使用当前 Cursor 版本支持的本地或团队插件源。完整包包含 .cursor-plugin/marketplace.json 与 packages/cursor。ADC 尚未上架 Cursor 公共商店。"
    ],
    copilot: [
      "Enable chat.plugins.enabled in VS Code. Add the absolute packages/copilot directory to chat.plugins.paths and enable it. Availability depends on the VS Code/Copilot version and organization policy.",
      "在 VS Code 启用 chat.plugins.enabled，将 packages/copilot 的绝对路径加入 chat.plugins.paths 并启用。可用性取决于 VS Code/Copilot 版本和组织策略。"
    ],
    portable: [
      "Use the portable package's Skills and MCP components through your client's supported local installer. ChatGPT can connect through its custom MCP interface. For TRAE and Cline editor extensions, install the official Skill and configure the MCP endpoint below.",
      "通过客户端支持的本地安装方式使用通用包中的 Skills 与 MCP。ChatGPT 可通过自定义 MCP 入口连接；TRAE 和 Cline 编辑器扩展可安装官方 Skill，并配置下方 MCP 地址。"
    ]
  };
  return (
    <section id="plugins" className="docs-section">
      <h2>{copy("Harness plugins", "Harness 插件")}</h2>
      <p>
        {copy(
          "Install ADC in your Agent with setup guidance, device discovery, tasks and approval links. Version 0.1.0 packages connect to the official ADC service.",
          "在 Agent 中安装 ADC，获得接入引导、设备发现、任务与审批入口。0.1.0 版本插件包连接 ADC 官方服务。"
        )}
      </p>
      <nav className="docs-inline-links" aria-label={copy("Plugin downloads", "插件下载")}>
        <a
          className="secondary"
          href={`${origin}/downloads/plugins/agent-device-cloud-marketplace.zip`}
          download
        >
          {copy("Download all plugins", "下载全部插件")}
        </a>
        <a href={`${origin}/downloads/plugins/index.json`}>
          {copy("Versions and SHA-256", "版本与 SHA-256")}
        </a>
      </nav>
      <p>
        {copy(
          "Extract the full archive into adc-plugins, then choose your host. Individual ZIPs contain the same complete host package. npm packages and public vendor-store listings are not published yet.",
          "将完整包解压到 adc-plugins，再选择宿主安装。单独 ZIP 也包含对应宿主的完整内容。目前尚未发布 npm 包或上架厂商公共商店。"
        )}
      </p>
      <label>
        {copy("Your Agent", "你的 Agent")}{" "}
        <select
          aria-label={copy("Choose plugin host", "选择插件宿主")}
          value={host}
          onChange={(event) => setHost(event.target.value)}
        >
          {hosts.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <p>
        <a
          className="docs-text-link"
          href={`${origin}/downloads/plugins/agent-device-cloud-${host}.zip`}
          download
        >
          {copy("Download", "下载")} {hosts.find(([id]) => id === host)?.[1]} ZIP
        </a>
      </p>
      {commands[host] ? (
        <div className="docs-code">
          <pre>
            <code>{commands[host]}</code>
          </pre>
        </div>
      ) : null}
      {guidance[host] ? <p>{copy(...guidance[host])}</p> : null}
      {host === "opencode" ? (
        <p>
          {copy(
            "Declare @opencode-ai/plugin >=1.19.0 in .opencode/package.json and install it. Include the package Skills in your Agent's Skill paths. Device mutations use the adc_execute permission prompt.",
            "在 .opencode/package.json 中声明并安装 @opencode-ai/plugin >=1.19.0，将包内 Skills 加入 Agent 的 Skill 路径。有副作用的设备操作使用 adc_execute 权限提示。"
          )}
        </p>
      ) : null}
      {host === "cline" ? (
        <p>
          {copy(
            "Native plugins apply to Cline SDK/CLI/Kanban. Each session starts read-only; /adc mode execute enables device operations within your ADC access. Editor extensions use Skill plus MCP.",
            "原生插件适用于 Cline SDK/CLI/Kanban。每个会话初始为只读；/adc mode execute 可在 ADC 授权范围内启用设备操作。编辑器扩展使用 Skill 加 MCP。"
          )}
        </p>
      ) : null}
      <h3>{copy("First use", "首次使用")}</h3>
      <p>
        {copy(
          "Say: “Help me start using ADC, connect my device and configure access.” Complete sign-in and authorization yourself. The setup Skill checks the environment and guides each step. Installing a plugin does not pair a device or grant access.",
          "直接说：「帮我开始使用 ADC，引导我连接设备并配置授权。」登录与授权由你本人确认；接入 Skill 会检查环境并逐步引导。安装插件本身不会配对设备或授予权限。"
        )}
      </p>
      <p>
        {copy(
          "MCP hosts and Zion use OAuth. OpenCode, Pi and Cline use your scoped ADC CLI connection: adc login, then adc connect ACCESS. Native Node adapters require Node.js 22+. Pi confirms device mutations interactively; Zion uses the Runtime execution policy.",
          "MCP 宿主与 Zion 使用 OAuth。OpenCode、Pi、Cline 使用 ADC CLI 的范围授权连接：先 adc login，再 adc connect ACCESS。原生 Node 适配器要求 Node.js 22+；Pi 会交互确认设备操作，Zion 使用 Runtime 执行策略。"
        )}
      </p>
      <p>
        {copy(
          "Choose a device and platform before work. Continue waiting on the returned task identity after a timeout. Review ADC approvals yourself and inspect the same invocation afterwards. Each ZIP includes README.md and VALIDATION.md with installation details and verified compatibility.",
          "执行前选择设备与平台。超时后继续等待返回的任务标识；ADC 审批由你本人处理，再检查同一个调用。每个 ZIP 包含 README.md 和 VALIDATION.md，说明安装细节及已验证兼容范围。"
        )}
      </p>
    </section>
  );
}
