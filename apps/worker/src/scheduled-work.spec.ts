import "reflect-metadata";
import { Injectable, Module, OnApplicationShutdown } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { expect, test, vi } from "vitest";
import { ScheduledWorkService } from "./scheduled-work.service.js";

test("Nest shutdown drains a scheduled task before closing its shared resources", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let resourcesClosed = false;
  class Resource implements OnApplicationShutdown {
    onApplicationShutdown() { resourcesClosed = true; }
  }
  Injectable()(Resource);
  class TestModule {}
  Module({ providers: [ScheduledWorkService, Resource] })(TestModule);
  const app = await NestFactory.createApplicationContext(TestModule, { logger: false });
  const scheduled = app.get(ScheduledWorkService);
  const stop = vi.spyOn(scheduled, "onModuleDestroy");
  const job = scheduled.run(async () => {
    await gate;
    expect(resourcesClosed).toBe(false);
    return "finished";
  });
  let stopped = false;
  const closing = app.close().then(() => { stopped = true; });
  await vi.waitFor(() => expect(stop).toHaveBeenCalledOnce());
  const newTask = vi.fn(async () => "should not start");
  expect(await scheduled.run(newTask)).toBeUndefined();
  expect(newTask).not.toHaveBeenCalled();
  expect(stopped).toBe(false);
  expect(resourcesClosed).toBe(false);
  release();
  expect(await job).toBe("finished");
  await closing;
  expect(resourcesClosed).toBe(true);
});

test("failed scheduled work keeps its error and does not block shutdown", async () => {
  const scheduled = new ScheduledWorkService();
  await expect(scheduled.run(async () => { throw new Error("provider failed"); })).rejects.toThrow("provider failed");
  await expect(scheduled.onModuleDestroy()).resolves.toBeUndefined();
});
