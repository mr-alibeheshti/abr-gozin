import { basePath } from "../shared/base-path.mjs";

export function runtimeConfig(env = process.env) {
  const path = basePath(env.APP_BASE_PATH);
  const publicUrl = env.PUBLIC_URL ? new URL(env.PUBLIC_URL) : null;
  if (
    publicUrl &&
    (publicUrl.protocol !== "https:" ||
      publicUrl.username ||
      publicUrl.password ||
      publicUrl.search ||
      publicUrl.hash ||
      basePath(publicUrl.pathname) !== path)
  )
    throw new Error("PUBLIC_URL must be the HTTPS URL matching APP_BASE_PATH");
  const port = Number(env.PORT || 4321);
  const host = env.HOST || "127.0.0.1";
  if (
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535 ||
    !["127.0.0.1", "0.0.0.0"].includes(host)
  )
    throw new Error("Invalid listening host or port");
  return {
    basePath: path,
    port,
    host,
    publicUrl,
    cookiePath: path ? path + "/" : "/",
    origins: new Set([
      `http://localhost:${port}`,
      `http://127.0.0.1:${port}`,
      ...(publicUrl ? [publicUrl.origin] : []),
    ]),
  };
}
