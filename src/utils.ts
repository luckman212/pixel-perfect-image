/**
 * Helper to find an image element from an event target
 * @param target - The event target or HTML element
 * @returns The found image element or null
 */
export function findImageElement(target: EventTarget | null): HTMLImageElement | null {
	if (!target || !(target instanceof HTMLElement)) return null;
	
	// If target is already an image, return it
	if (target instanceof HTMLImageElement) return target;
	
	// Check if the target or its ancestors are related to images
	const isImageContext = target.matches('.image-container, .image-embed, img, a.internal-embed[src*=".png"], a.internal-embed[src*=".jpg"], a.internal-embed[src*=".jpeg"], a.internal-embed[src*=".gif"], a.internal-embed[src*=".webp"], a.internal-embed[src*=".svg"]'); 
	
	// Only search for img elements if we're in an image context
	if (isImageContext) {
		return target.querySelector('img');
	}
	
	return null;
}

/**
 * Logs error messages with timestamp.
 * @param args - Arguments to log
 */
export function errorLog(...args: any[]) {
	const timestamp = new Date().toTimeString().split(' ')[0];
	console.error(`${timestamp}`, ...args);
}