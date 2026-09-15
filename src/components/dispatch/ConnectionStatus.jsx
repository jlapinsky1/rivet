import React, { useState, useEffect } from 'react';

export default function ConnectionStatus() {
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);

  useEffect(() => {
    function handleOnline()  { setOnline(true); }
    function handleOffline() { setOnline(false); }
    window.addEventListener('online',  handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online',  handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (online) return null;

  return (
    <div className="bg-amber-500 text-amber-950 text-sm font-medium px-4 py-2 text-center">
      No connection - changes will sync when reconnected
    </div>
  );
}
