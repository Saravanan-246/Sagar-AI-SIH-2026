import { useEffect, type RefObject } from "react";

/**
 * Keeps a full-viewport, position:fixed shell sized to the area actually
 * visible above the mobile on-screen keyboard.
 *
 * The viewport meta's interactive-widget=resizes-content already makes
 * Android Chrome shrink the layout (and 100dvh) when the keyboard opens.
 * Browsers that ignore it (Samsung Internet, Firefox, iOS Safari) only
 * shrink the *visual* viewport, leaving the fixed shell - and its
 * composer - underneath the keyboard, and then scroll the whole page to
 * reveal the focused textarea, which is the "layout jump". Mirroring
 * visualViewport.height into --chat-viewport-height and undoing that
 * page scroll keeps the composer pinned directly above the keyboard.
 */
export function useKeyboardViewport(shellRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const viewport = window.visualViewport;
    const shell = shellRef.current;
    if (!viewport || !shell) return;

    const sync = () => {
      shell.style.setProperty("--chat-viewport-height", `${viewport.height}px`);

      // The browser may have scrolled the document to bring the focused
      // input into view; the shell already does that, so undo it.
      if (window.scrollY !== 0) {
        window.scrollTo(0, 0);
      }
    };

    sync();
    viewport.addEventListener("resize", sync);
    viewport.addEventListener("scroll", sync);

    return () => {
      viewport.removeEventListener("resize", sync);
      viewport.removeEventListener("scroll", sync);
      shell.style.removeProperty("--chat-viewport-height");
    };
  }, [shellRef]);
}

export default useKeyboardViewport;
