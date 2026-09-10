import type { SlotValue } from "../lib/types";

interface SlotBoxProps {
  value: SlotValue;
}

export default function SlotBox({ value }: SlotBoxProps) {
  if (value === 1) {
    return (
      <div aria-hidden="true" className="slot-box done">
        <svg width="18" height="16" viewBox="0 0 20 18" fill="none">
          <path
            d="M3 9L8 14L17 4"
            stroke="#fff"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    );
  }
  if (value === 2) {
    return (
      <div aria-hidden="true" className="slot-box locked" title="Terkunci">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path
            d="M3 7H11"
            stroke="#8A8375"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </svg>
      </div>
    );
  }
  return <div aria-hidden="true" className="slot-box" />;
}
