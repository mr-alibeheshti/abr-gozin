/// <reference types="vite/client" />

export const appPath = (path = "") =>
  import.meta.env.BASE_URL + path.replace(/^\//, "");
