import { useEffect, useState } from "react";
import Icon from "./Icon";

// Asks the server for the files again. The arrow turns while the answer is on its way, and
// always finishes the turn it's on rather than snapping back, so even an answer that comes
// at once shows that something happened.
export default function RefreshButton({ busy, onRefresh }: { busy: boolean; onRefresh: () => void }) {
  const [turning, setTurning] = useState(false);

  useEffect(() => {
    if (busy) setTurning(true);
  }, [busy]);

  return (
    <button
      type="button"
      className="round tool refresh"
      aria-label="Refresh"
      title="Refresh"
      aria-busy={busy}
      data-turning={turning ? "" : undefined}
      onClick={() => {
        if (!busy) onRefresh();
      }}
      // Each time the arrow comes round: stop there, if the answer is in.
      onAnimationIteration={() => {
        if (!busy) setTurning(false);
      }}
    >
      <Icon name="refresh" />
    </button>
  );
}
