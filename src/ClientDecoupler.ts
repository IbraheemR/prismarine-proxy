import {
  Client,
  createClient,
  PacketMeta,
  ServerClient,
} from "minecraft-protocol";
import { HOST, PASSWORD, PORT, USERNAME, VERSION } from "./config";

export function createProxyClient() {
  return createClient({
    host: HOST,
    port: PORT,
    username: USERNAME,
    password: PASSWORD,
    version: VERSION,
    // keepAlive: false,
  });
}

export default class DecoupledClient {
  fakeClient: Client | null = null;
  private ended = false;

  getOrCreateProxyClient(client: ServerClient) {
    if (!this.fakeClient) {
      console.log("Creating new client");

      this.fakeClient = createProxyClient();

      this.fakeClient.on("end", () => {});

      // client.on("end", () => {
      //   if (this.ended) return;
      //   this.ended = true;
      //   this.fakeClient.end("End.")
      //   this.fakeClient = null;
      // })

      client.on("error", (err) => {
        console.log(err.stack);
        if (this.ended) return;
        this.ended = true;
        this.fakeClient?.end("Error.");
      });

      this.fakeClient.on("end", () => {
        if (this.ended) return;
        this.ended = true;
        this.fakeClient = null;
        client.end("End");
      });

      this.fakeClient.on("error", (err) => {
        console.log(err.stack);
        if (this.ended) return;
        this.ended = true;
        this.fakeClient = null;
        client.end("Error");
      });
    } else {
      console.log("Reusing old client");

      this.replayIntroPackets(client);
    }

    return this.fakeClient;
  }

  end() {
    this.fakeClient?.end();
  }

  snoopInboundPacket(data: any, meta: PacketMeta) {
    if (meta.name === "login") {
      this.latestData.loginPacket = data;
    }
    if (meta.name === "respawn") {
      this.latestData.loginPacket.dimension = data.dimension;
      this.latestData.loginPacket.difficulty = data.difficulty;
      this.latestData.loginPacket.gameMode = data.gamemode;
      this.latestData.loginPacket.levelType = data.levelType;
    }
    if (meta.name === "game_state_change") {
      // this.latestData.gamemode = data.gameMode;
      // Could also handle raining here etc but wont for now.
      // Might need to deal with some end TP stuff

      if (data.reason === 3) {
        this.latestData.loginPacket.gameMode = data.gameMode;
      }
    }
    if (meta.name === "player_info") {
      // console.log(data);
    }
    if (meta.name === "difficulty") {
      this.latestData.loginPacket.difficulty = data.difficulty;
    }
    if (meta.name === "position" || meta.name === "position_look") {
      this.latestData.x = data.x;
      this.latestData.y = data.y;
      this.latestData.z = data.z;
      this.latestData.onGround = data.onGround;
    }
  }

  private replayIntroPackets(client: ServerClient) {
    console.log;
    client.write("login", this.latestData.loginPacket);

    client.write("position", {
      x: this.latestData.x,
      y: this.latestData.y,
      z: this.latestData.z,
      onGround: this.latestData.onGround,
      pitch: 0,
      yaw: 0,
      flags: 0x00,
    });
  }

  private latestData = {
    x: 0,
    y: 0,
    z: 0,
    onGround: true,

    isRaining: false,

    loginPacket: {
      entityId: 0,
      gameMode: 0,
      dimension: 0,
      difficulty: 0,
      maxPlayers: 0,
      levelType: "default",
      reducedDebugInfo: true,
    },
    // TODO: tab list, chunk data, entities.
  };
}

interface LoginPacketData {
  entityId: number;
  gameMode: number;
  dimension: number;
  difficulty: number;
  maxPlayers: number;
  levelType: string;
  reducedDebugInfo: boolean;
}
