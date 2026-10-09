import { spawn, type ChildProcess } from "node:child_process";

export interface ShellInvocation {
  executable: string;
  args: string[];
  detached: boolean;
}

function decodeCliXmlText(value: string): string {
  return value
    .replace(/_x([0-9a-f]{4})_/gi, (_, encoded: string) =>
      String.fromCharCode(Number.parseInt(encoded, 16))
    )
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

export function normalizeShellOutput(
  value: string,
  platform: NodeJS.Platform = process.platform
): string {
  if (
    platform !== "win32" ||
    (!value.includes("#< CLIXML") &&
      !value.includes('xmlns="http://schemas.microsoft.com/powershell/2004/04"'))
  ) {
    return value;
  }
  const marker = value.indexOf("#< CLIXML");
  const plain = marker >= 0 ? value.slice(0, marker).trim() : "";
  const messages = [...value.matchAll(/<S(?:\s+S="[^"]+")?>([\s\S]*?)<\/S>/g)]
    .map((match) =>
      decodeCliXmlText(match[1] ?? "")
        .replace(/\r\n?/g, "\n")
        .trim()
    )
    .filter(Boolean);
  return [...new Set([plain, ...messages].filter(Boolean))].join("\n");
}

export function shellInvocation(
  command: string,
  platform: NodeJS.Platform = process.platform
): ShellInvocation {
  if (platform === "win32") {
    const encodedCommand = Buffer.from(command, "utf8").toString("base64");
    const script = `[Console]::InputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding
$ProgressPreference = 'SilentlyContinue'
$ErrorView = 'NormalView'
$global:LASTEXITCODE = $null
try {
  $adcCommand = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encodedCommand}'))
  $adcScript = [ScriptBlock]::Create($adcCommand)
  & $adcScript
  $adcSucceeded = $?
  $adcExitCode = $LASTEXITCODE
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 1
}
if ($null -ne $adcExitCode) { exit $adcExitCode }
if (-not $adcSucceeded) { exit 1 }
`;
    return {
      executable: "powershell.exe",
      args: [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-OutputFormat",
        "Text",
        "-EncodedCommand",
        Buffer.from(script, "utf16le").toString("base64")
      ],
      detached: false
    };
  }
  return {
    executable: "/bin/bash",
    args: ["--noprofile", "--norc", "-c", command],
    detached: true
  };
}

export function terminateProcessTree(
  child: ChildProcess,
  force: boolean,
  platform: NodeJS.Platform = process.platform
): void {
  if (!child.pid) return;
  if (platform === "win32") {
    const killer = spawn(
      "taskkill.exe",
      ["/PID", String(child.pid), "/T", ...(force ? ["/F"] : [])],
      { windowsHide: true, stdio: "ignore" }
    );
    killer.once("error", () => child.kill(force ? "SIGKILL" : "SIGTERM"));
    return;
  }
  try {
    process.kill(-child.pid, force ? "SIGKILL" : "SIGTERM");
  } catch {
    child.kill(force ? "SIGKILL" : "SIGTERM");
  }
}
