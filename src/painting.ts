import { Vec3 } from "vec3";

export class Painting {
  constructor(
    public id: number,
    public position: Vec3,
    public name: string,
    public direction: Vec3
  ) {}
}
