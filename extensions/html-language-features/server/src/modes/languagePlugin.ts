/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { forEachEmbeddedCode } from '@volar/language-core';
import type { CodeMapping, LanguagePlugin, TypeScriptExtraServiceScript, VirtualCode } from '@volar/language-server';
import type * as ts from 'typescript';
import { getLanguageService } from 'vscode-html-languageservice';
import { URI } from 'vscode-uri';
import { EmbeddedRegion, getDocumentRegions } from './embeddedSupport';

const htmlLanguageService = getLanguageService();

export const htmlLanguagePlugin: LanguagePlugin<URI> = {
	getLanguageId(uri) {
		if (uri.toString().endsWith('.html')) {
			return 'html';
		}
		return undefined;
	},
	createVirtualCode(_uri, languageId, snapshot) {
		if (languageId !== 'typescript' && languageId !== 'javascript' && languageId !== 'typescriptreact' && languageId !== 'javascriptreact' && languageId !== 'json') {
			return createHtmlVirtualCode(snapshot);
		}
		return undefined;
	},
	typescript: {
		extraFileExtensions: [],
		getServiceScript(rootCode) {
			for (const code of forEachEmbeddedCode(rootCode)) {
				if (code.id === 'global_script') {
					return {
						code,
						extension: '.js',
						scriptKind: 1,
					};
				}
			}
			return undefined;
		},
		getExtraServiceScripts(fileName, rootCode) {
			const extraScripts: TypeScriptExtraServiceScript[] = [];
			for (const code of forEachEmbeddedCode(rootCode)) {
				if (code.id.startsWith('javascript_')) {
					extraScripts.push({
						fileName: fileName + '.' + code.id.split('_')[1] + '.js',
						code,
						extension: '.js',
						scriptKind: 1,
					});
				}
				else if (code.id.startsWith('typescript_')) {
					extraScripts.push({
						fileName: fileName + '.' + code.id.split('_')[1] + '.ts',
						code,
						extension: '.ts',
						scriptKind: 3,
					});
				}
			}
			return extraScripts;
		},
	},
};

function createHtmlVirtualCode(snapshot: ts.IScriptSnapshot): VirtualCode {
	const documentRegions = getDocumentRegions(htmlLanguageService, snapshot.getText(0, snapshot.getLength()));
	const indexMap: Record<string, number> = {};

	return {
		id: 'root',
		languageId: 'html',
		snapshot,
		mappings: [{
			sourceOffsets: [0],
			generatedOffsets: [0],
			lengths: [snapshot.getLength()],
			data: { verification: true, completion: true, semantic: true, navigation: true, structure: true, format: true },
		}],
		embeddedCodes: [
			...getGlobalScriptVirtualCodes(),
			...getOtherLanguageVirtualCodes(),
		],
	};

	function* getGlobalScriptVirtualCodes(): Generator<VirtualCode> {
		const globalScripts = documentRegions
			.getEmbeddedRegions()
			.filter(isGlobalScript)

		if (globalScripts.length === 1) {
			const globalScript = globalScripts[0];
			yield {
				languageId: 'javascript',
				id: 'global_script',
				snapshot: {
					getText(start, end) {
						return globalScript.content.substring(start, end);
					},
					getLength() {
						return globalScript.content.length;
					},
					getChangeRange() {
						return undefined;
					},
				},
				mappings: [{
					sourceOffsets: [globalScript.start],
					generatedOffsets: [globalScript.generatedStart],
					lengths: [globalScript.length],
					data: { verification: true, completion: true, semantic: true, navigation: true, structure: true, format: true },
				}],
			};
		}
		else if (globalScripts.length >= 2) {
			let text = '';
			const mappings: CodeMapping[] = [];
			for (const globalScript of globalScripts) {
				mappings.push({
					sourceOffsets: [globalScript.start],
					generatedOffsets: [text.length + globalScript.generatedStart],
					lengths: [globalScript.length],
					data: { verification: true, completion: true, semantic: true, navigation: true },
				});
				text += globalScript.content;
				indexMap['global_script'] ??= 0;
				yield {
					languageId: globalScript.languageId!,
					id: 'global_script_' + indexMap['global_script'] + '_syntax',
					snapshot: {
						getText(start, end) {
							return globalScript.content.substring(start, end);
						},
						getLength() {
							return globalScript.content.length;
						},
						getChangeRange() {
							return undefined;
						},
					},
					mappings: [{
						sourceOffsets: [globalScript.start],
						generatedOffsets: [globalScript.generatedStart],
						lengths: [globalScript.length],
						data: { structure: true, format: true },
					}],
				};
				indexMap['global_script']++;
			}
			yield {
				languageId: 'javascript',
				id: 'global_script',
				snapshot: {
					getText(start, end) {
						return text.substring(start, end);
					},
					getLength() {
						return text.length;
					},
					getChangeRange() {
						return undefined;
					},
				},
				mappings,
			};
		}
	}

	function* getOtherLanguageVirtualCodes(): Generator<VirtualCode> {
		for (const documentRegion of documentRegions.getEmbeddedRegions()) {
			if (!documentRegion.languageId || isGlobalScript(documentRegion)) {
				continue;
			}
			indexMap[documentRegion.languageId] ??= 0;
			yield {
				languageId: documentRegion.languageId,
				id: documentRegion.languageId + '_' + indexMap[documentRegion.languageId],
				snapshot: {
					getText(start, end) {
						return documentRegion.content.substring(start, end);
					},
					getLength() {
						return documentRegion.content.length;
					},
					getChangeRange() {
						return undefined;
					},
				},
				mappings: [{
					sourceOffsets: [documentRegion.start],
					generatedOffsets: [documentRegion.generatedStart],
					lengths: [documentRegion.length],
					data: documentRegion.attributeValue
						? { completion: true, semantic: true, navigation: true, structure: true }
						: { verification: true, completion: true, semantic: true, navigation: true, structure: true, format: true },
				}],
			};
			indexMap[documentRegion.languageId]++;
		}
	}
}

function isGlobalScript(region: EmbeddedRegion) {
	return region.languageId === 'javascript' && !region.moduleScript;
}
