/**
 * Checks if the current platform is macOS.
 */
export function isMacPlatform(): boolean {
    if ('userAgentData' in navigator) {
        return (navigator as any).userAgentData.platform === 'macOS';
    }
    return navigator.platform.toLowerCase().includes('mac');
}
