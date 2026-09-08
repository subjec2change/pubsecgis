const VIEWS = [
  { id: 'officer', label: 'Officer', icon: '👮' },
  { id: 'broadcast', label: 'Broadcast', icon: '📡' },
] as const;

type ViewId = typeof VIEWS[number]['id'];

interface ViewSwitcherProps {
  currentView: ViewId;
  onSwitch: (view: ViewId) => void;
}

export default function ViewSwitcher({ currentView, onSwitch }: ViewSwitcherProps) {
  return (
    <div className="view-switcher">
      {VIEWS.map((v) => (
        <button
          key={v.id}
          type="button"
          className={`view-switcher-btn${currentView === v.id ? ' active' : ''}`}
          onClick={() => onSwitch(v.id)}
        >
          <span className="view-switcher-icon">{v.icon}</span>
          <span>{v.label}</span>
        </button>
      ))}
    </div>
  );
}
