import type { ServerConfig } from "./types";

const DEFAULT_SERVER = "https://yerlikoglon-backend.onrender.com";

export const config: ServerConfig = {
  url: (process.env.NEXT_PUBLIC_SERVER_URL as string | undefined)?.replace(/\/$/, "") || DEFAULT_SERVER,
};
