import { App, PluginSettingTab, Setting, Platform } from 'obsidian';
import PixelPerfectImage from './main';


export interface PixelPerfectImageSettings {
	debugMode: boolean;
	showFileInfo: boolean;
	externalEditorName: string;
	externalEditorPathMac: string;
	externalEditorPathWin: string;
	// Mousewheel zoom settings
	enableWheelZoom: boolean;
	wheelModifierKey: 'Alt' | 'Ctrl' | 'Shift';
	wheelZoomPercentage: number;
	invertScrollDirection: boolean;
}

export const DEFAULT_SETTINGS: PixelPerfectImageSettings = {
	debugMode: false,
	showFileInfo: true,
	externalEditorName: "",
	externalEditorPathMac: "",
	externalEditorPathWin: "",
	// Mousewheel zoom defaults
	enableWheelZoom: true,
	wheelModifierKey: 'Alt',
	wheelZoomPercentage: 20,
	invertScrollDirection: false
};

// Add helper function to get the correct path based on platform
export function getExternalEditorPath(settings: PixelPerfectImageSettings): string {
	return Platform.isMacOS ? settings.externalEditorPathMac : settings.externalEditorPathWin;
}

export class PixelPerfectImageSettingTab extends PluginSettingTab {
	plugin: PixelPerfectImage;

	constructor(app: App, plugin: PixelPerfectImage) {
		super(app, plugin);
		this.plugin = plugin;
	}

	async display() {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Show file information")
			.setDesc("Show file information in the context menu")
			.addToggle(toggle => {
				toggle
					.setValue(this.plugin.settings.showFileInfo)
					.onChange(async (value: boolean) => {
						this.plugin.settings.showFileInfo = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Mousewheel zoom")
			.setHeading();

		new Setting(containerEl)
			.setName("Enable mousewheel zoom")
			.setDesc("Hold modifier key and scroll to resize images")
			.addToggle(toggle => {
				toggle
					.setValue(this.plugin.settings.enableWheelZoom)
					.onChange(async (value: boolean) => {
						this.plugin.settings.enableWheelZoom = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Modifier key")
			.setDesc("Key to hold while scrolling to zoom images")
			.addDropdown(dropdown => {
				const isMac = Platform.isMacOS;
				dropdown
					.addOption('Alt', isMac ? 'Option' : 'Alt')
					.addOption('Ctrl', 'Ctrl')
					.addOption('Shift', 'Shift')
					.setValue(this.plugin.settings.wheelModifierKey)
					.onChange(async (value: 'Alt' | 'Ctrl' | 'Shift') => {
						this.plugin.settings.wheelModifierKey = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Zoom step size")
			.setDesc("Percentage to zoom per scroll step")
			.addExtraButton(button => {
				button
					.setIcon("reset")
					.setTooltip("Reset to default")
					.onClick(async () => {
						this.plugin.settings.wheelZoomPercentage = DEFAULT_SETTINGS.wheelZoomPercentage;
						await this.plugin.saveSettings();
						this.display();
					});
			})
			.addSlider(slider => {
				slider
					.setValue(this.plugin.settings.wheelZoomPercentage)
					.onChange(async (value) => {
						if (!isNaN(value) && value > 0) {
							this.plugin.settings.wheelZoomPercentage = value;
							await this.plugin.saveSettings();
						}
					});
			});

		new Setting(containerEl)
			.setName("Invert scroll direction")
			.setDesc("Invert the zoom direction when scrolling")
			.addToggle(toggle => {
				toggle
					.setValue(this.plugin.settings.invertScrollDirection)
					.onChange(async (value: boolean) => {
						this.plugin.settings.invertScrollDirection = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("External editor")
			.setHeading();

		new Setting(containerEl)
			.setName("External editor name")
			.setDesc("Name of your external editor (e.g., Photoshop)")
			.addText(text => {
				text
					.setPlaceholder("Photoshop")
					.setValue(this.plugin.settings.externalEditorName)
					.onChange(async (value) => {
						this.plugin.settings.externalEditorName = value;
						await this.plugin.saveSettings();
					});
			});

		if (Platform.isMacOS) {
			new Setting(containerEl)
				.setName("External editor path (MacOS)")
				.setDesc("Full path to your external editor application on MacOS")
				.addText(text => {
					text
						.setPlaceholder("/Applications/Adobe Photoshop 2025/Adobe Photoshop 2025.app")
						.setValue(this.plugin.settings.externalEditorPathMac)
						.onChange(async (value) => {
							const cleanedPath = value.replace(/\\ /g, ' ');
							this.plugin.settings.externalEditorPathMac = cleanedPath;
							await this.plugin.saveSettings();
						});
				});
		}

		if (Platform.isWin) {
			new Setting(containerEl)
				.setName("External editor path (Windows)")
				.setDesc("Full path to your external editor application on Windows")
				.addText(text => {
					text
						.setPlaceholder("C:\\Program Files\\Adobe\\Adobe Photoshop 2025\\Photoshop.exe")
						.setValue(this.plugin.settings.externalEditorPathWin)
						.onChange(async (value) => {
							const cleanedPath = value.replace(/\\ /g, ' ');
							this.plugin.settings.externalEditorPathWin = cleanedPath;
							await this.plugin.saveSettings();
						});
				});
		}

		new Setting(containerEl)
			.setName("Debug mode")
			.setDesc("Enable debug logging to console")
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