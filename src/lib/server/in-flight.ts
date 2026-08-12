export class InFlightRegistry<Value> {
  readonly #requests = new Map<string, Promise<Value>>();

  constructor(readonly maxEntries = 256) {
    if (!Number.isSafeInteger(maxEntries) || maxEntries <= 0) {
      throw new TypeError("The in-flight registry size must be a positive integer.");
    }
  }

  run(key: string, operation: () => Promise<Value>): Promise<Value> {
    const existing = this.#requests.get(key);
    if (existing) return existing;

    const request = Promise.resolve().then(operation);
    if (this.#requests.size >= this.maxEntries) return request;

    this.#requests.set(key, request);
    const clear = () => {
      if (this.#requests.get(key) === request) this.#requests.delete(key);
    };
    void request.then(clear, clear);
    return request;
  }

  get size(): number {
    return this.#requests.size;
  }
}
