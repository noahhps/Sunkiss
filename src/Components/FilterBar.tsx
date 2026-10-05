import Icon from "./Icon";

export type Show = "all" | "images" | "videos" | "design";
export type Sort = "newest" | "oldest" | "name" | "largest";
export type Size = "s" | "m" | "l";

export const SHOWS: readonly Show[] = ["all", "images", "videos", "design"];
export const SORTS: readonly Sort[] = ["newest", "oldest", "name", "largest"];
export const SIZES: readonly Size[] = ["s", "m", "l"];

export const SHOW_LABELS: Record<Show, string> = { all: "All", images: "Images", videos: "Videos", design: "Design files" };
const SORT_LABELS: Record<Sort, string> = { newest: "Newest", oldest: "Oldest", name: "A–Z", largest: "Largest" };
const SIZE_LABELS: Record<Size, string> = { s: "S", m: "M", l: "L" };

// Above the grid: what to show (everything, images or videos; only starred files), in what
// order, and how big the prints are. Each choice is remembered (Home.tsx). The count at the
// end says how many files are left once they've all been applied.
export default function FilterBar({
  show,
  onShow,
  sort,
  onSort,
  size,
  onSize,
  starredOnly,
  onStarredOnly,
  count,
}: {
  show: Show;
  onShow: (show: Show) => void;
  sort: Sort;
  onSort: (sort: Sort) => void;
  size: Size;
  onSize: (size: Size) => void;
  starredOnly: boolean;
  onStarredOnly: (only: boolean) => void;
  count: number;
}) {
  return (
    <div className="filters" role="toolbar" aria-label="Filter and sort the files">
      <Segment label="Show" options={SHOWS} labels={SHOW_LABELS} value={show} onChange={onShow} />
      <button
        type="button"
        className="chip"
        aria-pressed={starredOnly}
        title={starredOnly ? "Show every file" : "Only starred files"}
        onClick={() => onStarredOnly(!starredOnly)}
      >
        <Icon name="star" />
        Starred
      </button>
      <Segment label="Sort by" options={SORTS} labels={SORT_LABELS} value={sort} onChange={onSort} />
      <Segment label="Thumbnail size" options={SIZES} labels={SIZE_LABELS} value={size} onChange={onSize} className="sizes" />
      <span className="filters-count">
        {count} {count === 1 ? "file" : "files"}
      </span>
    </div>
  );
}

// A row of choices in one pill, one of them chosen.
function Segment<T extends string>({
  label,
  options,
  labels,
  value,
  onChange,
  className,
}: {
  label: string;
  options: readonly T[];
  labels: Record<T, string>;
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div className={className ? `segment ${className}` : "segment"} role="group" aria-label={label}>
      {options.map((option) => (
        <button key={option} type="button" aria-pressed={value === option} onClick={() => onChange(option)}>
          {labels[option]}
        </button>
      ))}
    </div>
  );
}
