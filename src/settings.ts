import { App, PluginSettingTab, Setting } from 'obsidian';
import PixelPerfectImage from './main';

export interface PixelPerfectImageSettings {
	debugMode: boolean;
}

export const DEFAULT_SETTINGS: PixelPerfectImageSettings = {
	debugMode: false
};

export class PixelPerfectImageSettingTab extends PluginSettingTab {
	plugin: PixelPerfectImage;

	constructor(app: App, plugin: PixelPerfectImage) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

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