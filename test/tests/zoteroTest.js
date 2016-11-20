"use strict";

describe("Zotero Core Functions", function () {
	var tmpDir, oldDir, newDir, dbFilename, oldDBFile, newDBFile, oldStorageDir, newStorageDir,
		oldTranslatorsDir, newTranslatorsDir, translatorName1, translatorName2,
		oldStorageDir1, newStorageDir1, storageFile1, oldStorageDir2, newStorageDir2, storageFile2,
		str1, str2, str3, str4, str5, str6,
		oldMigrationMarker, newMigrationMarker,
		stub1, stub2, stub3;
	
	before(function* () {
		tmpDir = yield getTempDirectory();
		oldDir = OS.Path.join(tmpDir, "old");
		newDir = OS.Path.join(tmpDir, "new");
		dbFilename = Zotero.getDatabaseFilename();
		oldDBFile = OS.Path.join(oldDir, dbFilename);
		newDBFile = OS.Path.join(newDir, dbFilename);
		oldStorageDir = OS.Path.join(oldDir, "storage");
		newStorageDir = OS.Path.join(newDir, "storage");
		oldTranslatorsDir = OS.Path.join(oldDir, "translators");
		newTranslatorsDir = OS.Path.join(newDir, "translators");
		translatorName1 = 'a.js';
		translatorName2 = 'b.js';
		oldStorageDir1 = OS.Path.join(oldStorageDir, 'AAAAAAAA');
		newStorageDir1 = OS.Path.join(newStorageDir, 'AAAAAAAA');
		storageFile1 = 'test.pdf';
		oldStorageDir2 = OS.Path.join(oldStorageDir, 'BBBBBBBB');
		newStorageDir2 = OS.Path.join(newStorageDir, 'BBBBBBBB');
		storageFile2 = 'test.html';
		str1 = '1';
		str2 = '2';
		str3 = '3';
		str4 = '4';
		str5 = '5';
		str6 = '6';
		oldMigrationMarker = OS.Path.join(oldDir, Zotero.DATA_DIR_MIGRATION_MARKER);
		newMigrationMarker = OS.Path.join(newDir, Zotero.DATA_DIR_MIGRATION_MARKER);
	});
	
	beforeEach(function* () {
		stub1 = sinon.stub(Zotero, "setDataDirectory");
	});
	
	afterEach(function* () {
		yield removeDir(oldDir);
		yield removeDir(newDir);
		Zotero._cacheDataDirectory(false);
		
		stub1.restore();
	});
	
	var disableCommandMode = function () {
		// Force non-mv mode
		var origFunc = OS.File.exists;
		stub2 = sinon.stub(OS.File, "exists", function (path) {
			if (path == '/bin/mv') {
				return Zotero.Promise.resolve(false);
			}
			else {
				return origFunc(path);
			}
		});
	};
	
	var resetCommandMode = function () {
		stub2.restore();
	};
	
	var populateDataDirectory = Zotero.Promise.coroutine(function* (dir, srcDir) {
		yield OS.File.makeDir(dir, { unixMode: 0o755 });
		let storageDir = OS.Path.join(dir, 'storage');
		let storageDir1 = OS.Path.join(storageDir, 'AAAAAAAA');
		let storageDir2 = OS.Path.join(storageDir, 'BBBBBBBB');
		let translatorsDir = OS.Path.join(dir, 'translators');
		let migrationMarker = OS.Path.join(dir, Zotero.DATA_DIR_MIGRATION_MARKER);
		
		// Database
		yield Zotero.File.putContentsAsync(OS.Path.join(dir, dbFilename), str1);
		// Database backup
		yield Zotero.File.putContentsAsync(OS.Path.join(dir, dbFilename + '.bak'), str2);
		// 'storage' directory
		yield OS.File.makeDir(storageDir, { unixMode: 0o755 });
		// 'storage' folders
		yield OS.File.makeDir(storageDir1, { unixMode: 0o755 });
		yield Zotero.File.putContentsAsync(OS.Path.join(storageDir1, storageFile1), str2);
		yield OS.File.makeDir(storageDir2, { unixMode: 0o755 });
		yield Zotero.File.putContentsAsync(OS.Path.join(storageDir2, storageFile2), str3);
		// 'translators' and some translators
		yield OS.File.makeDir(translatorsDir, { unixMode: 0o755 });
		yield Zotero.File.putContentsAsync(OS.Path.join(translatorsDir, translatorName1), str4);
		yield Zotero.File.putContentsAsync(OS.Path.join(translatorsDir, translatorName2), str5);
		// Migration marker
		yield Zotero.File.putContentsAsync(migrationMarker, srcDir || dir);
	});
	
	var checkMigration = Zotero.Promise.coroutine(function* (options = {}) {
		if (!options.skipOldDir) {
			assert.isFalse(yield OS.File.exists(oldDir));
		}
		yield assert.eventually.equal(Zotero.File.getContentsAsync(newDBFile), str1);
		yield assert.eventually.equal(Zotero.File.getContentsAsync(newDBFile + '.bak'), str2);
		if (!options.skipStorageFile1) {
			yield assert.eventually.equal(
				Zotero.File.getContentsAsync(OS.Path.join(newStorageDir1, storageFile1)), str2
			);
		}
		yield assert.eventually.equal(
			Zotero.File.getContentsAsync(OS.Path.join(newStorageDir2, storageFile2)), str3
		);
		yield assert.eventually.equal(
			Zotero.File.getContentsAsync(OS.Path.join(newTranslatorsDir, translatorName1)), str4
		);
		yield assert.eventually.equal(
			Zotero.File.getContentsAsync(OS.Path.join(newTranslatorsDir, translatorName2)), str5
		);
		if (!options.skipNewMarker) {
			assert.isFalse(yield OS.File.exists(newMigrationMarker));
		}
		
		if (!options.skipSetDataDirectory) {
			assert.ok(stub1.calledOnce);
			assert.ok(stub1.calledWith(newDir));
		}
	});
	
	
	describe("#checkForDataDirectoryMigration()", function () {
		let stub3;
		
		before(function () {
			disableCommandMode();
		});
		
		after(function () {
			resetCommandMode();
		});
		
		it("should show error on partial failure", function* () {
			Zotero.Debug.init(true);
			yield populateDataDirectory(oldDir);
			
			let origFunc = OS.File.move;
			let stub3 = sinon.stub(OS.File, "move", function () {
				if (OS.Path.basename(arguments[0]) == storageFile1) {
					return Zotero.Promise.reject(new Error("Error"));
				}
				else {
					let args;
					if (Zotero.platformMajorVersion < 46) {
						args = Array.from(arguments);
					}
					else {
						args = arguments;
					}
					return origFunc(...args);
				}
			});
			let stub4 = sinon.stub(Zotero.File, "reveal").returns(Zotero.Promise.resolve());
			let stub5 = sinon.stub(Zotero.Utilities.Internal, "quitZotero");
			
			var promise = waitForDialog();
			yield Zotero.checkForDataDirectoryMigration(oldDir, newDir);
			Zotero.debug("Waiting for dialog");
			yield promise;
			Zotero.debug("Done waiting for dialog");
			
			assert.isTrue(stub4.calledTwice);
			assert.isTrue(stub4.getCall(0).calledWith(oldStorageDir));
			assert.isTrue(stub4.getCall(1).calledWith(newDBFile));
			assert.isTrue(stub5.called);
			
			stub3.restore();
			stub4.restore();
			stub5.restore();
		});
		
		it("should show error on full failure", function* () {
			yield populateDataDirectory(oldDir);
			
			let origFunc = OS.File.move;
			let stub3 = sinon.stub(OS.File, "move", function () {
				if (OS.Path.basename(arguments[0]) == dbFilename) {
					return Zotero.Promise.reject(new Error("Error"));
				}
				else {
					return origFunc(...arguments);
				}
			});
			let stub4 = sinon.stub(Zotero.File, "reveal").returns(Zotero.Promise.resolve());
			let stub5 = sinon.stub(Zotero.Utilities.Internal, "quitZotero");
			
			var promise = waitForDialog();
			yield Zotero.checkForDataDirectoryMigration(oldDir, newDir);
			yield promise;
			
			assert.isTrue(stub4.calledOnce);
			assert.isTrue(stub4.calledWith(oldDir));
			assert.isTrue(stub5.called);
			
			stub3.restore();
			stub4.restore();
			stub5.restore();
		});
		
		it("should remove marker if old directory doesn't exist", function* () {
			yield populateDataDirectory(newDir, oldDir);
			yield Zotero.checkForDataDirectoryMigration(newDir, newDir);
			yield checkMigration({
				skipSetDataDirectory: true
			});
		});
	});
	
	
	describe("#migrateDataDirectory()", function () {
		// Define tests and store for running in non-mv mode
		var tests = [];
		function add(desc, fn) {
			it(desc, fn);
			tests.push([desc, fn]);
		}
		
		add("should move all files and folders", function* () {
			yield populateDataDirectory(oldDir);
			yield Zotero.migrateDataDirectory(oldDir, newDir);
			yield checkMigration();
		});
		
		add("should resume partial migration with just marker copied", function* () {
			yield populateDataDirectory(oldDir);
			yield OS.File.makeDir(newDir, { unixMode: 0o755 });
			
			yield OS.File.copy(oldMigrationMarker, newMigrationMarker);
			
			yield Zotero.migrateDataDirectory(oldDir, newDir, true);
			yield checkMigration();
		});
		
		add("should resume partial migration with database moved", function* () {
			yield populateDataDirectory(oldDir);
			yield OS.File.makeDir(newDir, { unixMode: 0o755 });
			
			yield OS.File.copy(oldMigrationMarker, newMigrationMarker);
			yield OS.File.move(OS.Path.join(oldDir, dbFilename), OS.Path.join(newDir, dbFilename));
			
			yield Zotero.migrateDataDirectory(oldDir, newDir, true);
			yield checkMigration();
		});
		
		add("should resume partial migration with some storage directories moved", function* () {
			yield populateDataDirectory(oldDir);
			yield populateDataDirectory(newDir, oldDir);
			
			// Moved: DB, DB backup, one storage dir
			// Not moved: one storage dir, translators dir
			yield OS.File.remove(oldDBFile);
			yield OS.File.remove(oldDBFile + '.bak');
			yield removeDir(oldStorageDir1);
			yield removeDir(newTranslatorsDir);
			yield removeDir(newStorageDir2);
			
			yield Zotero.migrateDataDirectory(oldDir, newDir, true);
			yield checkMigration();
		});
		
		add("should move existing directory out of the way", function* () {
			yield populateDataDirectory(oldDir);
			yield OS.File.makeDir(newDir, { unixMode: 0o755 });
			yield Zotero.File.putContentsAsync(OS.Path.join(newDir, 'existing'), '');
			
			yield Zotero.migrateDataDirectory(oldDir, newDir);
			yield checkMigration();
			
			assert.isTrue(yield OS.File.exists(OS.Path.join(newDir + "-1", 'existing')));
			yield removeDir(newDir + "-1");
		});
		
		// Run all tests again without using mv
		//
		// On Windows these will just be duplicates of the above tests.
		describe("non-mv mode", function () {
			tests.forEach(arr => {
				it(arr[0] + " [non-mv]", arr[1]);
			});
			
			before(function () {
				disableCommandMode();
			});
			
			after(function () {
				resetCommandMode();
			});
			
			it("should handle partial failure", function* () {
				yield populateDataDirectory(oldDir);
				
				let origFunc = OS.File.move;
				let stub3 = sinon.stub(OS.File, "move", function () {
					if (OS.Path.basename(arguments[0]) == storageFile1) {
						return Zotero.Promise.reject(new Error("Error"));
					}
					else {
						let args;
						if (Zotero.platformMajorVersion < 46) {
							args = Array.from(arguments);
						}
						else {
							args = arguments;
						}
						return origFunc(...args);
					}
				});
				
				yield Zotero.migrateDataDirectory(oldDir, newDir);
				
				stub3.restore();
				
				yield checkMigration({
					skipOldDir: true,
					skipStorageFile1: true,
					skipNewMarker: true
				});
				
				assert.isTrue(yield OS.File.exists(OS.Path.join(oldStorageDir1, storageFile1)));
				assert.isFalse(yield OS.File.exists(OS.Path.join(oldStorageDir2, storageFile2)));
				assert.isFalse(yield OS.File.exists(oldTranslatorsDir));
				assert.isTrue(yield OS.File.exists(newMigrationMarker));
			});
		});
	});
});
