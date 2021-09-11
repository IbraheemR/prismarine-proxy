import { config } from "dotenv";

config();

export const USERNAME = process.env.USERNAME;
export const PASSWORD = process.env.PASSWORD;

export const VERSION = process.env.VERSION ?? "1.12.2";

export const HOST = process.env.HOST ?? "localhost";
export const PORT = +(process.env.PORT ?? 25565);
