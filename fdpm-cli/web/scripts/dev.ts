/**
 * Dev launcher — resolves free ports for BOTH the bridge and the Vite UI
 * BEFORE spawning either process, then hands them over via env vars that both
 * sides already read (server/bridge.ts reads FDPM_BRIDGE_PORT; vite.config.ts
 * reads FDPM_BRIDGE_PORT for its proxy target and FDPM_WEB_PORT for its listen
 * port). Computing the ports once here keeps the proxy target in sync with the
 * bridge — a process that independently retried onto a different port would
 * desync from Vite's static proxy config.
 *
 * Why the port scan checks both IPv4 and IPv6 loopback: a host can run
 * unrelated servers split across stacks (e.g. `[::1]:5173` busy while
 * `127.0.0.1:5173` is free). A port free on only one family is NOT safe —
 * `localhost` may resolve to either — so we treat a port as free only when no
 * loopback family reports EADDRINUSE.
 */
import net from "node:net";
import { spawn } from "node:child_process";

const LOOPBACK_HOSTS = ["127.0.0.1", "::1"] as const;
const BRIDGE_PREFERRED = Number(process.env.FDPM_BRIDGE_PORT) || 5174;
const WEB_PREFERRED = Number(process.env.FDPM_WEB_PORT) || 5173;
const MAX_ATTEMPTS = 200;

type BindResult = "free" | "busy" | "skip";

function tryBind(port: number, host: string): Promise<BindResult> {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error", (err: NodeJS.ErrnoException) => {
      // Only a genuine in-use error blocks the port. Other errors (e.g. the
      // IPv6 family being unavailable) must not make us skip an otherwise-free
      // port on an IPv4-only host.
      resolve(err.code === "EADDRINUSE" ? "busy" : "skip");
    });
    srv.once("listening", () => srv.close(() => resolve("free")));
    srv.listen(port, host);
  });
}

async function isFree(port: number): Promise<boolean> {
  for (const host of LOOPBACK_HOSTS) {
    if ((await tryBind(port, host)) === "busy") return false;
  }
  return true;
}

async function findFreePort(start: number, exclude: number[] = []): Promise<number> {
  for (let port = start; port < start + MAX_ATTEMPTS; port++) {
    if (exclude.includes(port)) continue;
    if (await isFree(port)) return port;
  }
  throw new Error(
    `[fdpm-web] no free port in range ${start}-${start + MAX_ATTEMPTS - 1} on loopback`,
  );
}

const webPort = await findFreePort(WEB_PREFERRED);
const bridgePort = await findFreePort(BRIDGE_PREFERRED, [webPort]);

const note = (label: string, preferred: number, chosen: number) =>
  chosen === preferred
    ? `${label} ${chosen}`
    : `${label} ${preferred} busy → ${chosen}`;
console.log(
  `[fdpm-web] ${note("ui", WEB_PREFERRED, webPort)}, ${note("bridge", BRIDGE_PREFERRED, bridgePort)}`,
);
console.log(`[fdpm-web] open  http://127.0.0.1:${webPort}/`);

const child = spawn(
  "concurrently",
  [
    "-k",
    "-n",
    "bridge,vite",
    "-c",
    "blue,magenta",
    "npm:dev:bridge",
    "npm:dev:vite",
  ],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      FDPM_BRIDGE_PORT: String(bridgePort),
      FDPM_WEB_PORT: String(webPort),
    },
  },
);

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
