import { Injectable, OnModuleDestroy } from "@nestjs/common";

/** Stop starting scheduled work, then finish it before shared resources close. */
@Injectable()
export class ScheduledWorkService implements OnModuleDestroy {
  private stopping = false;
  private readonly pending = new Set<Promise<unknown>>();

  async run<T>(task: () => Promise<T>): Promise<T | undefined> {
    if (this.stopping) return;
    const pending = Promise.resolve().then(task);
    this.pending.add(pending);
    try { return await pending; }
    finally { this.pending.delete(pending); }
  }

  async onModuleDestroy() {
    this.stopping = true;
    await Promise.allSettled(this.pending);
  }
}
