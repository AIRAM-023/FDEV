/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';
// Increase max listeners for event emitters
require('events').EventEmitter.defaultMaxListeners = 100;

<<<<<<< HEAD
const gulp = require('gulp');
const util = require('./build/lib/util');
const path = require('path');
const compilation = require('./build/lib/compilation');
const { monacoTypecheckTask/* , monacoTypecheckWatchTask */ } = require('./build/gulpfile.editor');
const { compileExtensionsTask, watchExtensionsTask } = require('./build/gulpfile.extensions');

=======
const gulp = require('gulp'),
	  json = require('gulp-json-editor'),
	  buffer = require('gulp-buffer'),
	  tsb = require('gulp-tsb'),
	  filter = require('gulp-filter'),
	  mocha = require('gulp-mocha'),
	  es = require('event-stream'),
	  watch = require('./build/lib/watch'),
	  nls = require('./build/lib/nls'),
	  util = require('./build/lib/util'),
	  reporter = require('./build/lib/reporter')(),
	  remote = require('gulp-remote-src'),
	  zip = require('gulp-vinyl-zip'),
	  path = require('path'),
	  bom = require('gulp-bom'),
	  sourcemaps = require('gulp-sourcemaps'),
	  _ = require('underscore'),
	  assign = require('object-assign'),
	  monacodts = require('./build/monaco/api'),
	  fs = require('fs'),
	  glob = require('glob'),
	  rootDir = path.join(__dirname, 'src'),
	  options = require('./src/tsconfig.json').compilerOptions;
options.verbose = false;
options.sourceMap = true;
options.rootDir = rootDir;
options.sourceRoot = util.toFileUri(rootDir);
function createCompile(build, emitError) {
	const opts = _.clone(options);
	opts.inlineSources = !!build;
	opts.noFilesystemLookup = true;
	const ts = tsb.create(opts, null, null, err => reporter(err.toString()));
	return function (token) {
		const utf8Filter = util.filter(data => /(\/|\\)test(\/|\\).*utf8/.test(data.path));
		const tsFilter = util.filter(data => /\.ts$/.test(data.path));
		const noDeclarationsFilter = util.filter(data => !(/\.d\.ts$/.test(data.path)));
		const input = es.through();
		const output = input
			.pipe(utf8Filter)
			.pipe(bom())
			.pipe(utf8Filter.restore)
			.pipe(tsFilter)
			.pipe(util.loadSourcemaps())
			.pipe(ts(token))
			.pipe(noDeclarationsFilter)
			.pipe(build ? nls() : es.through())
			.pipe(noDeclarationsFilter.restore)
			.pipe(sourcemaps.write('.', {
				addComment: false,
				includeContent: !!build,
				sourceRoot: options.sourceRoot
			}))
			.pipe(tsFilter.restore)
			.pipe(reporter.end(emitError));
		return es.duplex(input, output);
	};
}
function compileTask(out, build) {
	const compile = createCompile(build, true);
	return function () {
		const src = es.merge(
			gulp.src('src/**', { base: 'src' }),
			gulp.src('node_modules/typescript/lib/lib.d.ts')
		);
		return src
			.pipe(compile())
			.pipe(gulp.dest(out))
			.pipe(monacodtsTask(out, false));
	};
}
function watchTask(out, build) {
	const compile = createCompile(build);
	return function (){
		const src = es.merge(
			gulp.src('src/**', { base: 'src' }),
			gulp.src('node_modules/typescript/lib/lib.d.ts'));
		const watchSrc = watch('src/**', { base: 'src' });
		return watchSrc
			.pipe(util.incremental(compile, src, true))
			.pipe(gulp.dest(out))
			.pipe(monacodtsTask(out, true));
	};
}
function monacodtsTask(out, isWatch) {
	let timer = -1;
	const runSoon = function(howSoon) {
		if (timer !== -1) {
			clearTimeout(timer);
			timer = -1;
		}
		timer = setTimeout(function() {
			timer = -1;
			runNow();
		}, howSoon);
	};
	const runNow = function() {
		if (timer !== -1) {
			clearTimeout(timer);
			timer = -1;
		}
		if (reporter.hasErrors()) {
		 	monacodts.complainErrors();
		 	return;
		 }
		const result = monacodts.run(out);
		if (!result.isTheSame) {
			if (isWatch) {
				fs.writeFileSync(result.filePath, result.content);
			} else {
				resultStream.emit('error', 'monaco.d.ts is no longer up to date. Please run gulp watch and commit the new file.');
			}
		}
	};
	let resultStream;
	if (isWatch) {
		const filesToWatchMap = {};
		monacodts.getFilesToWatch(out).forEach(function(filePath) {
			filesToWatchMap[path.normalize(filePath)] = true;
		});
		watch('build/monaco/*').pipe(es.through(function() {runSoon(5000);}));
		resultStream = es.through(function(data) {
			const filePath = path.normalize(data.path);
			if (filesToWatchMap[filePath]) {runSoon(5000)}
			this.emit('data', data);
		});
	} else {
		resultStream = es.through(null, function() {runNow();this.emit('end');});
	}
	return resultStream;
}
>>>>>>>  commiy
// Fast compile for development time
const compileClientTask = util.task.series(util.rimraf('out'), compilation.compileTask('src', 'out', false));
compileClientTask.displayName = 'compile-client';
gulp.task(compileClientTask.displayName, compileClientTask);

const watchClientTask = util.task.series(util.rimraf('out'), compilation.watchTask('out', false));
watchClientTask.displayName = 'watch-client';
gulp.task(watchClientTask.displayName, watchClientTask);

// All
<<<<<<< HEAD
const compileTask = util.task.parallel(monacoTypecheckTask, compileClientTask, compileExtensionsTask);
compileTask.displayName = 'compile';
gulp.task(compileTask.displayName, compileTask);

gulp.task('watch', util.task.parallel(/* monacoTypecheckWatchTask, */ watchClientTask, watchExtensionsTask));

// Default
gulp.task('default', compileTask);

process.on('unhandledRejection', (reason, p) => {
	console.log('Unhandled Rejection at: Promise', p, 'reason:', reason);
	process.exit(1);
});

// Load all the gulpfiles only if running tasks other than the editor tasks
const build = path.join(__dirname, 'build');
require('glob').sync('gulpfile.*.js', { cwd: build })
	.forEach(f => require(`./build/${f}`));
=======
gulp.task('clean', ['clean-client', 'clean-extensions']);
gulp.task('compile', ['compile-client', 'compile-extensions']);
gulp.task('watch', ['watch-client', 'watch-extensions']);

// All Build
gulp.task('clean-build', ['clean-client-build', 'clean-extensions-build']);
gulp.task('compile-build', ['compile-client-build', 'compile-extensions-build']);
gulp.task('watch-build', ['watch-client-build', 'watch-extensions-build']);

gulp.task('test', function () {
	return gulp.src('test/all.js')
		.pipe(mocha({ ui: 'tdd', delay: true }))
		.once('end', function () { process.exit(); });
});
gulp.task('mixin', function () {
	const repo = process.env['VSCODE_MIXIN_REPO'];
	if (!repo) {
		console.log('Missing VSCODE_MIXIN_REPO, skipping mixin');
		return;
	}
	const quality = process.env['VSCODE_QUALITY'];
	if (!quality) {
		console.log('Missing VSCODE_QUALITY, skipping mixin');
		return;
	}
	const url = 'https://github.com/' + repo + '/archive/master.zip',
		  opts = { base: '' },
		  username = process.env['VSCODE_MIXIN_USERNAME'],
		  password = process.env['VSCODE_MIXIN_PASSWORD'];
	if (username || password) {
		opts.auth = { user: username || '', pass: password || '' };
	}
	console.log('Mixing in sources from \'' + url + '\':');

	let all = remote(url, opts)
		.pipe(zip.src())
		.pipe(filter(function (f) { return !f.isDirectory(); }))
		.pipe(util.rebase(1));
	if (quality) {
		const build = all.pipe(filter('build/**'));
		const productJsonFilter = filter('product.json', { restore: true });
		const mixin = all
			.pipe(filter('quality/' + quality + '/**'))
			.pipe(util.rebase(2))
			.pipe(productJsonFilter)
			.pipe(buffer())
			.pipe(json(function (patch) {
				const original = require('./product.json');
				return assign(original, patch);
			}))
			.pipe(productJsonFilter.restore);
		all = es.merge(build, mixin);
	}
	return all
		.pipe(es.mapSync(function (f) {
			console.log(f.relative);
			return f;
		}))
		.pipe(gulp.dest('.'));
});
const build = path.join(__dirname, 'build');
glob.sync('gulpfile.*.js', { cwd: build })
	.forEach(f => require(`./build/${ f }`));
>>>>>>>  commiy
