import { useState } from "react";

// The search field, in the style of Courier QuickView's composer: a floating glass capsule
// with a round accent button that sends. `onChange` reports every keystroke, for screens
// that filter as you type; `onSearch` fires when you press Enter or the button.
export default function SearchBox({
  onSearch,
  onChange,
  placeholder = "Search, Ask, Task",
}: {
  onSearch: (query: string) => void;
  onChange?: (query: string) => void;
  placeholder?: string;
}) {
  const [value, setValue] = useState("");

  return (
    <form
      className="composer"
      onSubmit={(e) => {
        e.preventDefault();
        onSearch(value.trim());
      }}
    >
      <input
        value={value}
        onChange={(e) => {
          setValue(e.currentTarget.value);
          onChange?.(e.currentTarget.value);
        }}
        placeholder={placeholder}
        aria-label="Search files"
      />
      <button type="submit" className="round send" aria-label="Search" disabled={!value.trim()}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 19V5M6 11l6-6 6 6" />
        </svg>
      </button>
    </form>
  );
}
