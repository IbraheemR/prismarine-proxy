import { Vec3 } from "vec3";
import { Painting } from "./painting";
import { VERSION } from "../config";
import { PacketMeta, ServerClient } from "minecraft-protocol";

const nbt = require("prismarine-nbt");

import ChunkLoader from "prismarine-chunk/types/chunk";
const Chunk: ReturnType<typeof ChunkLoader> =
  require("prismarine-chunk")(VERSION);

const ChatMessage = require("prismarine-chat")(VERSION);

import WorldLoader from "prismarine-world/src/world";
const World: ReturnType<typeof WorldLoader> =
  require("prismarine-world")(VERSION);

export class WorldReplayHandler {
  private signs: any = {};
  private paintingsByPos: any = {};
  private paintingsById: any = {};

  private blockEntities: any = {};

  private world = new World().sync;

  private dimension: string;

  constructor() {}

  private updateBlockState(point: Vec3, stateId: number) {
    const oldBlock = this.blockAt(point);
    this.world.setBlockStateId(point, stateId);

    const newBlock = this.blockAt(point);
    // sometimes minecraft server sends us block updates before it sends
    // us the column that the block is in. ignore this.
    if (newBlock === null) {
      return;
    }
    if (oldBlock.type !== newBlock.type) {
      const pos = point.floored();
      delete this.blockEntities[pos.toString()];
      delete this.signs[pos.toString()];

      const painting = this.paintingsByPos[pos.toString()];
      if (painting) this.deletePainting(painting);
    }
  }

  private blockAt(absolutePoint: Vec3, extraInfos = true) {
    const block = this.world.getBlock(absolutePoint);
    // null block means chunk not loaded
    if (!block) return null;

    if (extraInfos) {
      block.signText = this.signs[block.position];
      block.painting = this.paintingsByPos[block.position];
      block.blockEntity = this.blockEntities[block.position];
    }

    return block;
  }

  private addPainting(painting: Painting) {
    this.paintingsById[painting.id] = painting;
    this.paintingsByPos[painting.position.toString()] = painting;
  }

  private deletePainting(painting: Painting) {
    delete this.paintingsById[painting.id];
    delete this.paintingsByPos[painting.position.toString()];
  }

  private addBlockEntity(nbtData: any) {
    const blockEntity = nbt.simplify(nbtData);
    const pos = new Vec3(blockEntity.x, blockEntity.y, blockEntity.z).floored();
    // Set raw nbt of blockEntity
    blockEntity.raw = nbtData;
    // Handle signs
    if (blockEntity.id === "minecraft:sign" || blockEntity.id === "Sign") {
      const prepareJson = (i: any) => {
        const data = blockEntity[`Text${i}`];

        if (data === null || data === "") return "";

        const json = JSON.parse(data);
        if (json === null || !("text" in json)) return "";

        json.text = json.text.replace(/^"|"$/g, "");
        return json;
      };

      blockEntity.Text1 = new ChatMessage(prepareJson(1));
      blockEntity.Text2 = new ChatMessage(prepareJson(2));
      blockEntity.Text3 = new ChatMessage(prepareJson(3));
      blockEntity.Text4 = new ChatMessage(prepareJson(4));

      this.signs[pos.toString()] = [
        blockEntity.Text1.toString(),
        blockEntity.Text2.toString(),
        blockEntity.Text3.toString(),
        blockEntity.Text4.toString(),
      ].join("\n");
    }

    this.blockEntities[pos.toString()] = blockEntity;
  }

  private delColumn(chunkX: number, chunkZ: number) {
    this.world.unloadColumn(chunkX, chunkZ);
  }

  private addColumn(args: any) {
    if (!args.bitMap && args.groundUp) {
      // stop storing the chunk column
      this.delColumn(args.x, args.z);
      return;
    }
    let column = this.world.getColumn(args.x, args.z);
    if (!column) {
      column = new Chunk(null);
    }

    column.load(args.data, args.bitMap, args.skyLightSent, args.groundUp);
    if (args.biomes !== undefined) {
      column.loadBiomes(args.biomes);
    }
    this.world.setColumn(args.x, args.z, column);
  }

  private async switchWorld() {
    if (this.world) {
      for (const [x, z] of Object.keys(this.world.async.columns).map((key) =>
        key.split(",").map((x) => parseInt(x, 10))
      )) {
        this.world.unloadColumn(x, z);
      }
    } else {
      this.world = new World().sync;
    }
  }

  snoopInboundPacket(data: any, meta: PacketMeta) {
    if (meta.name === "login") {
      this.dimension = data.dimension;
      this.switchWorld();
    }

    if (meta.name === "respawn") {
      if (this.dimension === data.dimension) return;
      this.dimension = data.dimension;
      this.switchWorld();
    }

    if (meta.name === "unload_chunk") {
      this.delColumn(data.chunkX, data.chunkZ);
    }

    if (meta.name === "map_chunk") {
      this.addColumn({
        x: data.x,
        z: data.z,
        bitMap: data.bitMap,
        heightmaps: data.heightmaps,
        biomes: data.biomes,
        skyLightSent: true, // HACK: bot.game.dimension === "minecraft:overworld",
        groundUp: data.groundUp,
        data: data.chunkData,
      });

      if (typeof data.blockEntities !== "undefined") {
        for (const nbtData of data.blockEntities) {
          this.addBlockEntity(nbtData);
        }
      }
    }

    if (meta.name === "multi_block_change") {
      // multi block change
      for (let i = 0; i < data.records.length; ++i) {
        const record = data.records[i];

        let blockX, blockY, blockZ;

        blockZ = record.horizontalPos & 0x0f;
        blockX = (record.horizontalPos >> 4) & 0x0f;
        blockY = record.y;

        let pt = new Vec3(data.chunkX, 0, data.chunkZ);

        pt = pt.scale(16).offset(blockX, blockY, blockZ);

        this.updateBlockState(pt, record.blockId);
      }
    }

    if (meta.name === "block_change") {
      const pt = new Vec3(data.location.x, data.location.y, data.location.z);
      this.updateBlockState(pt, data.type);
    }

    if (meta.name === "explosion") {
      // explosion
      const p = new Vec3(data.x, data.y, data.z);
      data.affectedBlockOffsets.forEach((offset: Vec3) => {
        const pt = p.offset(offset.x, offset.y, offset.z);
        this.updateBlockState(pt, 0);
      });
    }

    if (meta.name === "spawn_entity_painting") {
      const pos = new Vec3(data.location.x, data.location.y, data.location.z);
      const painting = new Painting(
        data.entityId,
        pos,
        data.title,
        paintingFaceToVec[data.direction]
      );
      this.addPainting(painting);
    }

    if (meta.name === "entity_destroy") {
      // destroy entity
      data.entityIds.forEach((id: number) => {
        const painting = this.paintingsById[id];
        if (painting) this.deletePainting(painting);
      });
    }

    if (meta.name === "update_sign") {
      const pos = new Vec3(data.location.x, data.location.y, data.location.z);

      const prepareString = (i: any) => {
        let text = data[`text${i}`];

        if (text === "null" || text === "") {
          text = '""';
        }

        const json = JSON.parse(text);
        if (json.text) {
          json.text = json.text.replace(/^"|"$/g, "");
        }

        return new ChatMessage(json);
      };

      this.signs[pos.toString()] = [
        prepareString(1),
        prepareString(2),
        prepareString(3),
        prepareString(4),
      ].join("\n");
    }

    if (meta.name === "tile_entity_data") {
      this.addBlockEntity(data.nbtData);
    }
  }

  replayIntroPackets(client: ServerClient) {
    for (const { chunkX, chunkZ, column: chunk } of this.world.getColumns()) {
      client.write("map_chunk", {
        x: chunkX,
        z: chunkZ,
        groundUp: true,
        bitMap: chunk.getMask(),
        biomes: chunk.biomes,
        chunkData: chunk.dump(),
        blockEntities: [], // TODO
      });
    }
  }
}

const paintingFaceToVec = [
  new Vec3(0, 0, -1),
  new Vec3(-1, 0, 0),
  new Vec3(0, 0, 1),
  new Vec3(1, 0, 0),
];
