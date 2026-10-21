export type CustomerInfoSummary = {
  entitlements: { active: Record<string, { isActive: boolean } | undefined> };
  managementURL?: string | null;
};

export type SubscriptionPlan = { id: string; title: string; description: string; price: string };

export type SubscriptionAdapter = {
  configure: (apiKey: string, userId: string) => void | Promise<void>;
  logIn: (userId: string) => Promise<CustomerInfoSummary>;
  getCustomerInfo: () => Promise<CustomerInfoSummary>;
  getPlans: () => Promise<SubscriptionPlan[]>;
  purchase: (planId: string) => Promise<CustomerInfoSummary>;
  restore: () => Promise<CustomerInfoSummary>;
  addCustomerInfoListener: (listener: (info: CustomerInfoSummary) => void) => void;
};

export type SubscriptionStatus = "signed-out" | "loading" | "unavailable" | "inactive" | "active" | "error";
export type SubscriptionOutcome = "active" | "inactive" | "cancelled" | "error" | "unavailable" | "superseded";
export type SubscriptionSnapshot = {
  userId: string | null;
  status: SubscriptionStatus;
  plans: SubscriptionPlan[];
  plansStatus: "idle" | "loading" | "ready" | "error";
  operation: "purchase" | "restore" | null;
  message: string | null;
  managementUrl: string | null;
};

const initialSnapshot: SubscriptionSnapshot = {
  userId: null,
  status: "signed-out",
  plans: [],
  plansStatus: "idle",
  operation: null,
  message: null,
  managementUrl: null,
};

export function hasActiveEntitlement(info: CustomerInfoSummary, entitlementId: string): boolean {
  return info.entitlements.active[entitlementId]?.isActive === true;
}

export function isPurchaseCancelled(error: unknown): boolean {
  return typeof error === "object" && error !== null && "userCancelled" in error && error.userCancelled === true;
}

export class SubscriptionController {
  private snapshot = initialSnapshot;
  private readonly listeners = new Set<() => void>();
  private adapterPromise: Promise<SubscriptionAdapter> | null = null;
  private adapter: SubscriptionAdapter | null = null;
  private queue: Promise<void> = Promise.resolve();
  private revision = 0;
  private configured = false;
  private sdkUserId: string | null = null;
  private lastInfoFetchAt = 0;

  constructor(private readonly options: {
    apiKey: string | undefined;
    entitlementId: string | undefined;
    createAdapter: () => Promise<SubscriptionAdapter>;
  }) {}

  getSnapshot = (): SubscriptionSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private update(next: SubscriptionSnapshot): void {
    this.snapshot = next;
    this.listeners.forEach((listener) => listener());
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = this.queue.then(task, task);
    this.queue = result.then(() => undefined, () => undefined);
    return result;
  }

  setUser(userId: string | null): void {
    if (userId === this.snapshot.userId) return;
    const revision = ++this.revision;
    this.lastInfoFetchAt = 0;
    this.update(userId ? { ...initialSnapshot, userId, status: "loading" } : initialSnapshot);
    if (!userId) return; // Auth owns sign-out; never create a RevenueCat anonymous ID.
    void this.enqueue(() => this.start(userId, revision));
  }

  retry(): void {
    const userId = this.snapshot.userId;
    if (!userId) return;
    const revision = ++this.revision;
    this.update({ ...this.snapshot, status: "loading", message: null });
    void this.enqueue(() => this.start(userId, revision));
  }

  private async getAdapter(): Promise<SubscriptionAdapter> {
    if (!this.adapterPromise) {
      this.adapterPromise = this.options.createAdapter().catch((error: unknown) => {
        this.adapterPromise = null;
        throw error;
      });
    }
    return this.adapterPromise;
  }

  private async start(userId: string, revision: number): Promise<void> {
    if (revision !== this.revision) return;
    if (!this.options.apiKey || !this.options.entitlementId) {
      this.update({ ...this.snapshot, status: "unavailable" });
      return;
    }
    try {
      const adapter = await this.getAdapter();
      if (revision !== this.revision) return;
      if (!this.configured) {
        await adapter.configure(this.options.apiKey, userId);
        this.configured = true;
        this.sdkUserId = userId;
        this.adapter = adapter;
        adapter.addCustomerInfoListener(() => {
          const currentUser = this.snapshot.userId;
          if (!currentUser || currentUser !== this.sdkUserId || this.snapshot.status === "loading") return;
          // Re-read from the SDK after an event rather than applying a possibly
          // delayed CustomerInfo object from the previous signed-in account.
          void this.enqueue(async () => {
            if (currentUser !== this.snapshot.userId || currentUser !== this.sdkUserId) return;
            try {
              const info = await adapter.getCustomerInfo();
              if (currentUser === this.snapshot.userId && currentUser === this.sdkUserId) this.applyInfo(info);
            } catch { /* Keep the last known state; manual retry remains available. */ }
          });
        });
      } else if (this.sdkUserId !== userId) {
        await adapter.logIn(userId);
        this.sdkUserId = userId;
      }
      if (revision !== this.revision) return;
      const info = await adapter.getCustomerInfo();
      if (revision === this.revision && this.sdkUserId === userId) this.applyInfo(info);
    } catch {
      if (revision === this.revision) this.update({ ...this.snapshot, status: "error", message: "Could not check membership. Check your connection and try again." });
    }
  }

  private applyInfo(info: CustomerInfoSummary): void {
    this.lastInfoFetchAt = Date.now();
    const active = hasActiveEntitlement(info, this.options.entitlementId ?? "");
    this.update({ ...this.snapshot, status: active ? "active" : "inactive", managementUrl: active ? info.managementURL ?? null : null, message: null });
  }

  async refreshInfo(): Promise<void> {
    const userId = this.snapshot.userId;
    if (!userId || (this.snapshot.status !== "active" && this.snapshot.status !== "inactive")) return;
    // RevenueCat caches CustomerInfo; avoid needless checks on every render or
    // quick navigation while still refreshing after a longer foreground stay.
    if (Date.now() - this.lastInfoFetchAt < 60_000) return;
    await this.enqueue(async () => {
      if (userId !== this.snapshot.userId || !this.adapter || this.sdkUserId !== userId) return;
      try {
        const info = await this.adapter.getCustomerInfo();
        if (userId === this.snapshot.userId && this.sdkUserId === userId) this.applyInfo(info);
      } catch {
        if (userId === this.snapshot.userId) this.update({ ...this.snapshot, status: "error", message: "Could not refresh membership. Check your connection and try again." });
      }
    });
  }

  async loadPlans(): Promise<void> {
    const userId = this.snapshot.userId;
    if (!userId || this.snapshot.status === "unavailable" || this.snapshot.plansStatus === "ready" || this.snapshot.plansStatus === "loading") return;
    this.update({ ...this.snapshot, plansStatus: "loading", message: null });
    await this.enqueue(async () => {
      if (userId !== this.snapshot.userId || !this.adapter || this.sdkUserId !== userId) return;
      try {
        const plans = await this.adapter.getPlans();
        if (userId === this.snapshot.userId) this.update({ ...this.snapshot, plans, plansStatus: "ready", message: null });
      } catch {
        if (userId === this.snapshot.userId) this.update({ ...this.snapshot, plansStatus: "error", message: "Plans could not be loaded. Check your connection and try again." });
      }
    });
  }

  async purchase(planId: string): Promise<SubscriptionOutcome> {
    return this.runOperation("purchase", (adapter) => adapter.purchase(planId));
  }

  async restore(): Promise<SubscriptionOutcome> {
    return this.runOperation("restore", (adapter) => adapter.restore());
  }

  private async runOperation(kind: "purchase" | "restore", action: (adapter: SubscriptionAdapter) => Promise<CustomerInfoSummary>): Promise<SubscriptionOutcome> {
    const userId = this.snapshot.userId;
    if (!userId || this.snapshot.status === "unavailable") return "unavailable";
    if (this.snapshot.operation) return "error";
    this.update({ ...this.snapshot, operation: kind, message: null });
    return this.enqueue(async () => {
      if (userId !== this.snapshot.userId || !this.adapter || this.sdkUserId !== userId) return "superseded";
      try {
        const info = await action(this.adapter);
        if (userId !== this.snapshot.userId) return "superseded";
        this.applyInfo(info);
        const active = hasActiveEntitlement(info, this.options.entitlementId ?? "");
        this.update({ ...this.snapshot, operation: null, message: active ? (kind === "restore" ? "Your membership was restored." : "Your membership is active.") : kind === "restore" ? "No active membership was found for this store account." : "The purchase completed, but membership is not active yet. Please retry or restore purchases." });
        return active ? "active" : "inactive";
      } catch (error) {
        if (userId !== this.snapshot.userId) return "superseded";
        const cancelled = kind === "purchase" && isPurchaseCancelled(error);
        this.update({ ...this.snapshot, operation: null, message: cancelled ? "Purchase cancelled. Nothing was charged." : `${kind === "restore" ? "Restore" : "Purchase"} could not be completed. Check your connection and try again.` });
        return cancelled ? "cancelled" : "error";
      }
    });
  }
}
