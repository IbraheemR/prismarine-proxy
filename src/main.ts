import DecoupledClient from "./decoupler/ClientDecoupler";
import { createProxy } from "./proxy";

const decoupledClient = new DecoupledClient();

const server = createProxy({
  processInboundPacket(data, meta) {
    decoupledClient.snoopInboundPacket(data, meta);

    return data;
  },
  processOutboundPacket(data, meta) {
    decoupledClient.snoopOutboundPacket(data, meta);

    return data;
  },
  getProxyClient: (client) => decoupledClient.getOrCreateProxyClient(client),
});

// c.on("chat", data => {
//   const json = JSON.parse(data.message);
//   if (json.translate  == "chat.type.text") {
//     const msg = json.with[1];
//     if (msg === "~end") c.end();
//   }
// })
