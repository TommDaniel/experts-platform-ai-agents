import { describe, expect, it } from "vitest";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";

describe("AppController", () => {
  it("should return hello world", () => {
    const controller = new AppController(new AppService());
    expect(controller.getHello()).toEqual({ message: "hello world" });
  });
});
