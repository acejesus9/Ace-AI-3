import React from 'react';
import { LogIn } from 'lucide-react';

interface SignInBannerProps {
  onSignIn: () => void;
}

export function SignInBanner({ onSignIn }: SignInBannerProps) {
  return (
    <div className="bg-blue-500/10 border border-blue-500/20 text-blue-400 px-4 py-2 flex items-center justify-between">
      <p className="text-sm">Sign in to save your chats and access them from any device</p>
      <button
        onClick={onSignIn}
        className="flex items-center gap-2 px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded-md transition-colors text-sm"
      >
        <LogIn size={16} />
        Sign In
      </button>
    </div>
  );
}