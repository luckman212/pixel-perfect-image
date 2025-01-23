import { App, PluginSettingTab, Setting, Platform } from 'obsidian';
import PixelPerfectImage from './main';


export interface PixelPerfectImageSettings {
	debugMode: boolean;
	showFileInfo: boolean;
	showExternalEditor: boolean;
	externalEditorName: string;
	externalEditorPath: string;
	// Mousewheel zoom settings
	enableWheelZoom: boolean;
	wheelModifierKey: 'Alt' | 'Ctrl' | 'Shift';
	wheelZoomPercentage: number;
	invertScrollDirection: boolean;
}

export const DEFAULT_SETTINGS: PixelPerfectImageSettings = {
	debugMode: false,
	showFileInfo: true,
	showExternalEditor: true,
	externalEditorName: "",
	externalEditorPath: "",
	// Mousewheel zoom defaults
	enableWheelZoom: true,
	wheelModifierKey: 'Alt',
	wheelZoomPercentage: 20,
	invertScrollDirection: false
};

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
			.setDesc("Settings for zooming images with mousewheel")
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
			.setDesc("Settings for external image editor integration")
			.setHeading();

		new Setting(containerEl)
			.setName('Show menu option "Edit in external editor"')
			.setDesc("Add option to context menu to edit images in external editor")
			.addToggle(toggle => {
				toggle
					.setValue(this.plugin.settings.showExternalEditor)
					.onChange(async (value: boolean) => {
						this.plugin.settings.showExternalEditor = value;
						await this.plugin.saveSettings();
					});
			});

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

		new Setting(containerEl)
			.setName("External editor path")
			.setDesc("Full path to your external editor application")
			.addText(text => {
				const placeholder = Platform.isMacOS
					? "/Applications/Adobe Photoshop 2025/Adobe Photoshop 2025.app"
					: "C:\\Program Files\\Adobe\\Adobe Photoshop 2025\\Photoshop.exe";
				text
					.setPlaceholder(placeholder)
					.setValue(this.plugin.settings.externalEditorPath)
					.onChange(async (value) => {
						const cleanedPath = value.replace(/\\ /g, ' ');
						this.plugin.settings.externalEditorPath = cleanedPath;
						await this.plugin.saveSettings();
					});
			});

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