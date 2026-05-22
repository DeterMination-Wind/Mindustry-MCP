# Mindustry MCP Server / Mindustry MCP 服务器

MCP server for the MindustryX AI bridge.
用于 MindustryX AI bridge 的 MCP 服务器。

## Requirements / 环境要求

- MindustryX running with the AI bridge enabled
- 启用了 AI bridge 的 MindustryX
- Node.js 20+

The server reads `bridge-info.json` from the system temp directory and connects to the local bridge automatically.
服务器会从系统临时目录读取 `bridge-info.json`，并自动连接到本地 bridge。

## Install / 安装

```powershell
npm install
npm run build
npm start
```

## Tools / 工具

- Read / 读取: `get_state`, `list_maps`, `get_tiles`, `get_buildings`, `get_units`, `get_content`
- Write / 写入: `load_map`, `join_game`, `leave_game`, `place_block`, `break_block`, `write_logic`, `spawn_unit`, `set_speed`, `pause`
- Utility / 工具: `await_op`

## GitHub Actions / 持续集成

The repository includes a CI workflow that runs `npm ci` and `npm run build` on every push and pull request.
仓库已包含 CI 工作流，会在每次 push 和 pull request 时运行 `npm ci` 和 `npm run build`。

MindustryX fork / 源码 fork: https://github.com/BEK-Group/MindustryX
