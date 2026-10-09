import { describe, expect, it } from "vitest";
import { normalizeShellOutput, shellInvocation } from "./process.ts";

describe("shell process adapters", () => {
  it("uses an isolated Bash process group on Unix", () => {
    expect(shellInvocation("printf ok", "linux")).toEqual({
      executable: "/bin/bash",
      args: ["--noprofile", "--norc", "-c", "printf ok"],
      detached: true
    });
  });

  it("encodes Windows PowerShell commands as UTF-16LE and preserves exit status", () => {
    const invocation = shellInvocation("Write-Output 'hello'", "win32");
    expect(invocation.executable).toBe("powershell.exe");
    expect(invocation.detached).toBe(false);
    const encoded = invocation.args.at(-1)!;
    const script = Buffer.from(encoded, "base64").toString("utf16le");
    expect(invocation.args).toContain("-NonInteractive");
    expect(invocation.args).toContain("-OutputFormat");
    expect(script).toContain("[Console]::OutputEncoding");
    expect(script).toContain("$ProgressPreference = 'SilentlyContinue'");
    const command = script.match(/FromBase64String\('([^']+)'\)/)?.[1];
    expect(Buffer.from(command!, "base64").toString("utf8")).toBe("Write-Output 'hello'");
    expect(script).toContain("[ScriptBlock]::Create");
    expect(script).toContain("exit $adcExitCode");
  });

  it("normalizes PowerShell CLIXML errors and removes progress records", () => {
    const clixml =
      '#< CLIXML\r\n<Objs Version="1.1.0.1" xmlns="http://schemas.microsoft.com/powershell/2004/04">' +
      '<Obj S="progress"><MS><AV>Preparing modules.</AV></MS></Obj>' +
      '<S S="Error">At line:3_x000D__x000A_Unexpected token &lt;name&gt; &amp; value.</S>' +
      "</Objs>";

    expect(normalizeShellOutput(clixml, "win32")).toBe(
      "At line:3\nUnexpected token <name> & value."
    );
    expect(
      normalizeShellOutput(
        '#< CLIXML\r\n<Objs xmlns="http://schemas.microsoft.com/powershell/2004/04"><Obj S="progress" /></Objs>',
        "win32"
      )
    ).toBe("");
    expect(normalizeShellOutput(clixml, "linux")).toBe(clixml);
  });
});
