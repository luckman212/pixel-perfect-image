import { debounce, Menu, MarkdownView, Notice, Plugin, TFile, normalizePath, Platform, FileSystemAdapter, Modal, App } from 'obsidian';
import { PixelPerfectImageSettings, DEFAULT_SETTINGS, PixelPerfectImageSettingTab, getExternalEditorPath } from './settings';
import { join } from 'path';
import { exec } from "child_process";

declare module 'obsidian' {
	interface App {
		showInFolder(path: string): void;
		openWithDefaultApp(path: string): void;
	}
}

/** Fixed percentages available for image resizing */
const RESIZE_PERCENTAGES = [100, 50, 25] as const;
/** Regular expression to match Obsidian image wikilinks: ![[image.png]] */
const WIKILINK_IMAGE_REGEX = /(!\[\[)([^\]]+)(\]\])/g;
/** Regular expressions to match both image link styles */
const MARKDOWN_IMAGE_REGEX = /!\[([^\]]*)\]\(([^)]+)\)/g;

interface ImageLink {
	path: string;
	hash: string;
	params: string[];
	isWikiStyle: boolean;
}

export default class PixelPerfectImage extends Plugin {
	settings: PixelPerfectImageSettings;
	/** Cache to store image dimensions to avoid repeated file reads */
	private dimensionCache = new Map<string, { width: number; height: number }>();
	private isModifierKeyHeld = false;
	private wheelEventCleanup: (() => void) | null = null;
	/** Debounced version of handleImageWheel to prevent excessive processing on trackpads */
	private debouncedHandleImageWheel: (ev: WheelEvent, img: HTMLImageElement) => void;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new PixelPerfectImageSettingTab(this.app, this));
		this.registerImageContextMenu();
		
		// Initialize the debounced handler with current settings
		this.updateDebouncedHandler();
		
		// Add click handler for CMD/CTRL + click
		this.registerDomEvent(document, 'click', this.handleImageClick.bind(this));
		
		// Register mousewheel zoom events
		this.registerEvent(
			this.app.workspace.on("layout-change", () => this.registerWheelEvents(window))
		);
		this.registerWheelEvents(window);

		this.debugLog('Plugin loaded');
	}

	onunload() {
		// Reset state
		this.isModifierKeyHeld = false;
		this.dimensionCache.clear();
	}

	private setModifierKeyState(isHeld: boolean) {
		this.isModifierKeyHeld = isHeld;
		this.debugLog(`Modifier key ${isHeld ? 'pressed' : 'released'}`);
	}

	private registerWheelEvents(currentWindow: Window) {
		// If already registered previously, clean it up first
		if (this.wheelEventCleanup) {
			this.wheelEventCleanup();
			this.wheelEventCleanup = null;
		}

		const doc = currentWindow.document;

		// Handle modifier key press
		const keydownHandler = (evt: KeyboardEvent) => {
			if (this.isModifierKeyMatch(evt)) {
				this.setModifierKeyState(true);
			}
		};

		// Handle modifier key release
		const keyupHandler = (evt: KeyboardEvent) => {
			if (this.isModifierKeyMatch(evt)) {
				this.setModifierKeyState(false);
			}
		};

		// Handle window blur to reset state
		const blurHandler = () => {
			if (this.isModifierKeyHeld) {
				this.setModifierKeyState(false);
			}
		};

		// Create bound event handler for cleanup
		const wheelHandler = (ev: WheelEvent) => {
			// If zoom is not enabled or modifier not held, let default scroll happen
			if (!this.settings.enableWheelZoom || !this.isModifierKeyHeld) return;

			// Verify key is still held (handles Alt+Tab cases)
			if (!this.isModifierKeyStillHeld(ev)) {
				this.setModifierKeyState(false);
				return;
			}

			const img = this.findImageElement(ev.target);
			if (!img) return;

			// Prevent default immediately when we'll handle the zoom
			ev.preventDefault();
			
			// Use the debounced handler instead of direct call
			this.debouncedHandleImageWheel(ev, img);
		};

		// Register all event handlers with non-passive wheel listener
		this.registerDomEvent(doc, "keydown", keydownHandler);
		this.registerDomEvent(doc, "keyup", keyupHandler);
		this.registerDomEvent(window, "blur", blurHandler);
		doc.addEventListener("wheel", wheelHandler, { passive: false });

		// Store cleanup function
		this.wheelEventCleanup = () => {
			doc.removeEventListener("wheel", wheelHandler);
			this.debugLog('Wheel events cleaned up');
		};
	}

	private isModifierKeyMatch(evt: KeyboardEvent): boolean {
		const key = this.settings.wheelModifierKey.toLowerCase();
		const eventKey = evt.key.toLowerCase();
		
		// Handle different key representations
		switch (key) {
			case 'alt':
				return eventKey === 'alt' || eventKey === 'option';
			case 'ctrl':
				return eventKey === 'ctrl' || eventKey === 'control';
			case 'shift':
				return eventKey === 'shift';
			default:
				return false;
		}
	}

	private isModifierKeyStillHeld(evt: WheelEvent): boolean {
		switch (this.settings.wheelModifierKey.toLowerCase()) {
			case 'alt': return evt.altKey;
			case 'ctrl': return evt.ctrlKey;
			case 'shift': return evt.shiftKey;
			default: return false;
		}
	}

	private async handleImageWheel(evt: WheelEvent, target: HTMLImageElement) {
		if (!this.settings.enableWheelZoom) return;
		
		const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!markdownView?.file) return;

		const result = await this.getImageFileWithErrorHandling(target);
		if (!result) return;

		const { width } = await this.readImageDimensions(result.imgFile);
		const customWidth = this.getCurrentImageWidth(target, result.activeFile, result.imgFile);
		
		// Use the custom width if set, otherwise use original width
		const currentWidth = customWidth ?? width;
		
		// Calculate scale factor based on delta magnitude (smaller deltas = smaller changes)
		const deltaScale = Math.min(1.0, Math.abs(evt.deltaY) / 10);
		
		// Apply the scale factor to the base step size
		const stepSize = Math.max(1, Math.round(currentWidth * (this.settings.wheelZoomPercentage / 100) * deltaScale));
		
		// Adjust width based on scroll direction
		const scrollingUp = evt.deltaY < 0;
		const shouldIncrease = this.settings.invertScrollDirection ? !scrollingUp : scrollingUp;
		const newWidth = shouldIncrease
			? currentWidth + stepSize
			: Math.max(1, currentWidth - stepSize);

		// Only update if the width has actually changed
		if (newWidth !== currentWidth) {
			await this.updateImageLinkWidth(result.imgFile, newWidth);
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		// Update the debounced handler when settings are loaded
		this.updateDebouncedHandler();
	}

	async saveSettings() {
		await this.saveData(this.settings);
		// Update the debounced handler when settings are saved
		this.updateDebouncedHandler();
	}

	// Update the debounced handler when settings change
	private updateDebouncedHandler() {
		this.debouncedHandleImageWheel = debounce(
			async (ev: WheelEvent, img: HTMLImageElement) => {
				try {
					await this.handleImageWheel(ev, img);
				} catch (error) {
					this.errorLog('Error handling wheel event:', error);
					new Notice('Failed to resize image');
				}
			}, 
			this.settings.wheelZoomDebounceTime,
			true // Leading edge execution to feel more responsive
		);
	}

	// Context Menu Handlers
	// ----------------------

	/**
	 * Registers a context menu handler for images in the editor.
	 * The menu provides options to view image dimensions and resize the image.
	 */
	private registerImageContextMenu(): void {
		// Add support for both desktop right-click and mobile long-press
		this.registerDomEvent(document, 'contextmenu', this.handleContextMenu.bind(this));
		
		// Add mobile long-press support
		let longPressTimer: NodeJS.Timeout;
		let isLongPress = false;
		
		this.registerDomEvent(document, 'touchstart', (ev: TouchEvent) => {
			// Ignore multi-touch events to avoid interfering with pinch zooming
			if (ev.touches.length > 1) return;
			
			const img = this.findImageElement(ev.target);
			if (!img) return;
			
			isLongPress = false;
			longPressTimer = setTimeout(() => {
				isLongPress = true;
				this.handleContextMenu(ev);
			}, 500); // 500ms long press
		});
		
		this.registerDomEvent(document, 'touchend', () => {
			clearTimeout(longPressTimer);
		});
		
		this.registerDomEvent(document, 'touchmove', () => {
			clearTimeout(longPressTimer);
		});
	}

	private async handleContextMenu(ev: MouseEvent | TouchEvent) {
		// For touch events, ignore multi-touch to prevent triggering during pinch zoom
		if ('touches' in ev && ev.touches.length > 1) return;
		
		const img = this.findImageElement(ev.target);
		if (!img) return;

		// Prevent default context menu
		ev.preventDefault();

		const menu = new Menu();
		await this.addDimensionsMenuItem(menu, img);
		await this.addResizeMenuItems(menu, ev);
		
		// Only add file operations on desktop
		if (!Platform.isMobile) {
			menu.addSeparator();
			this.addFileOperationMenuItems(menu, img);
		}

		// Position menu at event coordinates
		const position = {
			x: ev instanceof MouseEvent ? ev.pageX : ev.touches[0].pageX,
			y: ev instanceof MouseEvent ? ev.pageY : ev.touches[0].pageY
		};
		menu.showAtPosition(position);
	}

	/**
	 * Helper to find an image element from an event target
	 * @param target - The event target or HTML element
	 * @returns The found image element or null
	 */
	private findImageElement(target: EventTarget | null): HTMLImageElement | null {
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
	 * Helper to create a disabled menu item for displaying information
	 * @param menu - The menu to add the item to
	 * @param title - The title of the menu item
	 * @param icon - The icon to use
	 */
	private addInfoMenuItem(menu: Menu, title: string, icon: string): void {
		menu.addItem((item) => {
			item.setTitle(title)
				.setIcon(icon)
				.setDisabled(true);
		});
	}

	/**
	 * Adds an informational menu item showing the actual dimensions of the image.
	 * Reads dimensions from the image file in the vault.
	 * @param menu - The context menu to add the item to
	 * @param img - The HTML image element that was right-clicked
	 */
	private async addDimensionsMenuItem(menu: Menu, img: HTMLImageElement): Promise<void> {
		// Only add file info if the setting is enabled
		if (!this.settings.showFileInfo) return;

		try {
			const result = await this.getImageFileWithErrorHandling(img);
			if (!result) return;

			const { width, height } = await this.readImageDimensions(result.imgFile);

			// Get current scale if set
			const currentScale = this.calculateImageScale(img, result.activeFile, result.imgFile, width);
			const scaleText = currentScale !== null ? ` @ ${currentScale}%` : '';

			// Add filename menu item with scale
			this.addInfoMenuItem(menu, `${result.imgFile.name}${scaleText}`, "image-file");

			// Add dimensions menu item
			this.addInfoMenuItem(menu, `${width} × ${height} px`, "info");
		} catch (error) {
			this.errorLog('Could not read dimensions:', error);
			new Notice("Could not read image dimensions");
		}
	}

	/**
	 * Calculates the current scale of an image as a percentage
	 * @param img - The HTML image element
	 * @param activeFile - The active file
	 * @param imageFile - The image file
	 * @param actualWidth - The actual width of the image in pixels
	 * @returns The current scale as a percentage, or null if no custom width is set
	 */
	private calculateImageScale(img: HTMLImageElement, activeFile: TFile, imageFile: TFile, actualWidth: number): number | null {
		const customWidth = this.getCurrentImageWidth(img, activeFile, imageFile);
		if (customWidth === null) return null;
		return Math.round((customWidth / actualWidth) * 100);
	}

	/**
	 * Gets the current custom width of an image if set in the link
	 * @param img - The HTML image element
	 * @param activeFile - The currently active file
	 * @param imageFile - The image file
	 * @returns The custom width if set, otherwise null
	 */
	private getCurrentImageWidth(img: HTMLImageElement, activeFile: TFile, imageFile: TFile): number | null {
		const editor = this.app.workspace.getActiveViewOfType(MarkdownView)?.editor;
		if (!editor) return null;

		const docText = editor.getValue();
		let customWidth: number | null = null;

		// Helper to parse width from parameters
		const parseWidth = (pipeParams: string[]): number | null => {
			if (pipeParams.length === 0) return null;
			
			// Check the last parameter for a number (width)
			const lastParam = pipeParams[pipeParams.length - 1];
			const width = parseInt(lastParam);
			return isNaN(width) ? null : width;
		};

		// Check wiki-style links using matchAll
		for (const match of docText.matchAll(WIKILINK_IMAGE_REGEX)) {
			const [_, _opening, linkInner] = match;
			
			// Handle subpath components (e.g., #heading)
			let [linkWithoutHash] = linkInner.split("#", 1);

			// Split link path and parameters
			let [linkPath, ...pipeParams] = linkWithoutHash.split("|");

			const resolvedFile = this.app.metadataCache.getFirstLinkpathDest(linkPath, activeFile.path);
			if (resolvedFile?.path === imageFile.path) {
				const width = parseWidth(pipeParams);
				if (width !== null) {
					customWidth = width;
					break;  // Found the width, no need to continue
				}
			}
		}

		// If not found in wiki links, check Markdown-style links
		if (customWidth === null) {
			for (const match of docText.matchAll(MARKDOWN_IMAGE_REGEX)) {
				const [_, description, linkPath] = match;
				
				// Split description and parameters
				let [desc, ...pipeParams] = description.split("|");
				
				const resolvedFile = this.app.metadataCache.getFirstLinkpathDest(linkPath, activeFile.path);
				if (resolvedFile?.path === imageFile.path) {
					const width = parseWidth(pipeParams);
					if (width !== null) {
						customWidth = width;
						break;  // Found the width, no need to continue
					}
				}
			}
		}

		return customWidth;
	}

	/**
	 * Helper to safely get the image file with common error handling
	 * @param img - The HTML image element
	 * @returns Object containing the active file and image file, or null if either cannot be found
	 */
	private async getImageFileWithErrorHandling(img: HTMLImageElement): Promise<{ activeFile: TFile; imgFile: TFile } | null> {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			return null;
		}

		const imgFile = this.getFileForImage(img, activeFile);
		if (!imgFile) {
			// Only show notification if we have a valid image element but can't find its file
			// This prevents errors when plugin is triggered on non-image elements
			if (img.naturalWidth > 0 || img.src) {
				new Notice('Could not locate image file');
			}
			return null;
		}

		return { activeFile, imgFile };
	}

	/**
	 * Helper to wrap menu item click handlers with common error handling
	 * @param action - The action to perform
	 * @param errorMessage - The message to show on error
	 * @returns An async function that can be used as a click handler
	 */
	private createMenuClickHandler(action: () => Promise<void>, errorMessage: string): () => Promise<void> {
		return async () => {
			try {
				await action();
			} catch (error) {
				this.errorLog(errorMessage, error);
				new Notice(errorMessage);
			}
		};
	}

	/**
	 * Helper to create a menu item with consistent patterns
	 * @param menu - The menu to add the item to
	 * @param title - The title of the menu item
	 * @param icon - The icon to use
	 * @param action - The action to perform when clicked
	 * @param errorMessage - The error message to show if the action fails
	 * @param disabled - Whether the item should be disabled
	 */
	private addMenuItem(
		menu: Menu,
		title: string,
		icon: string,
		action: () => Promise<void>,
		errorMessage: string,
		disabled = false
	): void {
		menu.addItem((item) => {
			item.setTitle(title)
				.setIcon(icon)
				.setDisabled(disabled)
				.onClick(this.createMenuClickHandler(action, errorMessage));
		});
	}

	/**
	 * Adds resize percentage options to the context menu.
	 * Each option will resize the image to the specified percentage of its original size.
	 * @param menu - The context menu to add items to
	 * @param ev - The original mouse event
	 */
	private async addResizeMenuItems(menu: Menu, ev: MouseEvent | TouchEvent): Promise<void> {
		const img = this.findImageElement(ev.target);
		if (!img) return;

		// Add copy to clipboard option first
		this.addMenuItem(
			menu,
			'Copy Image',
			'copy',
			async () => {
				await this.copyImageToClipboard(img);
				new Notice('Image copied to clipboard');
			},
			'Failed to copy image to clipboard'
		);

		// Add copy local path option
		this.addMenuItem(
			menu,
			'Copy Local Path',
			'link',
			async () => {
				const result = await this.getImageFileWithErrorHandling(img);
				if (!result) return;
				
				// @ts-ignore - Using Electron's __dirname global
				const vaultPath = (this.app.vault.adapter as any).basePath;
				const fullPath = join(vaultPath, normalizePath(result.imgFile.path));
				await navigator.clipboard.writeText(fullPath);
				new Notice('File path copied to clipboard');
			},
			'Failed to copy file path'
		);

		// Add separator before resize options
		menu.addSeparator();

		// Get current scale and file info
		const result = await this.getImageFileWithErrorHandling(img);
		let currentScale: number | null = null;
		let currentWidth: number | null = null;
		
		if (result) {
			const { width } = await this.readImageDimensions(result.imgFile);
			currentWidth = this.getCurrentImageWidth(img, result.activeFile, result.imgFile);
			currentScale = currentWidth !== null ? Math.round((currentWidth / width) * 100) : null;
			this.debugLog('Current image scale:', currentScale, 'width:', currentWidth);
		}

		// Add percentage resize options if enabled in settings
		if (this.settings.showPercentageResize) {
			RESIZE_PERCENTAGES.forEach(percentage => {
				this.addMenuItem(
					menu,
					`Resize to ${percentage}%`,
					'image',
					async () => await this.resizeImage(img, percentage),
					`Failed to resize image to ${percentage}%`,
					currentScale === percentage
				);
			});
		}

		// Add custom resize options if set
		if (this.settings.customResizeWidths.length > 0) {
			this.settings.customResizeWidths.forEach(width => {
				this.addMenuItem(
					menu,
					`Resize to ${width}px`,
					'image',
					async () => await this.resizeImage(img, width, true),
					`Failed to resize image to ${width}px`,
					currentWidth === width
				);
			});
		}

		// Add option to remove custom size if one is set
		if (result && currentScale !== null) {
			this.addMenuItem(
				menu,
				'Remove Custom Size',
				'reset',
				async () => {
					await this.removeImageWidth(result.imgFile);
					new Notice('Removed custom size from image');
				},
				'Failed to remove custom size from image'
			);
		}
	}

	/**
	 * Adds file operation menu items like Show in Finder/Explorer and Open in Default App
	 */
	private addFileOperationMenuItems(menu: Menu, target: HTMLImageElement): void {
		// Skip all desktop-only operations on mobile
		if (Platform.isMobile) return;

		const isMac = Platform.isMacOS;

		// Add show in system explorer option
		if (this.settings.showShowInFileExplorer) {
			this.addMenuItem(
				menu,
				isMac ? 'Show in Finder' : 'Show in Explorer',
				'folder-open',
				async () => {
					const result = await this.getImageFileWithErrorHandling(target);
					if (!result) return;
					await this.showInSystemExplorer(result.imgFile);
				},
				'Failed to open system explorer'
			);
		}

		// Add rename option
		if (this.settings.showRenameOption) {
			this.addMenuItem(
				menu,
				'Rename Image',
				'pencil',
				async () => {
					const result = await this.getImageFileWithErrorHandling(target);
					if (!result) return;
					await this.renameImage(result.imgFile);
				},
				'Failed to rename image'
			);
		}

		// Add separator if any file operation was added
		if (this.settings.showRenameOption || this.settings.showShowInFileExplorer) {
			menu.addSeparator();
		}

		// Add open in new tab option
		if (this.settings.showOpenInNewTab) {
			this.addMenuItem(
				menu,
				'Open in New Tab',
				'link-2',
				async () => {
					const result = await this.getImageFileWithErrorHandling(target);
					if (!result) return;
					await this.app.workspace.openLinkText(result.imgFile.path, '', true);
				},
				'Failed to open image in new tab'
			);
		}

		// Add open in default app option
		if (this.settings.showOpenInDefaultApp) {
			this.addMenuItem(
				menu,
				'Open in Default app',
				'image',
				async () => {
					const result = await this.getImageFileWithErrorHandling(target);
					if (!result) return;
					await this.openInDefaultApp(result.imgFile);
				},
				'Failed to open in default app'
			);
		}

		// Add external editor option if path is set
		const editorPath = getExternalEditorPath(this.settings);
		if (editorPath?.trim()) {
			const editorName = this.settings.externalEditorName.trim() || "External Editor";
			this.addMenuItem(
				menu,
				`Open in ${editorName}`,
				'edit',
				async () => {
					const result = await this.getImageFileWithErrorHandling(target);
					if (!result) return;
					await this.openInExternalEditor(result.imgFile.path);
				},
				`Failed to open image in ${editorName}`
			);
		}
	}

	// Image Operations
	// ----------------

	/**
	 * Resizes an image in the editor by updating its wikilink width parameter.
	 * @param img - The HTML image element
	 * @param size - Either a percentage (e.g. 50) or absolute width in pixels (e.g. 600)
	 * @param isAbsolute - If true, size is treated as pixels, otherwise as percentage
	 */
	private async resizeImage(img: HTMLImageElement, size: number, isAbsolute = false) {
		const result = await this.getImageFileWithErrorHandling(img);
		if (!result) {
			throw new Error("Could not find the image file");
		}

		const { width } = await this.readImageDimensions(result.imgFile);
		const newWidth = isAbsolute ? size : Math.round((width * size) / 100);
		await this.updateImageLinkWidth(result.imgFile, newWidth);
	}

	/**
	 * Helper to load an image and get its dimensions
	 * @param src - The image source URL
	 * @param crossOrigin - Whether to set crossOrigin attribute
	 * @returns Promise resolving to the loaded image
	 */
	private loadImage(src: string, crossOrigin?: 'anonymous'): Promise<HTMLImageElement> {
		return new Promise((resolve, reject) => {
			const img = new Image();
			if (crossOrigin) {
				img.crossOrigin = crossOrigin;
			}
			img.onload = () => resolve(img);
			img.onerror = () => reject(new Error('Failed to load image'));
			img.src = src;
		});
	}

	/**
	 * Helper to create a blob from binary data
	 * @param data - The binary data
	 * @param type - The MIME type of the data
	 * @returns The created blob
	 */
	private createBlob(data: ArrayBuffer, type: string): Blob {
		return new Blob([new Uint8Array(data)], { type });
	}

	/**
	 * Copies an image to the system clipboard
	 * @param targetImg - The HTML image element to copy
	 */
	private async copyImageToClipboard(targetImg: HTMLImageElement): Promise<void> {
		try {
			const img = await this.loadImage(targetImg.src, 'anonymous');
			const canvas = document.createElement('canvas');
			canvas.width = img.naturalWidth;
			canvas.height = img.naturalHeight;
			const ctx = canvas.getContext('2d');
			if (!ctx) {
				throw new Error('Failed to get canvas context');
			}

			ctx.drawImage(img, 0, 0);
			const blob = await new Promise<Blob | null>((resolveBlob) => {
				canvas.toBlob(resolveBlob);
			});

			if (!blob) {
				throw new Error('Failed to create blob');
			}

			const item = new ClipboardItem({ [blob.type]: blob });
			await navigator.clipboard.write([item]);
		} catch (error) {
			this.errorLog('Copy to clipboard failed:', error);
			throw error;
		}
	}

	/**
	 * Updates image links in the text using a common transformation logic.
	 * Handles both wiki-style (![[image.png|100]]) and markdown-style (![alt|100](image.png)) links.
	 * 
	 * Examples of transformations:
	 * - Input text: "Here's an image: ![[photo.jpg|50]]"
	 *   Transform: (params) => ["100"]
	 *   Output: "Here's an image: ![[photo.jpg|100]]"
	 * 
	 * - Input text: "Another image: ![caption|50](photo.jpg)"
	 *   Transform: (params) => ["100"]
	 *   Output: "Another image: ![caption|100](photo.jpg)"
	 * 
	 * @param text - The markdown text to update
	 * @param activeFile - The currently active file (for resolving relative paths)
	 * @param imageFile - The specific image file to update links for
	 * @param transform - Function that takes current parameters and returns new ones
	 * @returns The text with updated image links
	 */
	private updateLinks(text: string, activeFile: TFile, imageFile: TFile, transform: (params: string[]) => string[]): string {
		// Handle wiki-style links (![[image.png|100]])
		text = text.replace(WIKILINK_IMAGE_REGEX, (_, opening, linkInner, closing) => {
			// Parse the link components (path, hash, params)
			const link = this.parseLinkComponents(linkInner);
			
			// Skip if this link doesn't point to our target image
			if (!this.resolveLink(link.path, activeFile, imageFile)) {
				return _;  // Return original match unchanged
			}

			// Transform the parameters (e.g., change width)
			link.params = transform(link.params);
			// Rebuild the link with new parameters
			const newLink = this.buildLinkPath(link);
			return `${opening}${newLink}${closing}`;  // Reconstruct full wikilink
		});

		// Handle markdown-style links (![alt|100](image.png))
		return text.replace(MARKDOWN_IMAGE_REGEX, (match, description, linkPath) => {
			// Parse the link components from both parts
			const link = this.parseLinkComponents(description, linkPath);
			
			// Skip if this link doesn't point to our target image
			if (!this.resolveLink(link.path, activeFile, imageFile)) {
				return match;  // Return original match unchanged
			}

			// Get the base description without parameters
			const desc = description.split("|")[0].trim() || imageFile.basename;
			// Transform the parameters
			link.params = transform(link.params);
			// Combine description with new parameters
			const newDescription = link.params.length > 0 ? [desc, ...link.params].join("|") : desc;
			// For markdown links, we put parameters in the description and keep the URL clean
			return `![${newDescription}](${this.buildLinkPath({...link, params: []})})`;
		});
	}

	/**
	 * Parses an Obsidian image link into its components.
	 * Handles both wiki-style (![[image.png|100]]) and markdown-style (![alt|100](image.png)) links.
	 * 
	 * For wiki-style links (![[image.png|100#heading]]):
	 * - mainPart = "image.png|100#heading"
	 * - linkPath = undefined
	 * 
	 * For markdown-style links (![alt|100](image.png#heading)):
	 * - mainPart = "alt|100" (the part between [] brackets)
	 * - linkPath = "image.png#heading" (the part between () parentheses)
	 * 
	 * @param mainPart - For wiki links: full link content. For markdown links: the alt/description text
	 * @param linkPath - Only used for markdown links: the URL/path part in parentheses
	 * @returns Parsed components of the link:
	 *   - path: The file path without parameters or hash
	 *   - hash: The heading reference (e.g., "#heading") if any
	 *   - params: Array of parameters (e.g., ["100"] for width)
	 *   - isWikiStyle: Whether this is a wiki-style (![[...]]) or markdown-style link
	 */
	private parseLinkComponents(mainPart: string, linkPath?: string): ImageLink {
		// For markdown links, pathToParse is the URL in parentheses
		// For wiki links, pathToParse is the entire link content
		const pathToParse = linkPath ?? mainPart;

		// Split off any heading reference (#) from the path
		// e.g., "image.png#heading" → ["image.png", "heading"]
		const [pathWithoutHash, hashPart] = pathToParse.split("#", 2);
		const hash = hashPart ? `#${hashPart}` : "";

		// For markdown links: split the alt text to get parameters
		// For wiki links: split the path to get parameters
		// e.g., "alt|100" → ["alt", "100"]
		// e.g., "image.png|100" → ["image.png", "100"]
		const [path, ...params] = (linkPath ? mainPart : pathWithoutHash).split("|");
		
		return {
			path: linkPath ?? path,  // For markdown links, use the URL part; for wiki links, use the path part
			hash,                    // Any heading reference (#) found
			params,                  // Array of parameters (e.g., width)
			isWikiStyle: !linkPath   // If linkPath is undefined, it's a wiki-style link
		};
	}

	/**
	 * Builds a link path by combining the components of an ImageLink.
	 * Used to reconstruct both wiki-style and markdown-style image links.
	 * 
	 * Examples:
	 * - Input: { path: "image.png", params: ["100"], hash: "#heading" }
	 *   Output: "image.png|100#heading"
	 * 
	 * - Input: { path: "image.png", params: [], hash: "" }
	 *   Output: "image.png"
	 * 
	 * - Input: { path: "subfolder/image.png", params: ["200", "left"], hash: "#section" }
	 *   Output: "subfolder/image.png|200|left#section"
	 * 
	 * @param link - The ImageLink object containing path, parameters, and hash
	 * @returns The reconstructed link path with parameters and hash (if any)
	 */
	private buildLinkPath(link: ImageLink): string {
		// Join parameters with | if there are any
		// e.g., params ["100", "left"] becomes "|100|left"
		const paramsStr = link.params.length > 0 ? `|${link.params.join("|")}` : "";

		// Combine path + parameters + hash
		// e.g., "image.png" + "|100|left" + "#heading"
		return `${link.path}${paramsStr}${link.hash}`;
	}

	/**
	 * Updates image links in the document using a transformation function.
	 * @param imageFile - The image file being referenced
	 * @param transform - Function that transforms the parameters of the image link
	 * @returns Promise<boolean> - True if any changes were made, false otherwise
	 */
	private async updateImageLinks(imageFile: TFile, transform: (params: string[]) => string[]): Promise<boolean> {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			throw new Error('No active file, cannot update link.');
		}

		if (activeFile.path === imageFile.path) {
			return false;
		}

		const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!markdownView) {
			throw new Error('No active MarkdownView to update.');
		}

		const docText = await this.app.vault.read(activeFile);
		
		// Extract frontmatter and content
		let contentWithoutFrontmatter = docText;
		let frontmatterEndIndex = -1;
		
		if (docText.startsWith('---\n')) {
			frontmatterEndIndex = docText.indexOf('\n---\n', 4);
			if (frontmatterEndIndex !== -1) {
				frontmatterEndIndex += 5; // Include the closing delimiter
				contentWithoutFrontmatter = docText.substring(frontmatterEndIndex);
			}
		}
		
		// Handle both link types in one pass
		const replacedText = this.updateLinks(contentWithoutFrontmatter, activeFile, imageFile, transform);

		// Only update if content part changed
		if (replacedText !== contentWithoutFrontmatter) {
			try {
				// Update the file content using vault.process
				await this.app.vault.process(activeFile, (data) => {
					return frontmatterEndIndex !== -1
						? data.substring(0, frontmatterEndIndex) + replacedText
						: replacedText;
				});
				return true;
			} catch (error) {
				this.errorLog('Failed to update file content:', error);
				throw new Error('Failed to update image link');
			}
		}

		return false;
	}

	/**
	 * Helper to resolve a file path to a TFile in the vault
	 * @param linkPath - The path to resolve
	 * @param activeFile - The currently active file for path resolution
	 * @param imageFile - Optional file to compare against for matching
	 * @returns The resolved TFile, or null if not found or doesn't match imageFile
	 */
	private resolveLink(linkPath: string, activeFile: TFile, imageFile?: TFile): TFile | null {
		const resolvedFile = this.app.metadataCache.getFirstLinkpathDest(linkPath, activeFile.path);
		if (!resolvedFile) return null;
		if (imageFile && resolvedFile.path !== imageFile.path) return null;
		return resolvedFile;
	}

	/**
	 * Updates the width parameter in wikilinks that reference a specific image.
	 * @param imageFile - The image file being referenced
	 * @param newWidth - The new width to set in pixels
	 */
	private async updateImageLinkWidth(imageFile: TFile, newWidth: number) {
		const didChange = await this.updateImageLinks(imageFile, (params) => {
			// Check if the last parameter is a number (likely a width)
			const lastParam = params.length > 0 ? params[params.length - 1] : null;
			const lastParamIsNumber = lastParam !== null && !isNaN(parseInt(lastParam));
			
			if (lastParamIsNumber) {
				// Replace just the last parameter (width) and keep all other attributes
				return [...params.slice(0, params.length - 1), String(newWidth)];
			} else {
				// No existing width, so append the new width while preserving all attributes
				return [...params, String(newWidth)];
			}
		});
		
		if (didChange) {
			this.debugLog(`Updated image size to ${newWidth}px`);
		}
	}

	/**
	 * Removes the width parameter from image links.
	 * @param imageFile - The image file being referenced
	 */
	private async removeImageWidth(imageFile: TFile) {
		const didChange = await this.updateImageLinks(imageFile, (params) => {
			// Check if the last parameter is a number (likely a width)
			const lastParam = params.length > 0 ? params[params.length - 1] : null;
			const lastParamIsNumber = lastParam !== null && !isNaN(parseInt(lastParam));
			
			if (lastParamIsNumber) {
				// Remove just the last parameter (width) and keep all other attributes
				return params.slice(0, params.length - 1);
			} else {
				// No width parameter found, return unchanged
				return params;
			}
		});
		
		if (didChange) {
			this.debugLog('Removed custom size from image');
		}
	}

	/**
	 * Reads an image file from the vault and determines its dimensions.
	 * Uses a cache to avoid repeated file reads.
	 * @param file - The image file to read
	 * @returns Object containing width and height in pixels
	 */
	private async readImageDimensions(file: TFile): Promise<{ width: number; height: number }> {
		if (this.dimensionCache.has(file.path)) {
			return this.dimensionCache.get(file.path)!;
		}

		try {
			const data = await this.app.vault.readBinary(file);
			const blob = this.createBlob(data, "image/*");
			const url = URL.createObjectURL(blob);

			try {
				const img = await this.loadImage(url);
				const dimensions = { width: img.width, height: img.height };
				this.dimensionCache.set(file.path, dimensions);
				return dimensions;
			} finally {
				URL.revokeObjectURL(url);
			}
		} catch (error) {
			this.errorLog('Failed to read image file:', error);
			throw error;
		}
	}

	// File & Path Utilities
	// ---------------------

	/**
	 * Resolves an HTML image element to its corresponding vault file.
	 * @param img - The HTML image element
	 * @param activeFile - The currently active file for path resolution
	 * @returns The corresponding TFile or null if not found
	 */
	private getFileForImage(img: HTMLImageElement, activeFile: TFile): TFile | null {
		const src = img.getAttribute('src') ?? "";
		let wikiLink = img.getAttribute('alt'); // e.g., "MyImage.png|200"

		// For Markdown-style images, try to parse the src attribute:
		const srcFileName = this.parseFileNameFromSrc(src);
		if (srcFileName) {
			const fileFromSrc = this.resolveLink(srcFileName, activeFile);
			if (fileFromSrc) {
				return fileFromSrc;
			}
		}

		// For wiki-style images (Obsidian puts "MyImage.png|width" in alt)
		if (wikiLink) {
			wikiLink = wikiLink.split("|")[0].trim();
			const fileFromLink = this.resolveLink(wikiLink, activeFile);
			if (fileFromLink) {
				return fileFromLink;
			}
		}
		return null;
	}

	/**
	 * Extracts a filename from an image's src attribute.
	 * Used as fallback when alt text is not available.
	 * @param src - The src attribute value
	 * @returns The extracted filename or null if not found
	 */
	private parseFileNameFromSrc(src: string): string | null {
		try {
			// Handle both URL-encoded and regular paths
			const decodedSrc = decodeURIComponent(src);
			
			// Split off any query params (?xyz=...)
			const [pathWithoutQuery] = decodedSrc.split("?");
			const slashIdx = pathWithoutQuery.lastIndexOf("/");
			if (slashIdx < 0 || slashIdx >= pathWithoutQuery.length - 1) {
				return null;
			}

			// Extract just the trailing filename portion
			return pathWithoutQuery.substring(slashIdx + 1);
		} catch (error) {
			// Handle malformed URLs gracefully
			this.debugLog('Error parsing src:', error);
			return null;
		}
	}

	// Platform & Debug Utilities
	// --------------------------

	/**
	 * Logs debug messages when debug mode is enabled in settings.
	 * @param args - Arguments to log
	 */
	private debugLog(...args: any[]) {
		if (this.settings.debugMode) {
			const timestamp = new Date().toTimeString().split(' ')[0];
			console.log(`${timestamp}`, ...args);
		}
	}

	/**
	 * Logs error messages with timestamp.
	 * @param args - Arguments to log
	 */
	private errorLog(...args: any[]) {
		const timestamp = new Date().toTimeString().split(' ')[0];
		console.error(`${timestamp}`, ...args);
	}

	/**
	 * Shows the file in system explorer (Finder on macOS)
	 */
	private async showInSystemExplorer(file: TFile): Promise<void> {
		this.app.showInFolder(file.path);
	}

	/**
	 * Opens the file in the default system app
	 */
	private async openInDefaultApp(file: TFile): Promise<void> {
		this.app.openWithDefaultApp(file.path);
	}

	// --- Add a helper function to launch external editor
	private openInExternalEditor(filePath: string) {
		const editorPath = getExternalEditorPath(this.settings);
		const editorName = this.settings.externalEditorName.trim() || "External Editor";
		if (!editorPath) {
			new Notice(`Please set your ${editorName} path in Pixel Perfect Image settings.`);
			return;
		}

		// 1. Get absolute path to the vault root
		const adapter = this.app.vault.adapter;
		if (!(adapter instanceof FileSystemAdapter)) {
			new Notice('Cannot open file: Vault is not a FileSystemAdapter');
			return;
		}
		const vaultPath = adapter.getBasePath();
		// 2. Combine vault root with the relative Obsidian path
		const absoluteFilePath = join(vaultPath, normalizePath(filePath));

		// 3. Choose command depending on macOS vs Windows
		let cmd: string;
		if (Platform.isMacOS) {
			// On macOS, use `open -a "/Applications/Editor.app" "/path/to/file.png"`
			cmd = `open -a "${editorPath}" "${absoluteFilePath}"`;
		} else {
			// On Windows, quote-wrap the exe and file path
			cmd = `"${editorPath}" "${absoluteFilePath}"`;
		}

		exec(cmd, (error) => {
			if (error) {
				this.errorLog(`Error launching ${editorName}:`, error);
				new Notice(`Could not open file in ${editorName}.`);
			} else {
				this.debugLog(`Launched ${editorName}:`, cmd);
			}
		});
	}

	private async renameImage(file: TFile): Promise<void> {
		const newName = await this.promptForNewName(file);
		if (!newName) return;  // User cancelled

		try {
			// Get the directory path and construct new path
			const dirPath = file.parent?.path || "/";
			const newPath = `${dirPath}/${newName}`;

			// Rename the file
			await this.app.fileManager.renameFile(file, newPath);
			new Notice('Image renamed successfully');
		} catch (error) {
			this.errorLog('Failed to rename file:', error);
			new Notice('Failed to rename image');
		}
	}

	private async promptForNewName(file: TFile): Promise<string | null> {
		return new Promise((resolve) => {
			const modal = new FileNameInputModal(this.app, file.name, (result) => {
				resolve(result);
			});
			modal.open();
		});
	}

	/**
	 * Handles click events on images, opening them in a new tab when CMD/CTRL is pressed
	 */
	private handleImageClick(ev: MouseEvent): void {
		// Check if CMD (Mac) or CTRL (Windows/Linux) is held
		if (!(ev.metaKey || ev.ctrlKey)) return;

		const img = this.findImageElement(ev.target);
		if (!img) return;

		// Prevent default click behavior
		ev.preventDefault();

		// Get the image file and open in new tab
		this.getImageFileWithErrorHandling(img)
			.then(result => {
				if (result) {
					this.app.workspace.openLinkText(result.imgFile.path, '', true);
					this.debugLog('Opening image in new tab:', result.imgFile.path);
				}
			})
			.catch(error => {
				this.errorLog('Failed to open image in new tab:', error);
				new Notice('Failed to open image in new tab');
			});
	}
}

class FileNameInputModal extends Modal {
	private result: string | null = null;
	private readonly onSubmit: (result: string | null) => void;
	private readonly originalName: string;

	constructor(app: App, originalName: string, onSubmit: (result: string | null) => void) {
		super(app);
		this.originalName = originalName;
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.style.padding = '0.8em 1.2em'; // Reduce padding

		contentEl.createEl("h2", { 
			text: "Rename image",
			cls: 'modal-title' // Add class for consistency
		}).style.marginTop = '0'; // Remove top margin

		const form = contentEl.createEl("form");
		form.style.display = "flex";
		form.style.flexDirection = "column";
		form.style.gap = "0.8em";

		const input = form.createEl("input", {
			type: "text",
			value: this.originalName
		});
		input.style.width = "100%";
		
		// Select filename without extension
		const lastDotIndex = this.originalName.lastIndexOf('.');
		if (lastDotIndex > 0) {
			const nameWithoutExt = this.originalName.substring(0, lastDotIndex);
			input.setSelectionRange(0, nameWithoutExt.length);
		}

		const buttonContainer = form.createDiv();
		buttonContainer.style.display = "flex";
		buttonContainer.style.justifyContent = "flex-end";
		buttonContainer.style.gap = "0.8em";
		buttonContainer.style.marginTop = "0.4em";

		const submitButton = buttonContainer.createEl("button", { 
			text: "Rename",
			type: "submit",
			cls: 'mod-cta' // Add Obsidian's accent class
		});
		
		const cancelButton = buttonContainer.createEl("button", { 
			text: "Cancel",
			type: "button"
		});
		
		cancelButton.addEventListener("click", () => {
			this.onSubmit(null);
			this.close();
		});

		form.addEventListener("submit", (e) => {
			e.preventDefault();
			const newName = input.value.trim();
			if (newName && newName !== this.originalName) {
				this.onSubmit(newName);
			} else {
				this.onSubmit(null);
			}
			this.close();
		});

		input.focus();
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
		if (this.result === undefined) {
			this.onSubmit(null);
		}
	}
}
