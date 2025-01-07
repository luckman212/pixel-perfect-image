import { App, Editor, Menu, MarkdownView, Notice, Plugin, TFile } from 'obsidian';
import { PixelPerfectImageSettings, DEFAULT_SETTINGS, PixelPerfectImageSettingTab } from './settings';

/** Fixed percentages available for image resizing */
const RESIZE_PERCENTAGES = [100, 50, 25] as const;
/** Regular expression to match Obsidian image wikilinks: ![[image.png]] */
const IMAGE_WIKILINK_REGEX = /(!\[\[)([^\]]+)(\]\])/g;

export default class PixelPerfectImage extends Plugin {
	settings: PixelPerfectImageSettings;
	/** Cache to store image dimensions to avoid repeated file reads */
	private dimensionCache = new Map<string, { width: number; height: number }>();

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new PixelPerfectImageSettingTab(this.app, this));
		this.registerImageContextMenu();
		this.debugLog('Plugin loaded');
	}

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

			// Prevent default context menus to show our custom one
			ev.preventDefault();

			const menu = new Menu();
				await this.addDimensionsMenuItem(menu, target);
				this.addResizeMenuItems(menu, ev);

				menu.showAtPosition({ x: ev.pageX, y: ev.pageY });
		});
	}

	/**
	 * Adds an informational menu item showing the actual dimensions of the image.
	 * Reads dimensions from the image file in the vault.
	 * @param menu - The context menu to add the item to
	 * @param img - The HTML image element that was right-clicked
	 */
	private async addDimensionsMenuItem(menu: Menu, img: HTMLImageElement): Promise<void> {
		try {
			const activeFile = this.app.workspace.getActiveFile();
			if (!activeFile) return;

			const imgFile = this.getFileForImage(img, activeFile);
			if (!imgFile) {
				this.debugLog('Could not find file for alt/src');
				return;
			}

			const { width, height } = await this.readImageDimensions(imgFile);
			menu.addItem((item) => {
				item
					.setTitle(`Dimensions: ${width} × ${height} px`)
					.setIcon("info")
					.setDisabled(true);
			});
		} catch (error) {
			this.errorLog('Could not read dimensions:', error);
			new Notice("Could not read image dimensions");
		}
	}

	/**
	 * Adds resize percentage options to the context menu.
	 * Each option will resize the image to the specified percentage of its original size.
	 * @param menu - The context menu to add items to
	 * @param ev - The original mouse event
	 */
	private addResizeMenuItems(menu: Menu, ev: MouseEvent): void {
		RESIZE_PERCENTAGES.forEach(percentage => {
			menu.addItem((item) => {
				item.setTitle(`Resize to ${percentage}%`)
					.setIcon("image")
					.onClick(async () => {
						try {
							await this.resizeImage(ev, percentage);
						} catch (error) {
							this.errorLog('Failed to resize:', error);
							new Notice(`Failed to resize image to ${percentage}%`);
						}
					});
			});
		});
	}

	/**
	 * Logs debug messages when debug mode is enabled in settings.
	 * Includes timestamp for better debugging.
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
	 * Always logs regardless of debug mode.
	 * @param args - Arguments to log
	 */
	private errorLog(...args: any[]) {
		const timestamp = new Date().toTimeString().split(' ')[0];
		console.error(`${timestamp}`, ...args);
	}

	/**
	 * Resizes an image in the editor by updating its wikilink width parameter.
	 * @param ev - Mouse event containing the target image
	 * @param percentage - Percentage to resize the image to
	 */
	private async resizeImage(ev: MouseEvent, percentage: number) {
		const img = ev.target as HTMLImageElement;
		let alt = img.getAttribute('alt');
		const src = img.getAttribute('src') ?? "";

		// Try to get alt text from src if not explicitly set
		if (!alt) {
			alt = this.parseFileNameFromSrc(src);
			if (!alt) {
				throw new Error("Unable to determine the image name from alt or src.");
			}
		}

		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			throw new Error("No active file in workspace to update a link.");
		}

		const imgFile = this.app.metadataCache.getFirstLinkpathDest(alt, activeFile.path);
		if (!imgFile) {
			throw new Error(`Could not find a TFile for '${alt}'`);
		}

		const { width } = await this.readImageDimensions(imgFile);
		const newWidth = Math.round((width * percentage) / 100);
		await this.updateImageLinkWidth(imgFile, newWidth);
	}

	/**
	 * Extracts a filename from an image's src attribute.
	 * Used as fallback when alt text is not available.
	 * @param src - The src attribute value
	 * @returns The extracted filename or null if not found
	 */
	private parseFileNameFromSrc(src: string): string | null {
		const [pathWithoutQuery] = src.split("?");
		const slashIdx = pathWithoutQuery.lastIndexOf("/");
		if (slashIdx < 0 || slashIdx === pathWithoutQuery.length - 1) {
			return null;
		}
		const fileName = pathWithoutQuery.substring(slashIdx + 1);
		return fileName || null;
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

		const data = await this.app.vault.readBinary(file);

		return new Promise((resolve, reject) => {
			const blob = new Blob([new Uint8Array(data)], { type: "image/*" });
			const url = URL.createObjectURL(blob);

			const tempImg = new Image();
			tempImg.onload = () => {
				URL.revokeObjectURL(url);
				const dimensions = { width: tempImg.width, height: tempImg.height };
				this.dimensionCache.set(file.path, dimensions);
				resolve(dimensions);
			};
			tempImg.onerror = (err) => {
				URL.revokeObjectURL(url);
				reject(new Error('Failed to load image'));
			};
			tempImg.src = url;
		});
	}

	/**
	 * Updates the width parameter in wikilinks that reference a specific image.
	 * Handles complex wikilinks including subpaths and multiple parameters.
	 * @param imageFile - The image file being referenced
	 * @param newWidth - The new width to set in pixels
	 */
	private async updateImageLinkWidth(imageFile: TFile, newWidth: number) {
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

		const editor = markdownView.editor;
		const docText = editor.getValue();

		let didChange = false;

		const replacedText = docText.replace(IMAGE_WIKILINK_REGEX, (_, opening, linkInner, closing) => {
			// Handle subpath components (e.g., #heading)
			let [ linkWithoutHash, hashPart ] = linkInner.split("#", 2);
			if (hashPart) hashPart = "#" + hashPart;

			// Split link path and parameters
			let [ linkPath, ...pipeParams ] = linkWithoutHash.split("|");

			const resolvedFile = this.app.metadataCache.getFirstLinkpathDest(linkPath, activeFile.path);
			if (!resolvedFile || resolvedFile.path !== imageFile.path) {
				return _;
			}

			pipeParams[0] = String(newWidth);

			const newLink = [linkPath, ...pipeParams].join("|");
			const updatedInner = hashPart ? `${newLink}${hashPart}` : newLink;

			didChange = true;
			return `${opening}${updatedInner}${closing}`;
		});

		if (didChange && replacedText !== docText) {
			editor.setValue(replacedText);
			this.debugLog(`Updated image size to ${newWidth}px in ${activeFile.path}`);
		}
	}

	/**
	 * Load plugin settings
	 */
	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	/**
	 * Save plugin settings
	 */
	async saveSettings() {
		await this.saveData(this.settings);
	}

	/**
	 * Resolves an HTML image element to its corresponding vault file.
	 * @param img - The HTML image element
	 * @param activeFile - The currently active file for path resolution
	 * @returns The corresponding TFile or null if not found
	 */
	private getFileForImage(img: HTMLImageElement, activeFile: TFile): TFile | null {
		const alt = img.getAttribute('alt');
		const src = img.getAttribute('src') ?? "";

		const fileName = alt || this.parseFileNameFromSrc(src);
		if (!fileName) {
			this.debugLog("No alt or valid src filename found. Cannot map image to file.");
			return null;
		}

		return this.app.metadataCache.getFirstLinkpathDest(fileName, activeFile.path);
	}
}
