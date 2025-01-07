import { App, Editor, Menu, MarkdownView, Plugin, PluginSettingTab, Setting, TFile } from 'obsidian';

interface PixelPerfectImageSettings {
	debugMode: boolean;
}

const DEFAULT_SETTINGS: PixelPerfectImageSettings = {
	debugMode: false
};

export default class PixelPerfectImagePlugin extends Plugin {
	settings: PixelPerfectImageSettings;

	async onload() {
		this.debugLog('PixelPerfectImage: Plugin loading...');
		await this.loadSettings();

		this.addSettingTab(new PixelPerfectImageSettingTab(this.app, this));

		// Use a global contextmenu event to catch when the user right-clicks an image.
		this.registerDomEvent(document, 'contextmenu', async (ev: MouseEvent) => {
			if (ev.target instanceof HTMLImageElement) {
				this.debugLog('PixelPerfectImage: Right-click on image detected', ev.target);

				// Prevent Obsidian's or the OS default context menu
				ev.preventDefault();

				// Build a small custom menu
				const menu = new Menu();

				// Attempt to read dimensions from the underlying TFile
				try {
					const img = ev.target as HTMLImageElement;
					let alt = img.getAttribute('alt');
					const src = img.getAttribute('src') ?? "";

					this.debugLog('PixelPerfectImage: alt/src attributes:', { alt, src });

					if (!alt) {
						alt = this.parseFileNameFromSrc(src);
						if (alt) {
							this.debugLog(`PixelPerfectImage: Derived alt from src -> ${alt}`);
						}
					}

					const activeFile = this.app.workspace.getActiveFile();
					if (activeFile && alt) {
						const imgFile = this.app.metadataCache.getFirstLinkpathDest(alt, activeFile.path);
						if (imgFile) {
							const { width, height } = await this.readImageDimensions(imgFile);
							menu.addItem((item) => {
								item
									.setTitle(`Dimensions: ${width} × ${height} px`)
									.setIcon("info")
									.setDisabled(true); // We disable because it's just informational
							});
						} else {
							this.debugLog('warn', `PixelPerfectImage: Could not find a TFile for '${alt}'`);
						}
					}
				} catch (error) {
					this.debugLog('error', "PixelPerfectImage: Could not read dimensions for the image:", error);
				}

				// The existing resize options
				menu.addItem((item) => {
					item.setTitle("Resize to 100%")
						.setIcon("image")
						.onClick(async () => {
							await this.resizeImage(ev, 100);
						});
				});

				menu.addItem((item) => {
					item.setTitle("Resize to 50%")
						.setIcon("image")
						.onClick(async () => {
							await this.resizeImage(ev, 50);
						});
				});

				menu.addItem((item) => {
					item.setTitle("Resize to 25%")
						.setIcon("image")
						.onClick(async () => {
							await this.resizeImage(ev, 25);
						});
				});

				menu.showAtPosition({ x: ev.pageX, y: ev.pageY });
			}
		});

		this.debugLog('PixelPerfectImage: Plugin loaded successfully');
	}

	/**
	 * Logs debug messages if debug mode is enabled.
	 */
	private debugLog(levelOrMessage: 'log' | 'warn' | 'error' | any, ...args: any[]) {
		if (!this.settings?.debugMode) {
			return;
		}

		let level: 'log' | 'warn' | 'error' = 'log';
		let logArgs = [];

		if (levelOrMessage === 'log' || levelOrMessage === 'warn' || levelOrMessage === 'error') {
			level = levelOrMessage;
			logArgs = args;
		} else {
			logArgs = [levelOrMessage, ...args];
		}

		switch (level) {
			case 'warn':
				console.warn(...logArgs);
				break;
			case 'error':
				console.error(...logArgs);
				break;
			default:
				console.log(...logArgs);
		}
	}

	/**
	 * Re-usable method to resize the image by a given percentage.
	 */
	private async resizeImage(ev: MouseEvent, percentage: number) {
		try {
			const img = ev.target as HTMLImageElement;
			let alt = img.getAttribute('alt');
			const src = img.getAttribute('src') ?? "";

			this.debugLog('PixelPerfectImage: alt/src attributes:', { alt, src });

			// If the <img> tag doesn't have an explicit alt, attempt to parse the filename out of the src
			if (!alt) {
				alt = this.parseFileNameFromSrc(src);
				if (!alt) {
					this.debugLog('warn', "PixelPerfectImage: Unable to determine the image name from alt or src.");
					return;
				}
				this.debugLog(`PixelPerfectImage: Derived alt from src -> ${alt}`);
			}

			// Identify the file that's currently being edited
			const activeFile = this.app.workspace.getActiveFile();
			if (!activeFile) {
				this.debugLog('warn', "PixelPerfectImage: No active file in workspace to update a link.");
				return;
			}

			this.debugLog("PixelPerfectImage: Active file path:", activeFile.path);

			// Attempt to resolve the image TFile via the alt text
			const imgFile = this.app.metadataCache.getFirstLinkpathDest(alt, activeFile.path);
			this.debugLog("PixelPerfectImage: Found image file:", imgFile);

			if (!imgFile) {
				this.debugLog('warn', `PixelPerfectImage: Could not find a TFile for '${alt}'`);
				return;
			}

			// Read the actual pixel dimensions of the image from the vault
			const { width } = await this.readImageDimensions(imgFile);
			this.debugLog('PixelPerfectImage: Actual image width:', width);

			// Compute the new width to insert into the link
			const newWidth = Math.round((width * percentage) / 100);

			// Update the wiki link in the current markdown file
			await this.updateImageLinkWidth(imgFile, newWidth);

		} catch (error) {
			this.debugLog('error', `PixelPerfectImage: Error resizing image to ${percentage}%:`, error);
		}
	}

	/**
	 * Extract a filename from the "src" if the alt is missing.
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
	 * Load the binary data of the image from vault and measure its real width/height.
	 */
	private async readImageDimensions(file: TFile): Promise<{ width: number; height: number }> {
		this.debugLog('PixelPerfectImage: Reading image dimensions for file:', file.path);
		const data = await this.app.vault.readBinary(file);
		this.debugLog('PixelPerfectImage: Binary read, size:', data.byteLength);

		return new Promise((resolve, reject) => {
			const blob = new Blob([new Uint8Array(data)], { type: "image/*" });
			const url = URL.createObjectURL(blob);

			this.debugLog('PixelPerfectImage: Created blob URL:', url);

			const tempImg = new Image();
			tempImg.onload = () => {
				this.debugLog('PixelPerfectImage: Finished loading image:', { width: tempImg.width, height: tempImg.height });
				resolve({ width: tempImg.width, height: tempImg.height });
			};
			tempImg.onerror = (err) => {
				this.debugLog('error', 'PixelPerfectImage: Error loading image blob:', err);
				reject(err);
			};
			tempImg.src = url;
		});
	}

	/**
	 * Finds all wiki image links in the current document. If any link references our
	 * given image TFile (regardless of subfolder or short name usage), we update
	 * or add the "|<width>" at the end of that link.
	 *
	 * This is more flexible than trying to match the raw path, since Obsidian can
	 * resolve "Grok.png" to "_resources/Grok.png", for example.
	 */
	private async updateImageLinkWidth(imageFile: TFile, newWidth: number) {
		this.debugLog('PixelPerfectImage: Updating links for', { path: imageFile.path, newWidth });

		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			this.debugLog('warn', 'PixelPerfectImage: No active file, cannot update link.');
			return;
		}

		// If the current file is the same as the image file, there's no wiki link to update
		if (activeFile.path === imageFile.path) {
			this.debugLog('PixelPerfectImage: The active file is the image itself, skipping.');
			return;
		}

		const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!markdownView) {
			this.debugLog('warn', 'PixelPerfectImage: No active MarkdownView to update.');
			return;
		}

		const editor = markdownView.editor;
		const docText = editor.getValue();
		this.debugLog('PixelPerfectImage: Document text length:', docText.length);

		// We'll replace all embedded image links of the form ![[...]], then see whether
		// the "..." portion resolves to our imageFile.
		const IMAGE_WIKILINK_REGEX = /(!\[\[)([^\]]+)(\]\])/g;

		let didChange = false;

		const replacedText = docText.replace(IMAGE_WIKILINK_REGEX, (_, opening, linkInner, closing) => {
			// "linkInner" might look like "Grok.png|646", "Grok.png", "_resources/Grok.png", etc.
			// Possibly there's a subpath "#layer=...", or multiple parameters after the pipe.

			// Let's separate any subpath like "#something"
			let [ linkWithoutHash, hashPart ] = linkInner.split("#", 2);
			if (hashPart) hashPart = "#" + hashPart;

			// Split the portion before any '|' into (path) and after '|' is width or other params
			let [ linkPath, ...pipeParams ] = linkWithoutHash.split("|");

			// Use Obsidian's link resolution to see if this references our imageFile
			const resolvedFile = this.app.metadataCache.getFirstLinkpathDest(linkPath, activeFile.path);
			if (!resolvedFile || resolvedFile.path !== imageFile.path) {
				// Not referencing our image file, leave it alone
				return _;
			}

			// If we do reference the same file, let's inject or replace the width param.
			pipeParams[0] = String(newWidth);

			// Rebuild the link
			const newLink = [linkPath, ...pipeParams].join("|");
			const updatedInner = hashPart ? `${newLink}${hashPart}` : newLink;

			didChange = true;
			return `${opening}${updatedInner}${closing}`;
		});

		if (didChange && replacedText !== docText) {
			this.debugLog('PixelPerfectImage: Link text changed. Updating editor...');
			editor.setValue(replacedText);
		} else {
			this.debugLog('PixelPerfectImage: No applicable links changed.');
		}
	}

	// -- Plugin Settings Storage --
	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

/**
 * A setting tab that allows toggling debug mode.
 */
class PixelPerfectImageSettingTab extends PluginSettingTab {
	plugin: PixelPerfectImagePlugin;

	constructor(app: App, plugin: PixelPerfectImagePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Debug Mode")
			.setDesc("Toggle detailed debug logging in the developer console.")
			.addToggle(toggle => {
				toggle
					.setValue(this.plugin.settings.debugMode)
					.onChange(async (value: boolean) => {
						this.plugin.settings.debugMode = value;
						await this.plugin.saveSettings();
					});
			});
	}
}
