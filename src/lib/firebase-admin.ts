import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const app = getApps().length > 0 ? getApps()[0] : initializeApp({
  projectId: process.env.FIREBASE_PROJECT_ID || 'spiritual-modem-2bcxw',
});

export const adminAuth = getAuth(app);
