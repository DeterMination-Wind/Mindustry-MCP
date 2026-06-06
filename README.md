# Mindustry MCP Server / Mindustry MCP 服务器

MCP server for controlling MindustryX through its local AI bridge.
用于通过本机 AI bridge 控制 MindustryX 的 MCP 服务器。

## Requirements / 环境要求

- Node.js 20+
- A MindustryX desktop jar built with the AI bridge
- 带 AI bridge 的 MindustryX 桌面 jar

The X client starts a local TCP bridge on `127.0.0.1` and writes connection metadata to:

```text
%TEMP%\mindustryx-ai-bridge\bridge-info.json
```

This MCP server reads that file and connects automatically. Users do not need to enter the port manually.
本 MCP 服务器会读取该文件并自动连接，使用者不需要手动填写端口。

The MindustryX jars are external artifacts. They are not committed to this repository.
MindustryX jar 是外部产物，不提交到本仓库。

Default jar paths:

```text
artifacts/MindustryX-MCP-no-render.jar
artifacts/MindustryX-MCP-render.jar
```

You can also pass `jarPath` to `launch_client`, or set:

```text
MINDUSTRYX_MCP_NO_RENDER_JAR
MINDUSTRYX_MCP_RENDER_JAR
```

## Install / 安装

```powershell
npm install
npm run build
npm start
```

## Connect / 建立连接

### AI workflow / AI 使用流程

1. Start this MCP server, or let your MCP client launch it with:

```json
{
  "mcpServers": {
    "mindustry": {
      "command": "node",
      "args": [
        "<path-to-Mindustry-MCP>/dist/index.js"
      ]
    }
  }
}
```

2. Call the `launch_client` tool.
   调用 `launch_client` 工具。
   - Default: starts `MindustryX-MCP-no-render.jar`.
   - 默认：启动 `MindustryX-MCP-no-render.jar`。
   - Use `mode: "render"` when a visible client is needed for debugging.
   - 需要可见窗口调试时传 `mode: "render"`。
3. Call `get_state` to verify the bridge.
   调用 `get_state` 验证桥接。
4. Use `load_map` to enter a local map, or `join_game` to connect the X client to a server.
   用 `load_map` 载入本地地图，或用 `join_game` 让 X 端连接服务器。
5. When done with a client launched by this MCP server, call `close_client`.
   使用完由 MCP 拉起的客户端后，调用 `close_client`。

The MCP prompt `mindustry_client_usage` contains the same AI-facing workflow for clients that expose prompts.
MCP prompt `mindustry_client_usage` 也提供同样的 AI 使用提示。

### Manual workflow / 手动流程

You can still start a MindustryX AI bridge jar manually before using this MCP server:
也可以先手动启动 MindustryX AI bridge jar，再使用本 MCP server：

1. Double-click one of the MindustryX AI bridge jars.
   双击打开一个 MindustryX AI bridge jar。
   - `MindustryX-MCP-render.jar`: normal desktop client with rendering.
   - `MindustryX-MCP-no-render.jar`: desktop client with world/UI rendering disabled by default.
   Manual build outputs are placed in `artifacts/`.
   手动构建产物位于 `artifacts/`。
2. Wait until MindustryX finishes startup. The bridge file should appear at `%TEMP%\mindustryx-ai-bridge\bridge-info.json`.
   等 MindustryX 启动完成，桥接文件会出现在 `%TEMP%\mindustryx-ai-bridge\bridge-info.json`。

After connection, use `get_state` to verify the bridge. Use `load_map` to enter a local map, or `join_game` to connect the X client to a server.
连接后可先调用 `get_state` 验证桥接，再用 `load_map` 载入本地地图，或用 `join_game` 让 X 端连接服务器。

## Tools / 工具

- Client / 客户端: `launch_client`, `close_client`
- Read / 读取: `get_state`, `list_maps`, `get_tiles`, `get_buildings`, `get_units`, `get_content`
- Write / 写入: `load_map`, `join_game`, `leave_game`, `place_block`, `break_block`, `write_logic`, `spawn_unit`, `set_speed`, `pause`
- Utility / 工具: `await_op`

## GitHub Actions / 持续集成

The repository includes a CI workflow that runs `npm ci` and `npm run build` on every push and pull request.
仓库已包含 CI 工作流，会在每次 push 和 pull request 时运行 `npm ci` 和 `npm run build`。

MindustryX fork / 源码 fork: https://github.com/BEK-Group/MindustryX
