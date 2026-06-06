import { type ChildProcess, spawn } from "node:child_process";
import fs from "node:fs/promises";
import { createWriteStream, type WriteStream } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type ClientMode = "no-render" | "render";

export type LaunchClientOptions = {
  mode?: ClientMode;
  jarPath?: string;
  javaPath?: string;
};

export type CloseClientOptions = {
  force?: boolean;
  timeoutMs?: number;
};

export type ManagedClientStatus = {
  managed: boolean;
  running: boolean;
  pid?: number;
  mode?: ClientMode;
  jarPath?: string;
  javaPath?: string;
  startedAt?: number;
  logPath?: string;
  exitCode?: number | null;
  signal?: NodeJS.Signals | null;
  error?: string;
};

export type LaunchClientResult = ManagedClientStatus & {
  started: boolean;
};

export type CloseClientResult = ManagedClientStatus & {
  closed: boolean;
  timedOut: boolean;
  message?: string;
};

const modeEnv: Record<ClientMode, string> = {
  "no-render": "MINDUSTRYX_MCP_NO_RENDER_JAR",
  render: "MINDUSTRYX_MCP_RENDER_JAR"
};

const modeFileName: Record<ClientMode, string> = {
  "no-render": "MindustryX-MCP-no-render.jar",
  render: "MindustryX-MCP-render.jar"
};

export class MindustryClientProcessManager {
  private child: ChildProcess | null = null;
  private logStream: WriteStream | null = null;
  private metadata: Omit<ManagedClientStatus, "managed" | "running"> | null = null;

  constructor(private readonly projectRoot = findProjectRoot()) {}

  async launch(options: LaunchClientOptions = {}): Promise<LaunchClientResult> {
    const running = this.getStatus();
    if (running.running) {
      return {
        ...running,
        started: false
      };
    }

    const mode = options.mode ?? "no-render";
    const javaPath = options.javaPath ?? "java";
    const jarPath = await this.resolveJarPath(mode, options.jarPath);
    const cacheDir = path.join(this.projectRoot, "cache");
    await fs.mkdir(cacheDir, { recursive: true });
    const logPath = path.join(cacheDir, `mindustryx-client-${Date.now()}.log`);
    const logStream = createWriteStream(logPath, { flags: "a" });

    const child = spawn(javaPath, ["-jar", jarPath], {
      cwd: this.projectRoot,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });

    child.stdout?.pipe(logStream, { end: false });
    child.stderr?.pipe(logStream, { end: false });

    this.child = child;
    this.logStream = logStream;
    this.metadata = {
      pid: child.pid,
      mode,
      jarPath,
      javaPath,
      startedAt: Date.now(),
      logPath,
      exitCode: null,
      signal: null
    };

    child.once("exit", (exitCode, signal) => {
      if (this.metadata) {
        this.metadata = {
          ...this.metadata,
          exitCode,
          signal
        };
      }
    });

    child.once("close", () => {
      logStream.end();
      if (this.logStream === logStream) {
        this.logStream = null;
      }
    });

    child.once("error", (error) => {
      logStream.write(`\n[launcher] Failed to start ${javaPath}: ${error.message}\n`);
      if (this.metadata) {
        this.metadata = {
          ...this.metadata,
          error: error.message
        };
      }
    });

    return {
      ...this.getStatus(),
      started: true
    };
  }

  async close(options: CloseClientOptions = {}): Promise<CloseClientResult> {
    const child = this.child;
    if (!child || !this.metadata) {
      return {
        managed: false,
        running: false,
        closed: false,
        timedOut: false,
        message: "No MindustryX client process is managed by this MCP server."
      };
    }

    if (!this.isRunning(child)) {
      return {
        ...this.getStatus(),
        closed: true,
        timedOut: false,
        message: "Managed MindustryX client process has already exited."
      };
    }

    if (process.platform === "win32") {
      await killWindowsProcessTree(child.pid, options.force ?? false);
    } else {
      const signal: NodeJS.Signals = options.force ? "SIGKILL" : "SIGTERM";
      child.kill(signal);
    }

    const exited = await waitForExit(child, options.timeoutMs ?? 5000);

    return {
      ...this.getStatus(),
      closed: exited,
      timedOut: !exited,
      message: exited ? undefined : "Timed out waiting for the managed MindustryX client process to exit."
    };
  }

  getStatus(): ManagedClientStatus {
    if (!this.child || !this.metadata) {
      return {
        managed: false,
        running: false
      };
    }

    return {
      managed: true,
      running: this.metadata.error == null && this.isRunning(this.child),
      ...this.metadata
    };
  }

  getDefaultJarPaths(): Record<ClientMode, string> {
    return {
      "no-render": path.join(this.projectRoot, "artifacts", modeFileName["no-render"]),
      render: path.join(this.projectRoot, "artifacts", modeFileName.render)
    };
  }

  getJarEnvironmentVariables(): Record<ClientMode, string> {
    return modeEnv;
  }

  private async resolveJarPath(mode: ClientMode, explicitPath?: string): Promise<string> {
    const envName = modeEnv[mode];
    const defaultPath = this.getDefaultJarPaths()[mode];
    const rawPath = explicitPath ?? process.env[envName] ?? defaultPath;
    const jarPath = path.isAbsolute(rawPath) ? rawPath : path.resolve(this.projectRoot, rawPath);

    try {
      await fs.access(jarPath);
    } catch {
      throw new Error(
        [
          `MindustryX MCP ${mode} jar not found: ${jarPath}`,
          `Provide launch_client.jarPath, set ${envName}, or place ${modeFileName[mode]} in ${path.join(this.projectRoot, "artifacts")}.`
        ].join("\n")
      );
    }

    return jarPath;
  }

  private isRunning(child: ChildProcess): boolean {
    return child.exitCode == null && child.signalCode == null;
  }
}

function findProjectRoot(): string {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  if (path.basename(moduleDir) === "dist" || path.basename(moduleDir) === "src") {
    return path.dirname(moduleDir);
  }
  return process.cwd();
}

async function waitForExit(child: ChildProcess, timeoutMs: number): Promise<boolean> {
  if (child.exitCode != null || child.signalCode != null) return true;

  return await new Promise<boolean>((resolve) => {
    const timeout = setTimeout(() => {
      child.off("exit", onExit);
      resolve(false);
    }, timeoutMs);

    const onExit = (): void => {
      clearTimeout(timeout);
      resolve(true);
    };

    child.once("exit", onExit);
  });
}

async function killWindowsProcessTree(pid: number | undefined, force: boolean): Promise<void> {
  if (pid == null) return;

  const args = ["/PID", String(pid), "/T"];
  if (force) args.push("/F");

  await new Promise<void>((resolve) => {
    const killer = spawn("taskkill.exe", args, {
      windowsHide: true,
      stdio: "ignore"
    });
    killer.once("close", () => resolve());
    killer.once("error", () => resolve());
  });
}
