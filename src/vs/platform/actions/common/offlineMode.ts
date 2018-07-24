/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { localize } from 'vs/nls';
import { Action } from 'vs/base/common/actions';
import { TPromise } from 'vs/base/common/winjs.base';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { INotificationService, Severity } from 'vs/platform/notification/common/notification';
import { MenuRegistry, MenuId } from 'vs/platform/actions/common/actions';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { dispose, IDisposable } from 'vs/base/common/lifecycle';

export const offlineModeSetting = 'workbench.enableOfflineMode';
export const unSupportedInOfflineModeMsg = localize('offlineModeUnsupportedFeature', "This feature is not supported in offline mode");

export class EnableOfflineMode extends Action {
	static readonly ID = 'workbench.action.enableOfflineMode';
	static LABEL = localize('enableOfflineMode', 'Enable Offline Mode');

	private disposables: IDisposable[] = [];
	private readonly disclaimerStorageKey = 'workbench.offlineMode.disclaimer.dontShowAgain';

	constructor(
		id: string = EnableOfflineMode.ID,
		label: string = EnableOfflineMode.LABEL,
		@IConfigurationService private configurationService: IConfigurationService,
		@IStorageService private storageService: IStorageService,
		@INotificationService private notificationService: INotificationService
	) {
		super(id, label);
		this.updateEnabled();
		this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(offlineModeSetting)) {
				this.updateEnabled();
			}
		}, this, this.disposables);
	}

	private updateEnabled() {
		this.enabled = this.configurationService.getValue(offlineModeSetting) !== true;
	}

	run(): TPromise<any> {
		if (this.storageService.getBoolean(this.disclaimerStorageKey, StorageScope.GLOBAL, false) === false) {
			this.notificationService.prompt(Severity.Info, localize('offlineModeDisclaimer', "VS Code cannot stop extensions from making network requests in offline mode. If extensions make such requests, please log an issue against them."), [
				{
					label: localize('DontShowAgain', "Don't Show Again"),
					run: () => {
						this.storageService.store(this.disclaimerStorageKey, true);
					}
				}
			]);
		}
		return this.configurationService.updateValue(offlineModeSetting, true);
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
		super.dispose();
	}
}

export class DisableOfflineMode extends Action {
	static readonly ID = 'workbench.action.disableOfflineMode';
	static LABEL = localize('disableOfflineMode', 'Disable Offline Mode');

	private disposables: IDisposable[] = [];

	constructor(
		id: string = DisableOfflineMode.ID,
		label: string = DisableOfflineMode.LABEL,
		@IConfigurationService private configurationService: IConfigurationService
	) {
		super(id, label);
		this.updateEnabled();
		this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(offlineModeSetting)) {
				this.updateEnabled();
			}
		}, this, this.disposables);
	}

	private updateEnabled() {
		this.enabled = this.configurationService.getValue(offlineModeSetting) === true;
	}

	run(): TPromise<any> {
		return this.configurationService.updateValue(offlineModeSetting, false);
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
		super.dispose();
	}
}

export class NotifyUnsupportedFeatureInOfflineMode extends Action {
	static readonly ID = 'workbench.action.notifyUnsupportedFeatureInOfflineMode';

	constructor(
		id: string = NotifyUnsupportedFeatureInOfflineMode.ID,
		label: string = '',
		@IConfigurationService private configurationService: IConfigurationService,
		@INotificationService private notificationService: INotificationService
	) {
		super(id, label);
	}

	run(): TPromise<any> {
		this.notificationService.prompt(Severity.Info, unSupportedInOfflineModeMsg, [
			{
				label: DisableOfflineMode.LABEL,
				run: () => {
					return this.configurationService.updateValue(offlineModeSetting, false);
				}
			}
		]);
		return TPromise.as(null);
	}
}

MenuRegistry.appendMenuItem(MenuId.MenubarPreferencesMenu, {
	group: '5_offline',
	command: {
		id: EnableOfflineMode.ID,
		title: localize({ key: 'miEnableOfflineMode', comment: ['&& denotes a mnemonic'] }, "Enable &&Offline Mode")
	},
	order: 1,
	when: ContextKeyExpr.not('config.' + offlineModeSetting)
});

MenuRegistry.appendMenuItem(MenuId.MenubarPreferencesMenu, {
	group: '5_offline',
	command: {
		id: DisableOfflineMode.ID,
		title: localize({ key: 'miDisableOfflineMode', comment: ['&& denotes a mnemonic'] }, "Disable &&Offline Mode")
	},
	order: 1,
	when: ContextKeyExpr.has('config.' + offlineModeSetting)
});

CommandsRegistry.registerCommand(EnableOfflineMode.ID, serviceAccesor => {
	serviceAccesor.get(IInstantiationService).createInstance(EnableOfflineMode, EnableOfflineMode.ID, EnableOfflineMode.LABEL).run();
});
MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
	command: {
		id: EnableOfflineMode.ID,
		title: 'Preferences: Enable Offline Mode'
	},
	when: ContextKeyExpr.not('config.' + offlineModeSetting)
});

CommandsRegistry.registerCommand(DisableOfflineMode.ID, serviceAccesor => {
	serviceAccesor.get(IInstantiationService).createInstance(DisableOfflineMode, DisableOfflineMode.ID, DisableOfflineMode.LABEL).run();
});
MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
	command: {
		id: DisableOfflineMode.ID,
		title: 'Preferences: Disable Offline Mode'
	},
	when: ContextKeyExpr.has('config.' + offlineModeSetting)
});

CommandsRegistry.registerCommand(NotifyUnsupportedFeatureInOfflineMode.ID, serviceAccesor => {
	serviceAccesor.get(IInstantiationService).createInstance(NotifyUnsupportedFeatureInOfflineMode, NotifyUnsupportedFeatureInOfflineMode.ID, '').run();
});