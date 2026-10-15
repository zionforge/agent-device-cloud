import {
  createCliTransport,
  executeNativeTool,
  nativeTools,
  WORKFLOW_GUIDANCE
} from "../../packages/harness-core/src/index.ts";

export function createClinePlugin(
  createTool: any,
  options: { allowSideEffects?: boolean; transportFactory?: typeof createCliTransport } = {}
) {
  return {
    name: "agent-device-cloud",
    manifest: { capabilities: ["tools", "commands", "rules"] },
    setup(api: any, ctx: any) {
      // Cline Hub can share the plugin module across sessions. State belongs to setup.
      const transport = (options.transportFactory ?? createCliTransport)();
      let allowSideEffects = options.allowSideEffects === true;
      ctx.onDispose?.(() => transport.dispose());
      api.registerRule({ id: "adc-workflow", content: WORKFLOW_GUIDANCE });
      api.registerCommand({
        name: "adc",
        description: "ADC status, devices, setup, approval and session execution mode",
        async handler(input: string) {
          const [action = "status", mode] = input.trim().split(/\s+/);
          if (action === "mode") {
            if (!["read", "execute"].includes(mode ?? ""))
              return "Use /adc mode read or /adc mode execute.";
            allowSideEffects = mode === "execute";
            return allowSideEffects
              ? "ADC execution enabled for this session within your existing ADC authorization."
              : "ADC session switched to read-only.";
          }
          if (action === "setup")
            return {
              submitPrompt:
                "Help me start using ADC with the agent-device-cloud Skill. Guide account sign-in, device setup and scoped connection, then verify a read-only result."
            };
          if (action === "approval") return { reply: `${transport.origin}/approvals` };
          return {
            reply: JSON.stringify(
              await executeNativeTool(
                transport,
                action === "devices" ? "adc_discover" : "adc_status",
                {}
              ),
              null,
              2
            )
          };
        }
      });
      for (const definition of nativeTools) {
        api.registerTool(
          createTool({
            ...definition,
            retryable: false,
            maxRetries: 0,
            timeoutMs: 45_000,
            executionMode: ["adc_invoke", "adc_cancel"].includes(definition.name)
              ? "sequential"
              : "parallel",
            async execute(input: any, context: any) {
              if (["adc_invoke", "adc_cancel"].includes(definition.name) && !allowSideEffects)
                throw new Error("Enable ADC execution for this session with /adc mode execute.");
              return executeNativeTool(transport, definition.name, input, context.signal);
            }
          })
        );
      }
    }
  };
}
