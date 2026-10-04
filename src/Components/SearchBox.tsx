import { useState, type Ref } from "react";
import Icon from "./Icon";

// The search field, in the style of Courier QuickView's composer: a floating glass capsule
// with a round accent button that sends. `onChange` reports every keystroke, for screens
// that filter as you type; `onSearch` fires when you press Enter or the button. `inputRef`
// reaches the field itself, for a screen that wants to focus it (Home's / shortcut).
export default function SearchBox({
  onSearch,
  onChange,
  placeholder = "Search, Ask, Task",
  inputRef,
}: {
  onSearch: (query: string) => void;
  onChange?: (query: string) => void;
  placeholder?: string;
  inputRef?: Ref<HTMLInputElement>;
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
        ref={inputRef}
        value={value}
        onChange={(e) => {
          setValue(e.currentTarget.value);
          onChange?.(e.currentTarget.value);
        }}
        placeholder={placeholder}
        aria-label="Search files"
      />
      <button type="submit" className="round send" aria-label="Search" disabled={!value.trim()}>
        <Icon name="send" />
      </button>
    </form>
  );
}
