type P = { className?: string };
const base = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
const I = (d: React.ReactNode) => {
  const C = (p: P) => (
    <svg {...base} {...p}>
      {d}
    </svg>
  );
  return C;
};
export const IBus = I(<><rect x="4" y="3" width="16" height="15" rx="3" /><path d="M4 11h16M8 18v2.5M16 18v2.5M7.5 14.5h.01M16.5 14.5h.01" /></>);
export const IPhone = I(<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />);
export const IClock = I(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>);
export const IPlay = I(<path d="M7 4v16l13-8z" fill="currentColor" />);
export const IPause = I(<path d="M8 4v16M16 4v16" strokeWidth="3" />);
export const IPin = I(<><path d="M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12Z" /><circle cx="12" cy="9" r="2.5" /></>);
