import { debounce, Menu, MarkdownView, Notice, Plugin, TFile, normalizePath, Platform, FileSystemAdapter } from 'obsidian';
import { PixelPerfectImageSettings, DEFAULT_SETTINGS, PixelPerfectImageSettingTab } from './settings';
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

export default class PixelPerfectImage extends Plugin {
	settings: PixelPerfectImageSettings;
	/** Cache to store image dimensions to avoid repeated file reads */
	private dimensionCache = new Map<string, { width: number; height: number }>();
	private isModifierKeyHeld = false;
	private readonly WHEEL_DEBOUNCE_MS = 25; // Minimum time between wheel updates
	private wheelEventCleanup: (() => void) | null = null;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new PixelPerfectImageSettingTab(this.app, this));
		this.registerImageContextMenu();
		
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
		const wheelHandler = debounce(async (evt: WheelEvent) => {
			try {
				// If zoom is not enabled or modifier not held, let default scroll happen
				if (!this.settings.enableWheelZoom || !this.isModifierKeyHeld) return;

				// Verify key is still held (handles Alt+Tab cases)
				if (!this.isModifierKeyStillHeld(evt)) {
					this.setModifierKeyState(false);
					return;
				}

				const target = evt.target;
				if (!(target instanceof HTMLImageElement)) return;

				// Only prevent default if we're actually going to handle the zoom
				evt.preventDefault();
				
				try {
					await this.handleImageWheel(evt, target);
				} catch (error) {
					this.errorLog('Error handling wheel event:', error);
					new Notice('Failed to resize image');
				}
			} catch (error) {
				this.errorLog('Error in wheel handler:', error);
			}
		}, this.WHEEL_DEBOUNCE_MS, true);  // true = leading edge

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
		
		// Calculate step size based on the zoom percentage setting
		const stepSize = Math.max(1, Math.round(currentWidth * (this.settings.wheelZoomPercentage / 100)));
		
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
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	// Context Menu Handlers
	// ----------------------

	/**
	 * Registers a context menu handler for images in the editor.
	 * The menu provides options to view image dimensions and resize the image.
	 */
	private registerImageContextMenu(): void {
		this.registerDomEvent(document, 'contextmenu', async (ev: MouseEvent) => {
			const target = ev.target;
			if (!(target instanceof HTMLImageElement)) {
				return;
			}

			// Prevent default context menu to show our custom one
			ev.preventDefault();

			const menu = new Menu();
			await this.addDimensionsMenuItem(menu, target);
			await this.addResizeMenuItems(menu, ev);
			
			// Add separator before file operations
			menu.addSeparator();
			
			// Add file operation items
			this.addFileOperationMenuItems(menu, target);

			menu.showAtPosition({ x: ev.pageX, y: ev.pageY });
		});
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
			const width = parseInt(pipeParams[0]);
			return isNaN(width) ? null : width;
		};

		// Check wiki-style links
		docText.replace(WIKILINK_IMAGE_REGEX, (_, opening, linkInner, closing) => {
			// Handle subpath components (e.g., #heading)
			let [linkWithoutHash] = linkInner.split("#", 1);

			// Split link path and parameters
			let [linkPath, ...pipeParams] = linkWithoutHash.split("|");

			const resolvedFile = this.app.metadataCache.getFirstLinkpathDest(linkPath, activeFile.path);
			if (resolvedFile?.path === imageFile.path) {
				const width = parseWidth(pipeParams);
				if (width !== null) {
					customWidth = width;
				}
			}
			return _;
		});

		// If not found in wiki links, check Markdown-style links
		if (customWidth === null) {
			docText.replace(MARKDOWN_IMAGE_REGEX, (match, description, linkPath) => {
				// Split description and parameters
				let [desc, ...pipeParams] = description.split("|");
				
				const resolvedFile = this.app.metadataCache.getFirstLinkpathDest(linkPath, activeFile.path);
				if (resolvedFile?.path === imageFile.path) {
					const width = parseWidth(pipeParams);
					if (width !== null) {
						customWidth = width;
					}
				}
				return match;
			});
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
			new Notice('Could not locate image file');
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
	private async addResizeMenuItems(menu: Menu, ev: MouseEvent): Promise<void> {
		// Add copy to clipboard option first
		this.addMenuItem(
			menu,
			'Copy Image',
			'copy',
			async () => {
				await this.copyImageToClipboard(ev.target as HTMLImageElement);
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
				const img = ev.target as HTMLImageElement;
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

		// Only show resize options in editing mode
		const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (markdownView?.getMode() !== 'source') {
			return;
		}

		// Add separator before resize options
		menu.addSeparator();

		// Get current scale and file info
		const img = ev.target as HTMLImageElement;
		const result = await this.getImageFileWithErrorHandling(img);
		let currentScale: number | null = null;
		
		if (result) {
			const { width } = await this.readImageDimensions(result.imgFile);
			currentScale = this.calculateImageScale(img, result.activeFile, result.imgFile, width);
		}

		// Add resize options
		RESIZE_PERCENTAGES.forEach(percentage => {
			this.addMenuItem(
				menu,
				`Resize to ${percentage}%`,
				'image',
				async () => await this.resizeImage(ev, percentage),
				`Failed to resize image to ${percentage}%`,
				currentScale === percentage
			);
		});

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
		const isMac = Platform.isMacOS;

		// Add show in system explorer option
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

		// Add open in default app option
		this.addMenuItem(
			menu,
			'Open in Default App',
			'open-elsewhere',
			async () => {
				const result = await this.getImageFileWithErrorHandling(target);
				if (!result) return;
				await this.openInDefaultApp(result.imgFile);
			},
			'Failed to open in default app'
		);

		// Add external editor option if enabled
		if (this.settings.showExternalEditor) {
			const editorName = this.settings.externalEditorName.trim() || "External Editor";
			this.addMenuItem(
				menu,
				`Open in ${editorName}`,
				'open-elsewhere',
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
	 * @param ev - Mouse event containing the target image
	 * @param percentage - Percentage to resize the image to
	 */
	private async resizeImage(ev: MouseEvent, percentage: number) {
		const img = ev.target as HTMLImageElement;
		const result = await this.getImageFileWithErrorHandling(img);
		if (!result) {
			throw new Error("Could not find the image file");
		}

		const { width } = await this.readImageDimensions(result.imgFile);
		const newWidth = Math.round((width * percentage) / 100);
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
	 * Updates image links in the text using a common transformation logic
	 * @param text - The text to update
	 * @param activeFile - The currently active file
	 * @param imageFile - The image file to update links for
	 * @param transform - Function to transform the parameters
	 * @returns The updated text
	 */
	private updateLinks(text: string, activeFile: TFile, imageFile: TFile, transform: (params: string[]) => string[]): string {
		// First handle wiki-style links
		text = text.replace(WIKILINK_IMAGE_REGEX, (_, opening, linkInner, closing) => {
			const { path, hash, params } = this.parseLinkComponents(linkInner);
			
			if (!this.resolveLink(path, activeFile, imageFile)) {
				return _;
			}

			const newParams = transform(params);
			const newLink = this.buildLinkPath(path, newParams, hash);
			return `${opening}${newLink}${closing}`;
		});

		// Then handle markdown-style links
		return text.replace(MARKDOWN_IMAGE_REGEX, (match, description, linkPath) => {
			const { path, hash, params } = this.parseLinkComponents(description, linkPath);
			
			if (!this.resolveLink(path, activeFile, imageFile)) {
				return match;
			}

			const desc = description.split("|")[0].trim() || imageFile.basename;
			const newParams = transform(params);
			const newDescription = newParams.length > 0 ? [desc, ...newParams].join("|") : desc;
			return `![${newDescription}](${this.buildLinkPath(path, [], hash)})`;
		});
	}

	/**
	 * Parses link components into path, hash, and parameters
	 * @param mainPart - The main part of the link (either linkInner or description)
	 * @param linkPath - Optional separate linkPath for markdown-style links
	 * @returns Object containing parsed components
	 */
	private parseLinkComponents(mainPart: string, linkPath?: string): { path: string; hash: string; params: string[] } {
		// For wiki-style links, everything is in mainPart
		// For markdown-style links, path is in linkPath and params are in mainPart
		const pathToParse = linkPath ?? mainPart;
		
		// Handle subpath components (e.g., #heading)
		const [pathWithoutHash, hashPart] = pathToParse.split("#", 2);
		const hash = hashPart ? `#${hashPart}` : "";

		// Split parameters
		const [path, ...params] = (linkPath ? mainPart : pathWithoutHash).split("|");

		return {
			path: linkPath ?? path,
			hash,
			params
		};
	}

	/**
	 * Builds a link path with optional parameters and hash
	 * @param path - The base path
	 * @param params - Array of parameters
	 * @param hash - Hash component including #
	 * @returns Constructed link path
	 */
	private buildLinkPath(path: string, params: string[], hash: string): string {
		const paramsStr = params.length > 0 ? `|${params.join("|")}` : "";
		return `${path}${paramsStr}${hash}`;
	}

	/**
	 * Updates image links in the document using a transformation function.
	 * @param imageFile - The image file being referenced
	 * @param transform - Function that transforms the parameters of the image link
	 */
	private async updateImageLinks(imageFile: TFile, transform: (params: string[]) => string[]) {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			throw new Error('No active file, cannot update link.');
		}

		if (activeFile.path === imageFile.path) {
			return;
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
		const didChange = await this.updateImageLinks(imageFile, (_) => [String(newWidth)]);
		if (didChange) {
			this.debugLog(`Updated image size to ${newWidth}px`);
		}
	}

	/**
	 * Removes the width parameter from image links.
	 * @param imageFile - The image file being referenced
	 */
	private async removeImageWidth(imageFile: TFile) {
		const didChange = await this.updateImageLinks(imageFile, (_) => []);
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
		// Split off any query params (?xyz=...)
		const [pathWithoutQuery] = src.split("?");
		const slashIdx = pathWithoutQuery.lastIndexOf("/");
		if (slashIdx < 0 || slashIdx >= pathWithoutQuery.length - 1) {
			return null;
		}

		// Extract just the trailing filename portion
		let fileName = pathWithoutQuery.substring(slashIdx + 1);

		// Decode "%20" and other URL entities back into normal characters
		fileName = decodeURIComponent(fileName);

		return fileName;
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
		const editorPath = this.settings.externalEditorPath;
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
}
