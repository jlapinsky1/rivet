// @vitest-environment jsdom

/**
 * Dispatch frontend unit tests - clipboard utility behaviour.
 *
 * These test the extracted copyToClipboard function without requiring
 * React Testing Library or a DOM renderer.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { copyToClipboard } from '../clipboard';

const FULL_ADDRESS = '123 Main St, Springfield, IL 62701';

describe('copyToClipboard (dispatch Copy Address utility)', () => {
  let originalClipboard;

  beforeEach(() => {
    originalClipboard = navigator.clipboard;
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value:        originalClipboard,
      configurable: true,
      writable:     true,
    });
    vi.restoreAllMocks();
  });

  it('1. calls navigator.clipboard.writeText with the complete address string', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value:        { writeText },
      configurable: true,
    });

    const result = await copyToClipboard(FULL_ADDRESS);

    expect(writeText).toHaveBeenCalledWith(FULL_ADDRESS);
    expect(result).toBe(true);
  });

  it('2. returns true on successful copy (caller shows confirmation)', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value:        { writeText },
      configurable: true,
    });

    const result = await copyToClipboard(FULL_ADDRESS);

    expect(result).toBe(true);
  });

  it('3. falls back to execCommand when navigator.clipboard is unavailable', async () => {
    // Remove clipboard API
    Object.defineProperty(navigator, 'clipboard', {
      value:        undefined,
      configurable: true,
    });

    // jsdom does not define execCommand - stub it so vi.spyOn can wrap it
    document.execCommand = () => true;
    const execCommandSpy = vi.spyOn(document, 'execCommand').mockReturnValue(true);

    const result = await copyToClipboard(FULL_ADDRESS);

    expect(execCommandSpy).toHaveBeenCalledWith('copy');
    expect(result).toBe(true);
  });

  it('3b. falls back to execCommand when clipboard.writeText throws', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('Permission denied'));
    Object.defineProperty(navigator, 'clipboard', {
      value:        { writeText },
      configurable: true,
    });

    // jsdom does not define execCommand - stub it so vi.spyOn can wrap it
    document.execCommand = () => true;
    const execCommandSpy = vi.spyOn(document, 'execCommand').mockReturnValue(true);

    const result = await copyToClipboard(FULL_ADDRESS);

    expect(execCommandSpy).toHaveBeenCalledWith('copy');
    expect(result).toBe(true);
  });

  it('4. copyToClipboard does not call window.open or construct any map URL', async () => {
    const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value:        { writeText },
      configurable: true,
    });

    await copyToClipboard(FULL_ADDRESS);

    expect(windowOpenSpy).not.toHaveBeenCalled();
    // Verify the text passed to clipboard contains no map URL fragment
    const copiedText = writeText.mock.calls[0][0];
    expect(copiedText).not.toMatch(/maps\.google|apple\.com\/maps|waze\.com/i);
    expect(copiedText).toBe(FULL_ADDRESS);
  });
});
