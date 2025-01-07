import { App, PluginSettingTab, Setting } from 'obsidian';
import PixelPerfectImage from './main';

export interface PixelPerfectImageSettings {
	debugMode: boolean;
	showFileInfo: boolean;
	modifierKey: 'meta' | 'alt' | 'shift';
}

export const DEFAULT_SETTINGS: PixelPerfectImageSettings = {
	debugMode: false,
	showFileInfo: true,
	modifierKey: 'meta'
};

export class PixelPerfectImageSettingTab extends PluginSettingTab {
	plugin: PixelPerfectImage;

	constructor(app: App, plugin: PixelPerfectImage) {
		super(app, plugin);
		this.plugin = plugin;
	}

	private isMacPlatform(): boolean {
		// Try userAgentData first (modern browsers)
		if ('userAgentData' in navigator) {
			return (navigator as any).userAgentData.platform === 'macOS';
		}
		// Fallback for older browsers
		return navigator.platform.toLowerCase().includes('mac');
	}

	display(): void {
		const { containerEl } = this;
		const isMac = this.isMacPlatform();

		containerEl.empty();

		new Setting(containerEl)
			.setName("Modifier Key")
			.setDesc(`Key to hold while right-clicking to show the image menu`)
			.addDropdown(dropdown => {
				dropdown
					.addOption('meta', isMac ? 'CMD' : 'CTRL')
					.addOption('alt', 'Alt')
					.addOption('shift', 'Shift')
					.setValue(this.plugin.settings.modifierKey)
					.onChange(async (value: 'meta' | 'alt' | 'shift') => {
						this.plugin.settings.modifierKey = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Show File Information")
			.setDesc("Show file name, dimensions and size in the context menu.")
			.addToggle(toggle => {
				toggle
					.setValue(this.plugin.settings.showFileInfo)
					.onChange(async (value: boolean) => {
						this.plugin.settings.showFileInfo = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Debug Mode")
			.setDesc("Enable debug mode to log information to the console.")
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