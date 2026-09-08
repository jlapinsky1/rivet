/**
 * Hook for reading and saving business settings via the backend.
 * Falls back to localStorage settings if DB is not available.
 */

import { useState, useEffect, useCallback } from 'react';
import { getRepo } from '../utils/repository';
import { getSettings, DEFAULT_SETTINGS, saveSettings as saveLocalSettings } from '../utils/storage';

export function useSettings() {
  const [settings, setSettings] = useState<any>(getSettings());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const repo = await getRepo();
        const dbSettings = await repo.getBusinessSettings();
        if (dbSettings && Object.keys(dbSettings).length > 0) {
          setSettings({ ...DEFAULT_SETTINGS, ...dbSettings });
        }
      } catch {
        // Use localStorage fallback — already set as default
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = useCallback(async (updates: Record<string, any>) => {
    const merged = { ...settings, ...updates };
    setSettings(merged);
    setSaving(true);
    setError(null);

    try {
      const repo = await getRepo();
      if (repo.saveBusinessSettings) {
        await repo.saveBusinessSettings(merged);
      }
      // Also update localStorage as fallback
      saveLocalSettings(merged);
    } catch (err: any) {
      setError(err.message || 'Failed to save settings');
      // Still save to localStorage
      saveLocalSettings(merged);
    } finally {
      setSaving(false);
    }
  }, [settings]);

  return { settings, loading, saving, error, save };
}
