// The JS half of the motion system (the CSS half is motion.css): for motion that has to
// answer the hand, a spring that starts from where a thing is and how fast it's already
// going, so it can be caught, thrown, and turned round at any moment without a jump.

// Apple's way of describing a spring: `damping` 1 settles without overshoot, lower
// overshoots; `response` is roughly how long it takes to get there, in seconds.
export type Spring = { damping: number; response: number };

// For things moved by a click or a key: no overshoot.
export const SETTLE: Spring = { damping: 1, response: 0.4 };
// For things let go with momentum (a flick, a throw): a touch of overshoot.
export const THROWN: Spring = { damping: 0.8, response: 0.4 };

// Where something let go at `velocity` (per second) would come to rest on its own, the
// way a scroll view decelerates. 0.998 is a normal scroll; 0.99 stops sooner. (Apple's
// own projection, from the Designing Fluid Interfaces sample code.)
export function project(velocity: number, rate = 0.99) {
  return ((velocity / 1000) * rate) / (1 - rate);
}

// Past an edge, the further you pull the less it follows: it slows before it stops
// instead of hitting a wall. `dimension` is the size of the thing being pulled.
export function rubberband(overshoot: number, dimension: number, constant = 0.55) {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

// One number, sprung. `to` sends it somewhere new from wherever it is now, keeping its
// velocity unless you hand it one (the finger's, at release). `stop` leaves it where it is.
export function spring(onUpdate: (value: number) => void, initial = 0) {
  let value = initial;
  let velocity = 0; // per second
  let target = initial;
  let tune = SETTLE;
  let raf = 0;
  let last = 0;

  const tick = (now: number) => {
    // Small fixed steps, so a dropped frame doesn't change the motion, only skip a picture of it.
    let dt = Math.min(0.064, (now - last) / 1000);
    last = now;
    const stiffness = (2 * Math.PI / tune.response) ** 2;
    const friction = (4 * Math.PI * tune.damping) / tune.response;
    while (dt > 0) {
      const step = Math.min(dt, 1 / 240);
      velocity += (stiffness * (target - value) - friction * velocity) * step;
      value += velocity * step;
      dt -= step;
    }
    if (Math.abs(target - value) < 0.0005 && Math.abs(velocity) < 0.005) {
      value = target;
      velocity = 0;
      raf = 0;
    } else {
      raf = requestAnimationFrame(tick);
    }
    onUpdate(value);
  };

  return {
    get value() {
      return value;
    },
    get target() {
      return target;
    },
    get moving() {
      return raf !== 0;
    },
    to(next: number, options: { velocity?: number; spring?: Spring } = {}) {
      target = next;
      if (options.velocity !== undefined) velocity = options.velocity;
      if (options.spring) tune = options.spring;
      if (!raf) {
        last = performance.now();
        raf = requestAnimationFrame(tick);
      }
    },
    // Put it somewhere at once: for a drag, which moves it 1:1, and for reduced motion.
    set(next: number) {
      this.stop();
      value = target = next;
      velocity = 0;
      onUpdate(value);
    },
    stop() {
      cancelAnimationFrame(raf);
      raf = 0;
      target = value;
    },
  };
}

// Velocity from the last few pointer moves, not just the last one (one event is noisy,
// and a finger that stopped before letting go should throw nothing).
export function tracker(window = 80) {
  let samples: { x: number; t: number }[] = [];
  return {
    reset() {
      samples = [];
    },
    add(x: number, t: number) {
      samples.push({ x, t });
      while (samples.length > 2 && t - samples[0].t > window) samples.shift();
    },
    // Per second, as of `now`.
    velocity(now: number) {
      const first = samples[0];
      const latest = samples[samples.length - 1];
      if (!first || !latest || latest === first || now - latest.t > window) return 0;
      return ((latest.x - first.x) / (latest.t - first.t)) * 1000;
    },
  };
}
