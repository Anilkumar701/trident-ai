import { useState } from 'react';
import { useAuth } from '../context/useAuth';
import { LogIn, LogOut, Database, UserCheck, Loader2 } from 'lucide-react';

export function UserAuthButton() {
  const { user, loading, signIn, signOut } = useAuth();
  const [inProgress, setInProgress] = useState(false);

  const handleSignIn = async () => {
    try {
      setInProgress(true);
      await signIn();
    } catch (err) {
      console.warn('Sign-in cancelled or failed:', err);
    } finally {
      setInProgress(false);
    }
  };

  const handleSignOut = async () => {
    try {
      setInProgress(true);
      await signOut();
    } catch (err) {
      console.warn('Sign-out failed:', err);
    } finally {
      setInProgress(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900/80 px-2.5 py-1.5 text-xs text-slate-400 font-mono">
        <Loader2 className="h-3 w-3 animate-spin text-cyan-400" />
        <span className="hidden sm:inline">Auth...</span>
      </div>
    );
  }

  if (user) {
    return (
      <div className="flex items-center gap-2">
        <div className="hidden md:flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-950/40 px-2.5 py-1.5 text-xs text-emerald-300 font-mono">
          <Database className="h-3 w-3 text-emerald-400" />
          <span>Cloud SQL Sync</span>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/80 px-2.5 py-1 text-xs text-slate-200">
          {user.photoURL ? (
            <img
              src={user.photoURL}
              alt={user.displayName || 'User'}
              className="h-5 w-5 rounded-full object-cover border border-cyan-400/40"
            />
          ) : (
            <UserCheck className="h-4 w-4 text-cyan-400" />
          )}
          <span className="hidden sm:inline font-mono text-[11px] max-w-[100px] truncate text-slate-300">
            {user.displayName?.split(' ')[0] || user.email?.split('@')[0] || 'Operator'}
          </span>
          <button
            type="button"
            onClick={handleSignOut}
            disabled={inProgress}
            title="Sign out"
            className="ml-1 text-slate-400 hover:text-rose-400 transition"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div className="hidden md:flex items-center gap-1.5 rounded-lg border border-cyan-500/30 bg-cyan-950/30 px-2.5 py-1.5 text-xs text-cyan-300 font-mono">
        <Database className="h-3 w-3 text-cyan-400" />
        <span>asia-southeast1</span>
      </div>
      <button
        type="button"
        onClick={handleSignIn}
        disabled={inProgress}
        className="flex items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-950/60 px-3 py-1.5 font-mono text-xs font-semibold text-cyan-300 hover:bg-cyan-900/60 transition shadow-sm"
      >
        {inProgress ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <LogIn className="h-3.5 w-3.5" />
        )}
        <span>Sign In</span>
      </button>
    </div>
  );
}
