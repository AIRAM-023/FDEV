/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { v4 as uuid } from 'uuid';
import { Keychain } from './common/keychain';
import { GitHubEnterpriseServer, GitHubServer, IGitHubServer } from './githubServer';
import { arrayEquals } from './common/utils';
import { ExperimentationTelemetry } from './experimentationService';
import TelemetryReporter from '@vscode/extension-telemetry';

interface SessionData {
	id: string;
	account?: {
		label?: string;
		displayName?: string;
		id: string;
	};
	scopes: string[];
	accessToken: string;
}

export enum AuthProviderType {
	github = 'github',
	githubEnterprise = 'github-enterprise'
}

export class GitHubAuthenticationProvider implements vscode.AuthenticationProvider, vscode.Disposable {
	private _sessionChangeEmitter = new vscode.EventEmitter<vscode.AuthenticationProviderAuthenticationSessionsChangeEvent>();
	private _githubServer: IGitHubServer;
	private _telemetryReporter: ExperimentationTelemetry;

	private _keychain: Keychain = new Keychain(this.context, `${this.type}.auth`);
	private _sessionsPromise: Promise<vscode.AuthenticationSession[]>;
	private _accountsSeen = new Set<string>();
	private _disposable: vscode.Disposable;

	constructor(private readonly context: vscode.ExtensionContext, private readonly type: AuthProviderType) {
		const { name, version, aiKey } = context.extension.packageJSON as { name: string; version: string; aiKey: string };
		this._telemetryReporter = new ExperimentationTelemetry(context, new TelemetryReporter(name, version, aiKey));

		if (this.type === AuthProviderType.github) {
			this._githubServer = new GitHubServer(
				// We only can use the Device Code flow when we have a full node environment because of CORS.
				context.extension.extensionKind === vscode.ExtensionKind.Workspace || vscode.env.uiKind === vscode.UIKind.Desktop,
				this.context,
				this._telemetryReporter);
		} else {
			this._githubServer = new GitHubEnterpriseServer(this.context, this._telemetryReporter);
		}

		// Contains the current state of the sessions we have available.
		this._sessionsPromise = this.readSessions().then((sessions) => {
			// fire telemetry after a second to allow the workbench to focus on loading
			setTimeout(() => sessions.forEach(s => this.afterSessionLoad(s)), 1000);
			return sessions;
		});

		this._disposable = vscode.Disposable.from(
			this._telemetryReporter,
			this._githubServer,
			vscode.authentication.registerAuthenticationProvider(type, this._githubServer.friendlyName, this, { supportsMultipleAccounts: false }),
			this.context.secrets.onDidChange(() => this.checkForUpdates())
		);
	}

	dispose() {
		this._disposable.dispose();
	}

	get onDidChangeSessions() {
		return this._sessionChangeEmitter.event;
	}

	async getSessions(scopes?: string[]): Promise<vscode.AuthenticationSession[]> {
		// For GitHub scope list, order doesn't matter so we immediately sort the scopes
		const sortedScopes = scopes?.sort() || [];
		this.context.log(vscode.LogLevel.Info, `Getting sessions for ${sortedScopes.length ? sortedScopes.join(',') : 'all scopes'}...`);
		const sessions = await this._sessionsPromise;
		const finalSessions = sortedScopes.length
			? sessions.filter(session => arrayEquals([...session.scopes].sort(), sortedScopes))
			: sessions;

		this.context.log(vscode.LogLevel.Info, `Got ${finalSessions.length} sessions for ${sortedScopes?.join(',') ?? 'all scopes'}...`);
		return finalSessions;
	}

	private async afterSessionLoad(session: vscode.AuthenticationSession): Promise<void> {
		// We only want to fire a telemetry if we haven't seen this account yet in this session.
		if (!this._accountsSeen.has(session.account.id)) {
			this._accountsSeen.add(session.account.id);
			this._githubServer.sendAdditionalTelemetryInfo(session.accessToken);
		}
	}

	private async checkForUpdates() {
		const previousSessions = await this._sessionsPromise;
		this._sessionsPromise = this.readSessions();
		const storedSessions = await this._sessionsPromise;

		const added: vscode.AuthenticationSession[] = [];
		const removed: vscode.AuthenticationSession[] = [];

		storedSessions.forEach(session => {
			const matchesExisting = previousSessions.some(s => s.id === session.id);
			// Another window added a session to the keychain, add it to our state as well
			if (!matchesExisting) {
				this.context.log(vscode.LogLevel.Info, 'Adding session found in keychain');
				added.push(session);
			}
		});

		previousSessions.forEach(session => {
			const matchesExisting = storedSessions.some(s => s.id === session.id);
			// Another window has logged out, remove from our state
			if (!matchesExisting) {
				this.context.log(vscode.LogLevel.Info, 'Removing session no longer found in keychain');
				removed.push(session);
			}
		});

		if (added.length || removed.length) {
			this._sessionChangeEmitter.fire({ added, removed, changed: [] });
		}
	}

	private async readSessions(): Promise<vscode.AuthenticationSession[]> {
		let sessionData: SessionData[];
		try {
			this.context.log(vscode.LogLevel.Info, 'Reading sessions from keychain...');
			const storedSessions = await this._keychain.getToken();
			if (!storedSessions) {
				return [];
			}
			this.context.log(vscode.LogLevel.Info, 'Got stored sessions!');

			try {
				sessionData = JSON.parse(storedSessions);
			} catch (e) {
				await this._keychain.deleteToken();
				throw e;
			}
		} catch (e) {
			this.context.log(vscode.LogLevel.Error, `Error reading token: ${e}`);
			return [];
		}

		// TODO: eventually remove this Set because we should only have one session per set of scopes.
		const scopesSeen = new Set<string>();
		const sessionPromises = sessionData.map(async (session: SessionData) => {
			// For GitHub scope list, order doesn't matter so we immediately sort the scopes
			const scopesStr = [...session.scopes].sort().join(' ');
			if (scopesSeen.has(scopesStr)) {
				return undefined;
			}
			let userInfo: { id: string; accountName: string } | undefined;
			if (!session.account) {
				try {
					userInfo = await this._githubServer.getUserInfo(session.accessToken);
					this.context.log(vscode.LogLevel.Info, `Verified session with the following scopes: ${scopesStr}`);
				} catch (e) {
					// Remove sessions that return unauthorized response
					if (e.message === 'Unauthorized') {
						return undefined;
					}
				}
			}

			this.context.log(vscode.LogLevel.Trace, `Read the following session from the keychain with the following scopes: ${scopesStr}`);
			scopesSeen.add(scopesStr);
			return {
				id: session.id,
				account: {
					label: session.account
						? session.account.label ?? session.account.displayName ?? '<unknown>'
						: userInfo?.accountName ?? '<unknown>',
					id: session.account?.id ?? userInfo?.id ?? '<unknown>'
				},
				// we set this to session.scopes to maintain the original order of the scopes requested
				// by the extension that called getSession()
				scopes: session.scopes,
				accessToken: session.accessToken
			};
		});

		const verifiedSessions = (await Promise.allSettled(sessionPromises))
			.filter(p => p.status === 'fulfilled')
			.map(p => (p as PromiseFulfilledResult<vscode.AuthenticationSession | undefined>).value)
			.filter(<T>(p?: T): p is T => Boolean(p));

		this.context.log(vscode.LogLevel.Info, `Got ${verifiedSessions.length} verified sessions.`);
		if (verifiedSessions.length !== sessionData.length) {
			await this.storeSessions(verifiedSessions);
		}

		return verifiedSessions;
	}

	private async storeSessions(sessions: vscode.AuthenticationSession[]): Promise<void> {
		this.context.log(vscode.LogLevel.Info, `Storing ${sessions.length} sessions...`);
		this._sessionsPromise = Promise.resolve(sessions);
		await this._keychain.setToken(JSON.stringify(sessions));
		this.context.log(vscode.LogLevel.Info, `Stored ${sessions.length} sessions!`);
	}

	public async createSession(scopes: string[]): Promise<vscode.AuthenticationSession> {
		try {
			// For GitHub scope list, order doesn't matter so we use a sorted scope to determine
			// if we've got a session already.
			const sortedScopes = [...scopes].sort();

			/* __GDPR__
				"login" : {
					"owner": "TylerLeonhardt",
					"comment": "Used to determine how much usage the GitHub Auth Provider gets.",
					"scopes": { "classification": "PublicNonPersonalData", "purpose": "FeatureInsight", "comment": "Used to determine what scope combinations are being requested." }
				}
			*/
			this._telemetryReporter?.sendTelemetryEvent('login', {
				scopes: JSON.stringify(scopes),
			});


			const scopeString = sortedScopes.join(' ');
			const token = await this._githubServer.login(scopeString);
			const session = await this.tokenToSession(token, scopes);
			this.afterSessionLoad(session);

			const sessions = await this._sessionsPromise;
			const sessionIndex = sessions.findIndex(s => s.id === session.id || arrayEquals([...s.scopes].sort(), sortedScopes));
			if (sessionIndex > -1) {
				sessions.splice(sessionIndex, 1, session);
			} else {
				sessions.push(session);
			}
			await this.storeSessions(sessions);

			this._sessionChangeEmitter.fire({ added: [session], removed: [], changed: [] });

			this.context.log(vscode.LogLevel.Info, 'Login success!');

			return session;
		} catch (e) {
			// If login was cancelled, do not notify user.
			if (e === 'Cancelled' || e.message === 'Cancelled') {
				/* __GDPR__
					"loginCancelled" : { "owner": "TylerLeonhardt", "comment": "Used to determine how often users cancel the login flow." }
				*/
				this._telemetryReporter?.sendTelemetryEvent('loginCancelled');
				throw e;
			}

			/* __GDPR__
				"loginFailed" : { "owner": "TylerLeonhardt", "comment": "Used to determine how often users run into an error login flow." }
			*/
			this._telemetryReporter?.sendTelemetryEvent('loginFailed');

			vscode.window.showErrorMessage(`Sign in failed: ${e}`);
			this.context.log(vscode.LogLevel.Error, e);
			throw e;
		}
	}

	private async tokenToSession(token: string, scopes: string[]): Promise<vscode.AuthenticationSession> {
		const userInfo = await this._githubServer.getUserInfo(token);
		return {
			id: uuid(),
			accessToken: token,
			account: { label: userInfo.accountName, id: userInfo.id },
			scopes
		};
	}

	public async removeSession(id: string) {
		try {
			/* __GDPR__
				"logout" : { "owner": "TylerLeonhardt", "comment": "Used to determine how often users log out of an account." }
			*/
			this._telemetryReporter?.sendTelemetryEvent('logout');

			this.context.log(vscode.LogLevel.Info, `Logging out of ${id}`);

			const sessions = await this._sessionsPromise;
			const sessionIndex = sessions.findIndex(session => session.id === id);
			if (sessionIndex > -1) {
				const session = sessions[sessionIndex];
				sessions.splice(sessionIndex, 1);

				await this.storeSessions(sessions);

				this._sessionChangeEmitter.fire({ added: [], removed: [session], changed: [] });
			} else {
				this.context.log(vscode.LogLevel.Error, 'Session not found');
			}
		} catch (e) {
			/* __GDPR__
				"logoutFailed" : { "owner": "TylerLeonhardt", "comment": "Used to determine how often logging out of an account fails." }
			*/
			this._telemetryReporter?.sendTelemetryEvent('logoutFailed');

			vscode.window.showErrorMessage(`Sign out failed: ${e}`);
			this.context.log(vscode.LogLevel.Error, e);
			throw e;
		}
	}
}
