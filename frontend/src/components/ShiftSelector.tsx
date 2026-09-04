interface ShiftSelectorProps {
  value: string;
  onChange: (value: string) => void;
}

export default function ShiftSelector({ value, onChange }: ShiftSelectorProps) {
  return (
    <div className="form-group">
      <label htmlFor="shift-select">Shift</label>
      <select
        id="shift-select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="day">Day</option>
        <option value="evening">Evening</option>
        <option value="night">Night</option>
      </select>
    </div>
  );
}
