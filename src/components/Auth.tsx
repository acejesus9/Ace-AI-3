import React, { useState } from 'react';
import { auth } from '../lib/firebase';
import { 
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  GoogleAuthProvider,
  signInWithPopup
} from 'firebase/auth';
import { LogIn, Mail, Lock, Loader2, Chrome, User } from 'lucide-react';
import { Chat } from '../types';
import { transferGuestChats } from '../lib/storage';

interface AuthProps {
  onSuccess: () => void;
  guestChats: Chat[];
}

export function Auth({ onSuccess, guestChats }: AuthProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      let user;
      if (mode === 'signup') {
        const result = await createUserWithEmailAndPassword(auth, email, password);
        user = result.user;
        await updateProfile(user, {
          displayName: `${firstName} ${lastName}`
        });
      } else {
        const result = await signInWithEmailAndPassword(auth, email, password);
        user = result.user;
      }

      // Transfer guest chats and handle any errors
      try {
        await transferGuestChats(guestChats);
      } catch (transferError) {
        console.error('Error transferring guest chats:', transferError);
        // Continue with sign in even if transfer fails
      }

      onSuccess();
    } catch (err: any) {
      if (err.code === 'auth/email-already-in-use') {
        setError('This email is already registered. Please sign in instead.');
      } else if (err.code === 'auth/invalid-credential') {
        setError('Invalid email or password. Please try again.');
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      await transferGuestChats(guestChats);
      onSuccess();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const validateForm = () => {
    if (mode === 'signup') {
      return email.includes('@') && password.length >= 6 && firstName.trim() && lastName.trim();
    }
    return email.includes('@') && password.length >= 6;
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-black p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img src="/ace-icon.svg" alt="Ace AI" className="w-16 h-16 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white">Welcome to Ace AI</h2>
          <p className="text-gray-400 mt-2">Sign in to start chatting</p>
        </div>

        <div className="mb-6">
          <button
            onClick={handleGoogleSignIn}
            className="w-full flex items-center justify-center gap-2 bg-white hover:bg-gray-100 text-gray-900 py-2 px-4 rounded-lg transition-colors"
          >
            <Chrome size={20} />
            Continue with Google
          </button>
        </div>

        <div className="relative mb-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-800"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-black text-gray-400">Or continue with email</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'signup' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  First Name
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-gray-900 border border-gray-800 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    placeholder="John"
                    required={mode === 'signup'}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Last Name
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-gray-900 border border-gray-800 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    placeholder="Doe"
                    required={mode === 'signup'}
                  />
                </div>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Email
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-gray-900 border border-gray-800 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                placeholder="Enter your email"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-gray-900 border border-gray-800 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                placeholder="Enter your password"
                required
                minLength={6}
              />
            </div>
          </div>

          {error && (
            <div className="text-red-400 text-sm bg-red-400/10 p-3 rounded-lg">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !validateForm()}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <Loader2 className="animate-spin" size={20} />
            ) : (
              <LogIn size={20} />
            )}
            {mode === 'signin' ? 'Sign In' : 'Sign Up'}
          </button>

          <div className="text-center text-sm text-gray-400">
            {mode === 'signin' ? (
              <>
                Don't have an account?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setMode('signup');
                    setError(null);
                  }}
                  className="text-blue-400 hover:text-blue-300"
                >
                  Sign Up
                </button>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setMode('signin');
                    setError(null);
                  }}
                  className="text-blue-400 hover:text-blue-300"
                >
                  Sign In
                </button>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}