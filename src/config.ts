import { config } from "dotenv";

config();

export const USERNAME = process.env.MC_USERNAME;
export const PASSWORD = process.env.MC_PASSWORD;

export const VERSION = process.env.MC_VERSION ?? "1.12.2";

export const HOST = process.env.MC_HOST ?? "localhost";
export const PORT = +(process.env.MC_PORT ?? 25565);
