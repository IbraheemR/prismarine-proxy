import {
  Client,
  createClient,
  createServer,
  PacketMeta,
  ServerClient,
  states,
} from "minecraft-protocol";
import { HOST, VERSION } from "./config";

interface ProxyOptions {
  getProxyClient: (realClient: ServerClient) => Client;
  processInboundPacket: (data: any, meta: PacketMeta) => any;
  processOutboundPacket: (data: any, meta: PacketMeta) => any;
}

export function createProxy({
  getProxyClient,
  processInboundPacket = (data: any, meta: PacketMeta) => data,
  processOutboundPacket = (data: any, meta: PacketMeta) => data,
}: ProxyOptions) {
  const s = createServer({
    port: 8081,
    version: VERSION,
    keepAlive: false,
    motd: `Hotswap proxy server for §b§l${HOST}`,
  });

  s.on("login", (client) => {
    let ended = false;

    if (s.playerCount > 0) {
      client.end();
      return;
    }

    const fakeClient = getProxyClient(client);

    client.on("packet", (data, meta) => {
      if (ended) return;
      if (fakeClient.state !== states.PLAY || meta.state !== states.PLAY)
        return;

      let newData = processOutboundPacket(data, meta);

      if (newData) fakeClient.write(meta.name, newData);
    });

    fakeClient.on("packet", (data, meta) => {
      if (ended) return;
      if (meta.state !== states.PLAY || client.state !== states.PLAY) return;
      if (meta.name === "keep_alive") return; // Do not relay keep-alive packets - the proxy client will handle them.

      let newData = processInboundPacket(data, meta);

      if (newData) client.write(meta.name, newData);
    });
  });

  return s;
}
