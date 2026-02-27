import { useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: object) => void;
          renderButton: (element: HTMLElement, config: object) => void;
          prompt: () => void;
        };
      };
    };
  }
}

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

export function GoogleLoginButton() {
  const { signIn } = useAuth();
  const btnRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;

    const initGoogle = () => {
      if (!window.google || !btnRef.current) return;
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: async (response: { credential: string }) => {
          try {
            await signIn(response.credential);
          } catch (e) {
            console.error('Login failed:', e);
          }
        },
      });
      window.google.accounts.id.renderButton(btnRef.current!, {
        theme: 'outline',
        size: 'large',
        text: 'signin_with',
        locale: 'ru',
      });
    };

    if (window.google) {
      initGoogle();
    } else {
      const interval = setInterval(() => {
        if (window.google) {
          clearInterval(interval);
          initGoogle();
        }
      }, 100);
      return () => clearInterval(interval);
    }
  }, [signIn]);

  if (!GOOGLE_CLIENT_ID) {
    return (
      <div style={{ color: '#aaa', fontSize: '0.85rem', textAlign: 'center' }}>
        Google авторизация не настроена.<br />
        Добавьте VITE_GOOGLE_CLIENT_ID в .env файл.
      </div>
    );
  }

  return <div ref={btnRef} />;
}
