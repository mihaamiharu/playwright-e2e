export class ScenarioContext {
  private store = new Map<string, unknown>();

  set<T>(key: string, value: T): void {
    this.store.set(key, value);
  }

  get<T>(key: string): T {
    if (!this.store.has(key)) {
      throw new Error(`ScenarioContext: key "${key}" not found`);
    }
    return this.store.get(key) as T;
  }
}
