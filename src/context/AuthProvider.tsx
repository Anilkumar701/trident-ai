import { useEffect, useState, useMemo, useCallback, type ReactNode } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth, signInWithGoogle, logOut } from '../lib/firebase.ts';
import { AuthContext } from './AuthContext';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setLoading(false);

      if (currentUser) {
        try {
          const token = await currentUser.getIdToken();
          // Sync user to Cloud SQL database
          await fetch('/api/auth/sync-user', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              displayName: currentUser.displayName,
              photoUrl: currentUser.photoURL,
            }),
          });
        } catch (err) {
          console.error('Failed to sync user to database:', err);
        }
      }
    });

    return () => unsubscribe();
  }, []);

  const getIdToken = useCallback(async (): Promise<string | null> => {
    if (!user) return null;
    try {
      return await user.getIdToken();
    } catch {
      return null;
    }
  }, [user]);

  const handleSignIn = useCallback(async (): Promise<User> => {
    const loggedInUser = await signInWithGoogle();
    return loggedInUser;
  }, []);

  const handleSignOut = useCallback(async (): Promise<void> => {
    await logOut();
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      getIdToken,
      signIn: handleSignIn,
      signOut: handleSignOut,
    }),
    [user, loading, getIdToken, handleSignIn, handleSignOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
