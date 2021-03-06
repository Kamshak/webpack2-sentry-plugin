import fs from 'fs'
import path from 'path'

import { cleanUpRelease, fetchRelease, fetchFiles } from './helpers/sentry'
import { createWebpackConfig, runWebpack, OUTPUT_PATH } from './helpers/webpack'
import {
	expectNoFailure,
	expectReleaseContainsFile,
	expectReleaseDoesNotContainFile
} from './helpers/assertion'

const SourceMapDevToolPlugin = require('webpack/lib/SourceMapDevToolPlugin')

function ensureOutputPath() {
	if (!fs.existsSync(OUTPUT_PATH)) {
		fs.mkdirSync(OUTPUT_PATH)
	}
}

// Don't mock HTTP requests - testing the correctness of the integration
jest.unmock('request-promise')

beforeEach(ensureOutputPath)

describe('creating Sentry release', () => {
	afterAll(cleanUpRelease('string-release'))
	afterAll(cleanUpRelease('function-release'))

	it('with string version', () => {
		const release = 'string-release'

		return runWebpack(createWebpackConfig({ release }))
			.then(() => fetchRelease(release))
			.then(({ version }) => expect(version).toEqual(release))
			.catch(expectNoFailure('Release not found'))
	})

	it('with version from function', () => {
		const release = 'function-release'

		return runWebpack(createWebpackConfig({
			release: () => release
		}))
		.then(() => fetchRelease(release))
		.then(({ version }) => expect(version).toEqual(release))
		.catch(expectNoFailure('Release not found'))
	})
})

describe('uploading files to Sentry release', () => {
	const release = 'test-release'

	afterEach(cleanUpRelease(release))

	it('uploads source and matching source map', () => {
		return runWebpack(createWebpackConfig({ release }))
			.then(() => fetchFiles(release))
			.then(expectReleaseContainsFile('~/index.bundle.js'))
			.then(expectReleaseContainsFile('~/index.bundle.js.map'))
	})

	it('uploads source and matching source map with output.sourceMapFilename', () => {
		const webpackConfig = createWebpackConfig({ release })
		webpackConfig.output.sourceMapFilename = 'renamed-the-sourcemap.map'

		return runWebpack(webpackConfig)
			.then(() => fetchFiles(release))
			.then(expectReleaseContainsFile('~/index.bundle.js'))
			.then(expectReleaseContainsFile('~/renamed-the-sourcemap.map'))
	})

	it('uploads source and matching source map with SourceMapDevToolPlugin', () => {
		const webpackConfig = createWebpackConfig({ release })
		delete webpackConfig.devtool
		webpackConfig.plugins.push(new SourceMapDevToolPlugin({
			filename: 'renamed-the-sourcemap.map'
		}))

		return runWebpack(webpackConfig)
			.then(() => fetchFiles(release))
			.then(expectReleaseContainsFile('~/index.bundle.js'))
			.then(expectReleaseContainsFile('~/renamed-the-sourcemap.map'))
	})

	it('uploads source and sourcemap with devtool: hidden-source-map', () => {
		return runWebpack(createWebpackConfig({ release }, { devtool: 'hidden-source-map'}))
			.then(() => fetchFiles(release))
			.then(expectReleaseContainsFile('~/index.bundle.js'))
			.then(expectReleaseContainsFile('~/index.bundle.js.map'))
	})

	it('uploads source only with devtool: eval', () => {
		return runWebpack(createWebpackConfig({ release }, { devtool: 'eval'}))
			.then(() => fetchFiles(release))
			.then(expectReleaseContainsFile('~/index.bundle.js'))
			.then(expectReleaseDoesNotContainFile('~/index.bundle.js.map'))
	})

	it('filters files based on include', () => {
		return runWebpack(createWebpackConfig({
			release,
			include: /foo\.bundle\.js/
		}, {
			entry: {
				foo: path.resolve(__dirname, 'fixtures/foo.js'),
				bar: path.resolve(__dirname, 'fixtures/bar.js')
			}
		}))
		.then(() => fetchFiles(release))
		.then(expectReleaseContainsFile('~/foo.bundle.js'))
		.then(expectReleaseContainsFile('~/foo.bundle.js.map'))
		.then(expectReleaseDoesNotContainFile('~/bar.bundle.js'))
		.then(expectReleaseDoesNotContainFile('~/bar.bundle.js.map'))
	})

	it('filters files based on exclude', () => {
		return runWebpack(createWebpackConfig({
			release,
			exclude: /foo\.bundle\.js/
		}, {
			entry: {
				foo: path.resolve(__dirname, 'fixtures/foo.js'),
				bar: path.resolve(__dirname, 'fixtures/bar.js')
			}
		}))
		.then(() => fetchFiles(release))
		.then(expectReleaseDoesNotContainFile('foo.bundle.js'))
		.then(expectReleaseDoesNotContainFile('foo.bundle.js.map'))
	})

	it('transforms filename', () => {
		return runWebpack(createWebpackConfig({
			release,
			include: /index\.bundle\.js\.map/,
			filenameTransform: (filename) => {
				return `a-filename-prefix-${filename}`
			}
		}))
		.then(() => fetchFiles(release))
		.then(expectReleaseContainsFile('a-filename-prefix-index.bundle.js.map'))
	})
})

