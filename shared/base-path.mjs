export function basePath(value = "") {
  const path = String(value).replace(/\/$/, "");
  if (!path) return "";
  if (!/^\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+$/.test(path))
    throw new Error("APP_BASE_PATH must be a simple absolute path");
  return path;
}
