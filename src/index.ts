import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolResult, GetPromptResult, ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { MindustryClientProcessManager } from "./clientProcess.js";
import { MindustryBridgeClient } from "./protocol.js";

const client = new MindustryBridgeClient();
const clientManager = new MindustryClientProcessManager();
const mindustryxRepoUrl = "https://github.com/BEK-Group/MindustryX";

const server = new McpServer({
  name: "mindustry-mcp-server",
  version: "0.1.0"
});

server.registerTool(
  "launch_client",
  {
    description: "Launch a local MindustryX MCP desktop client and wait for its AI bridge.",
    inputSchema: {
      mode: z.enum(["no-render", "render"]).optional(),
      jarPath: z.string().optional(),
      javaPath: z.string().optional(),
      timeoutMs: z.number().int().positive().optional()
    }
  },
  async (args): Promise<CallToolResult> => {
    const timeoutMs = args.timeoutMs ?? 30000;
    const existingBridge = await tryConnectBridge(Math.min(timeoutMs, 3000));
    if (existingBridge) {
      const info = await client.getBridgeStatus();
      return jsonResult({
        started: false,
        alreadyConnected: true,
        bridgeInfoPath: client.bridgeInfoPath,
        bridge: info,
        managedClient: clientManager.getStatus()
      });
    }

    const launch = await clientManager.launch({
      mode: args.mode,
      jarPath: args.jarPath,
      javaPath: args.javaPath
    });
    const bridge = await waitForBridge(timeoutMs);

    return jsonResult({
      ...launch,
      alreadyConnected: false,
      bridgeInfoPath: client.bridgeInfoPath,
      bridge,
      managedClient: clientManager.getStatus()
    });
  }
);

server.registerTool(
  "close_client",
  {
    description: "Close the MindustryX client process launched by this MCP server.",
    inputSchema: {
      force: z.boolean().optional(),
      timeoutMs: z.number().int().positive().optional()
    }
  },
  async (args): Promise<CallToolResult> => {
    await client.close();
    const result = await clientManager.close({
      force: args.force,
      timeoutMs: args.timeoutMs
    });
    return jsonResult(result);
  }
);

server.registerTool(
  "get_state",
  {
    description: "Read global Mindustry game state."
  },
  async (): Promise<CallToolResult> => {
    const payload = await client.requestAllPages("get_state");
    return textResult(payload);
  }
);

server.registerTool(
  "list_maps",
  {
    description: "List available maps."
  },
  async (): Promise<CallToolResult> => {
    const payload = await client.requestAllPages("list_maps");
    return textResult(payload);
  }
);

server.registerTool(
  "get_tiles",
  {
    description: "Read tiles in a rectangular area.",
    inputSchema: {
      x1: z.number().int(),
      y1: z.number().int(),
      x2: z.number().int(),
      y2: z.number().int()
    }
  },
  async (args): Promise<CallToolResult> => {
    const payload = await client.requestAllPages("get_tiles", args);
    return textResult(payload);
  }
);

server.registerTool(
  "load_map",
  {
    description: "Load a local map and enter a playable game state.",
    inputSchema: {
      name: z.string().optional(),
      mapName: z.string().optional(),
      path: z.string().optional(),
      mode: z.enum(["survival", "sandbox", "attack", "pvp"]).optional(),
      timeoutMs: z.number().int().optional()
    }
  },
  async (args): Promise<CallToolResult> => {
    return await writeAndAwait("load_map", args, args.timeoutMs);
  }
);

server.registerTool(
  "join_game",
  {
    description: "Connect this client to a remote server.",
    inputSchema: {
      ip: z.string(),
      port: z.number().int().optional(),
      timeoutMs: z.number().int().optional()
    }
  },
  async (args): Promise<CallToolResult> => {
    return await writeAndAwait("join_game", args, args.timeoutMs);
  }
);

server.registerTool(
  "leave_game",
  {
    description: "Leave the current game and return to menu.",
    inputSchema: {
      timeoutMs: z.number().int().optional()
    }
  },
  async (args): Promise<CallToolResult> => {
    return await writeAndAwait("leave_game", args, args.timeoutMs);
  }
);

server.registerTool(
  "get_buildings",
  {
    description: "Read buildings with optional team/config/item/liquid details.",
    inputSchema: {
      team: z.number().int().optional(),
      includeItems: z.boolean().optional(),
      includeLiquids: z.boolean().optional(),
      includeConfig: z.boolean().optional()
    }
  },
  async (args): Promise<CallToolResult> => {
    const payload = await client.requestAllPages("get_buildings", args);
    return textResult(payload);
  }
);

server.registerTool(
  "get_units",
  {
    description: "Read units with optional team filter.",
    inputSchema: {
      team: z.number().int().optional()
    }
  },
  async (args): Promise<CallToolResult> => {
    const payload = await client.requestAllPages("get_units", args);
    return textResult(payload);
  }
);

server.registerTool(
  "get_content",
  {
    description: "Read content registry data for blocks, items, liquids, or unit types.",
    inputSchema: {
      type: z.enum(["all", "blocks", "units", "items", "liquids"]).optional()
    }
  },
  async (args): Promise<CallToolResult> => {
    const payload = await client.requestAllPages("get_content", args);
    return textResult(payload);
  }
);

server.registerTool(
  "place_block",
  {
    description: "Place a block at tile coordinates.",
    inputSchema: {
      x: z.number().int(),
      y: z.number().int(),
      block: z.string(),
      rotation: z.number().int().optional(),
      team: z.number().int().optional(),
      config: z.string().optional(),
      timeoutMs: z.number().int().optional()
    }
  },
  async (args): Promise<CallToolResult> => {
    return await writeAndAwait("place_block", args, args.timeoutMs);
  }
);

server.registerTool(
  "break_block",
  {
    description: "Break a block at tile coordinates.",
    inputSchema: {
      x: z.number().int(),
      y: z.number().int(),
      team: z.number().int().optional(),
      timeoutMs: z.number().int().optional()
    }
  },
  async (args): Promise<CallToolResult> => {
    return await writeAndAwait("break_block", args, args.timeoutMs);
  }
);

server.registerTool(
  "write_logic",
  {
    description: "Replace logic processor code at tile coordinates.",
    inputSchema: {
      x: z.number().int(),
      y: z.number().int(),
      code: z.string(),
      timeoutMs: z.number().int().optional()
    }
  },
  async (args): Promise<CallToolResult> => {
    return await writeAndAwait("write_logic", args, args.timeoutMs);
  }
);

server.registerTool(
  "spawn_unit",
  {
    description: "Spawn a unit at world coordinates.",
    inputSchema: {
      unit: z.string(),
      x: z.number(),
      y: z.number(),
      team: z.number().int().optional(),
      rotation: z.number().optional(),
      timeoutMs: z.number().int().optional()
    }
  },
  async (args): Promise<CallToolResult> => {
    return await writeAndAwait("spawn_unit", args, args.timeoutMs);
  }
);

server.registerTool(
  "set_speed",
  {
    description: "Set game speed multiplier.",
    inputSchema: {
      speed: z.number(),
      timeoutMs: z.number().int().optional()
    }
  },
  async (args): Promise<CallToolResult> => {
    return await writeAndAwait("set_speed", args, args.timeoutMs);
  }
);

server.registerTool(
  "pause",
  {
    description: "Pause or resume the game.",
    inputSchema: {
      paused: z.boolean().optional(),
      timeoutMs: z.number().int().optional()
    }
  },
  async (args): Promise<CallToolResult> => {
    return await writeAndAwait("pause", args, args.timeoutMs);
  }
);

server.registerTool(
  "await_op",
  {
    description: "Await a previously accepted operation ID.",
    inputSchema: {
      opId: z.number().int(),
      timeoutMs: z.number().int().optional()
    }
  },
  async (args): Promise<CallToolResult> => {
    const result = await client.awaitOp(args.opId, args.timeoutMs ?? 5000);
    return textResult(result.payload ?? JSON.stringify(result));
  }
);

server.registerResource(
  "bridge-info",
  "mindustry://bridge/info",
  {
    description: "Latest AI bridge control-plane and shared-ring metadata.",
    mimeType: "application/json"
  },
  async (): Promise<ReadResourceResult> => {
    const bridgeStatus = await readBridgeStatus();
    const payload = {
      ...(isBridgeInfo(bridgeStatus) ? bridgeStatus : { bridge: bridgeStatus }),
      bridgeInfoPath: client.bridgeInfoPath,
      mindustryxRepoUrl,
      managedClient: clientManager.getStatus(),
      clientJarDefaults: clientManager.getDefaultJarPaths(),
      clientJarEnv: clientManager.getJarEnvironmentVariables()
    };
    return {
      contents: [
        {
          uri: "mindustry://bridge/info",
          mimeType: "application/json",
          text: JSON.stringify(payload, null, 2)
        }
      ]
    };
  }
);

server.registerPrompt(
  "mindustry_client_usage",
  {
    description: "Recommended AI workflow for launching and using the MindustryX MCP client."
  },
  async (): Promise<GetPromptResult> => {
    return {
      description: "How to use the MindustryX MCP client from an AI assistant.",
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              "Use this Mindustry MCP server in this order:",
              "1. Call launch_client first. Omit arguments for the default no-render client.",
              "2. If launch_client reports alreadyConnected, reuse the existing bridge.",
              "3. Call get_state to verify the MindustryX AI bridge is ready.",
              "4. Use load_map or join_game before game-state write tools when no game is loaded.",
              "5. Use list_maps, get_tiles, get_buildings, get_units, and get_content for reads.",
              "6. Use place_block, break_block, write_logic, spawn_unit, set_speed, and pause for writes.",
              "7. When done with a client launched by this MCP server, call close_client.",
              "",
              "The special MindustryX jars are external artifacts. By default they are expected at artifacts/MindustryX-MCP-no-render.jar and artifacts/MindustryX-MCP-render.jar relative to the MCP project. You can override them with launch_client.jarPath or MINDUSTRYX_MCP_NO_RENDER_JAR / MINDUSTRYX_MCP_RENDER_JAR."
            ].join("\n")
          }
        }
      ]
    };
  }
);

async function writeAndAwait(
  op: string,
  args: Record<string, unknown>,
  timeoutMs = 5000
): Promise<CallToolResult> {
  const { timeoutMs: _timeout, ...payload } = args;
  const accepted = await client.request(op, payload, timeoutMs);
  const opId = accepted.opId;
  if (typeof opId !== "number") {
    return textResult(JSON.stringify(accepted));
  }

  const result = await client.awaitOp(opId, timeoutMs);
  const output = {
    opId,
    accepted: accepted.accepted,
    result: result.payload ? safeJsonParse(result.payload) : result
  };
  return textResult(JSON.stringify(output, null, 2));
}

async function tryConnectBridge(timeoutMs: number): Promise<boolean> {
  try {
    await client.connect(timeoutMs);
    return true;
  } catch {
    await client.close().catch(() => undefined);
    return false;
  }
}

async function waitForBridge(timeoutMs: number): Promise<unknown> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;

  while (Date.now() < deadline) {
    const status = clientManager.getStatus();
    if (status.managed && !status.running) {
      throw new Error(
        [
          "Managed MindustryX client exited before the AI bridge became available.",
          `Managed client status: ${JSON.stringify(status)}`
        ].join("\n")
      );
    }

    try {
      await client.connect(Math.min(1000, Math.max(1, deadline - Date.now())));
      return await client.getBridgeStatus();
    } catch (error) {
      lastError = error;
      await client.close().catch(() => undefined);
      await sleep(250);
    }
  }

  throw new Error(
    [
      `Timed out waiting for MindustryX AI bridge at ${client.bridgeInfoPath}.`,
      `Managed client status: ${JSON.stringify(clientManager.getStatus())}`,
      `Last error: ${errorMessage(lastError)}`
    ].join("\n")
  );
}

async function readBridgeStatus(): Promise<unknown> {
  try {
    return await client.getBridgeStatus();
  } catch (error) {
    return {
      available: false,
      error: errorMessage(error),
      hint: "Call launch_client first, or start a MindustryX MCP jar manually."
    };
  }
}

function textResult(text: string): CallToolResult {
  return {
    content: [
      {
        type: "text",
        text
      }
    ]
  };
}

function jsonResult(value: unknown): CallToolResult {
  return textResult(JSON.stringify(value, null, 2));
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function isBridgeInfo(value: unknown): value is Awaited<ReturnType<MindustryBridgeClient["loadBridgeInfo"]>> {
  return (
    typeof value === "object" &&
    value !== null &&
    "host" in value &&
    "port" in value &&
    typeof (value as { host?: unknown }).host === "string" &&
    typeof (value as { port?: unknown }).port === "number"
  );
}

const transport = new StdioServerTransport();
await server.connect(transport);
