/**
 * For tests that fetch from a stand-in for a service: keeps the event loop turning every couple of milliseconds.
 *
 * Before Node's fetch uses a connection a second time it checks it's still open, on a setImmediate it has unref'd
 * (scheduleIdleSocketValidation in undici 8.9, which Node 26.7 ships). An unref'd immediate runs only when something
 * else wakes the loop, and in a test waiting on one request nothing does until fetch's own clock ticks, every 499ms. So
 * each request after the first took up to half a second, a test that follows a job through a dozen of them took four of
 * the five seconds it's allowed, and timed out when the machine was busy. A timer that does nothing is enough to run the
 * check at once.
 *
 * Closing each connection instead is no way round it: the ComfyUI tests make thousands of requests, and that many
 * connections in a few seconds leaves the machine none to give (connects then take seconds, or fail).
 */
export function keepLoopTurning(): void {
  setInterval(() => undefined, 2).unref();
}
