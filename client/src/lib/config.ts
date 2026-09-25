import type { ServerConfig } from "./types";

const DEFAULT_SERVER = "https://api.yerlikoglon.uz";

export const config: ServerConfig = {
  url: (process.env.NEXT_PUBLIC_SERVER_URL as string | undefined)?.replace(/\/$/, "") || DEFAULT_SERVER,
};
