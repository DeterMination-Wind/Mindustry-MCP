import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolResult, ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { MindustryBridgeClient } from "./protocol.js";

const client = new MindustryBridgeClient();
const mindustryxRepoUrl = "https://github.com/BEK-Group/MindustryX";

const server = new McpServer({
  name: "mindustry-mcp-server",
  version: "0.1.0"
});

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
    const info = await client.getBridgeStatus();
    const payload = {
      ...info,
      mindustryxRepoUrl
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

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

const transport = new StdioServerTransport();
await server.connect(transport);
