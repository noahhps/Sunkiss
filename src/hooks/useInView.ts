import { useEffect, useRef, useState } from "react";

// Whether an element is on screen (or within `margin` of it). For things too heavy to have
// hundreds of at once, like a <video> per thumbnail: each one only exists while you can see it.
// With `once`, it stays true after the first time, for things worth keeping once loaded.
export function useInView<T extends Element>({ margin = "200px", once = false } = {}) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        setInView(entry.isIntersecting);
        if (once && entry.isIntersecting) observer.disconnect();
      },
      { rootMargin: margin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [margin, once]);

  return [ref, inView] as const;
}
