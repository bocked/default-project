import type { ServerConfig } from "./types";

const DEFAULT_SERVER = "http://localhost:4000";

export const config: ServerConfig = {
  url: (process.env.NEXT_PUBLIC_SERVER_URL as string | undefined)?.replace(/\/$/, "") || DEFAULT_SERVER,
};
