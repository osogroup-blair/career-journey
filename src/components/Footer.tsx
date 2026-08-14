import { Link } from 'react-router-dom';

export default function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-white px-4 py-4 text-center text-xs text-slate-400 space-x-4">
      <Link to="/terms" className="hover:text-slate-600 hover:underline">Terms</Link>
      <Link to="/privacy" className="hover:text-slate-600 hover:underline">Privacy</Link>
      <Link to="/refunds" className="hover:text-slate-600 hover:underline">Refunds</Link>
    </footer>
  );
}
