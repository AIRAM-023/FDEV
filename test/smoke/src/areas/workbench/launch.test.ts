/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import minimist = require('minimist');
import * as path from 'path';
import { Application } from '../../../../automation';
import { afterSuite, startApp } from '../../utils';

export function setup(args: minimist.ParsedArgs) {

	describe('Launch', () => {

		let app: Application | undefined;

		afterSuite(args, () => app);

		it(`verifies that application launches when user data directory has non-ascii characters`, async function () {
			app = await startApp(args, this.defaultOptions, async opts => {
				opts.userDataDir = path.join(this.defaultOptions.userDataDir, 'ø');

				return opts;
			});

			await app.stop();
			app = undefined;
		});
	});
}
