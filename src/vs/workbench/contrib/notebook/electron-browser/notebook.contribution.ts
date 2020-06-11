/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isMacintosh } from 'vs/base/common/platform';
import { CoreEditingCommands } from 'vs/editor/browser/controller/coreCommands';
import { CopyAction, CutAction, PasteAction } from 'vs/editor/contrib/clipboard/clipboard';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { getActiveNotebookEditor } from 'vs/workbench/contrib/notebook/browser/contrib/coreActions';
import { ElectronWebviewBasedWebview } from 'vs/workbench/contrib/webview/electron-browser/webviewElement';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';

function getFocusedElectronBasedWebviewDelegate(accessor: ServicesAccessor): ElectronWebviewBasedWebview | undefined {
	const editorService = accessor.get(IEditorService);
	const editor = getActiveNotebookEditor(editorService);
	if (!editor?.hasFocus()) {
		return;
	}

	const webview = editor?.getInnerWebview();
	if (webview && webview instanceof ElectronWebviewBasedWebview) {
		return webview;
	}
	return;
}

if (isMacintosh) {
	function withWebview(accessor: ServicesAccessor, f: (webviewe: ElectronWebviewBasedWebview) => void) {
		const webview = getFocusedElectronBasedWebviewDelegate(accessor);
		if (webview) {
			f(webview);
			return true;
		}
		return false;
	}

	CoreEditingCommands.Undo.overrides.register(accessor => {
		return withWebview(accessor, webview => webview.undo());
	});

	CoreEditingCommands.Redo.overrides.register(accessor => {
		return withWebview(accessor, webview => webview.redo());
	});

	CopyAction?.overrides.register(accessor => {
		return withWebview(accessor, webview => webview.copy());
	});

	PasteAction?.overrides.register(accessor => {
		return withWebview(accessor, webview => webview.paste());
	});

	CutAction?.overrides.register(accessor => {
		return withWebview(accessor, webview => webview.cut());
	});
}
