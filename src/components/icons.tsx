type P = { size?: number; className?: string };
const base = (size: number) => ({
  width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
  strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true,
});

export const Back = ({ size = 24 }: P) => <svg {...base(size)}><path d="M15 5l-7 7 7 7" /></svg>;
export const Check = ({ size = 20 }: P) => <svg {...base(size)} strokeWidth={2.2}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;
export const Close = ({ size = 22 }: P) => <svg {...base(size)}><path d="M6 6l12 12M18 6L6 18" /></svg>;
export const Lock = ({ size = 22 }: P) => <svg {...base(size)}><rect x="5" y="10.5" width="14" height="10" rx="2.5" /><path d="M8 10.5V8a4 4 0 018 0v2.5" /></svg>;
export const Clock = ({ size = 44 }: P) => <svg {...base(size)} strokeWidth={1.6}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>;
export const Warn = ({ size = 40 }: P) => <svg {...base(size)} strokeWidth={1.6}><path d="M12 4l9 16H3z" /><path d="M12 10v4.5M12 17.5v.01" /></svg>;
export const Info = ({ size = 20 }: P) => <svg {...base(size)}><circle cx="12" cy="12" r="9" /><path d="M12 11v5.5M12 7.5v.01" /></svg>;
export const Play = ({ size = 18 }: P) => <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden><path d="M8 5.5v13l10.5-6.5z" fill="currentColor" /></svg>;
export const Dots = ({ size = 24 }: P) => <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden><g fill="currentColor"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></g></svg>;
export const Send = ({ size = 22 }: P) => <svg {...base(size)}><path d="M20.5 3.5L10 14M20.5 3.5l-6.5 17-4-6.5-6.5-4z" /></svg>;
export const Search = ({ size = 20 }: P) => <svg {...base(size)}><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></svg>;
export const Compass = ({ size = 24 }: P) => <svg {...base(size)}><circle cx="12" cy="12" r="9" /><path d="M15.5 8.5l-2 5-5 2 2-5z" /></svg>;
export const Chat = ({ size = 24 }: P) => <svg {...base(size)}><path d="M4.5 5.5h15v10h-9l-4 3.5v-3.5h-2z" /></svg>;
export const Star = ({ size = 24 }: P) => <svg {...base(size)}><path d="M12 3.8l2.5 5.2 5.6.7-4.1 3.9 1 5.6-5-2.7-5 2.7 1-5.6-4.1-3.9 5.6-.7z" /></svg>;
export const StarFill = ({ size = 22 }: P) => <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden><path d="M12 3.8l2.5 5.2 5.6.7-4.1 3.9 1 5.6-5-2.7-5 2.7 1-5.6-4.1-3.9 5.6-.7z" fill="currentColor" /></svg>;
export const Person = ({ size = 24 }: P) => <svg {...base(size)}><circle cx="12" cy="8.5" r="3.8" /><path d="M4.5 20c1.2-3.8 4-5.5 7.5-5.5s6.3 1.7 7.5 5.5" /></svg>;
export const Ban = ({ size = 22 }: P) => <svg {...base(size)}><circle cx="12" cy="12" r="8.5" /><path d="M6 6l12 12" /></svg>;
export const Shield = ({ size = 18 }: P) => <svg {...base(size)}><path d="M12 3.5l7 3v5c0 4.5-3 7.8-7 9-4-1.2-7-4.5-7-9v-5z" /><path d="M9 12l2 2 4-4" /></svg>;
export const Plus = ({ size = 22 }: P) => <svg {...base(size)}><path d="M12 5v14M5 12h14" /></svg>;
